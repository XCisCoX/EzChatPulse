import http from 'node:http';
import express from 'express';
import multer from 'multer';
import { WebSocketServer, WebSocket as RawWebSocket } from 'ws';
import { openDb, setTestDb, type Db } from '../src/db.js';
import { AppError } from '../src/errors.js';
import { resetRateLimits } from '../src/rate-limit.js';
import authRoutes from '../src/api/auth_routes.js';
import userRoutes from '../src/api/user_routes.js';
import chatRoutes from '../src/api/chat_routes.js';
import fileRoutes from '../src/api/file_routes.js';
import adminRoutes from '../src/api/admin_routes.js';
import { handleConnection } from '../src/ws/handler.js';

export interface TestContext {
  app: express.Express;
  httpServer: http.Server;
  wss: WebSocketServer;
  db: Db;
  port: number;
  close: () => Promise<void>;
}

/** Boot a full server (Express + WS) on an ephemeral port with an in-memory DB. */
export function createTestContext(): Promise<TestContext> {
  const db = openDb(':memory:');
  setTestDb(db);
  resetRateLimits(); // fresh limiter state per test

  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', authRoutes);
  app.use('/api', chatRoutes);
  app.use('/api', fileRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/admin', adminRoutes);
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else if (err instanceof multer.MulterError) {
      res.status(400).json({ error: err.message });
    } else {
      console.error('Unhandled error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  wss.on('connection', (ws: RawWebSocket) => handleConnection(ws));

  return new Promise<TestContext>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address() as { port: number };
      resolve({
        app,
        httpServer,
        wss,
        db,
        port: addr.port,
        close: async () => {
          // force-kill any client sockets a failing test left open, otherwise
          // httpServer.close() waits on them forever and the suite hangs
          for (const client of wss.clients) client.terminate();
          wss.close();
          httpServer.closeAllConnections?.();
          await new Promise<void>((r) => httpServer.close(() => r()));
          setTestDb(null);
          db.close();
        },
      });
    });
  });
}

/** Shut down a test context (WS server, HTTP server, DB). */
export async function destroyTestContext(ctx: TestContext): Promise<void> {
  await ctx.close();
}

/** Register a user via the API and return { token, user }. */
export async function registerUser(
  ctx: TestContext,
  username: string,
  displayName: string,
  password: string,
): Promise<{ token: string; user: { id: number; username: string; displayName: string } }> {
  const res = await fetch(`http://127.0.0.1:${ctx.port}/api/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, displayName, password }),
  });
  const body = (await res.json()) as any;
  if (res.status !== 201) throw new Error(`register failed (${res.status}): ${JSON.stringify(body)}`);
  return body;
}

/** Open a WebSocket connection, authenticate, and wait for {t:'ready'}. */
export function wsConnectAuthed(port: number, token: string): Promise<RawWebSocket & { messages: any[] }> {
  return new Promise((resolve, reject) => {
    const ws = new RawWebSocket(`ws://127.0.0.1:${port}/ws`) as RawWebSocket & { messages: any[] };
    ws.messages = [];
    const timer = setTimeout(() => reject(new Error('ws auth timeout')), 3000);

    ws.on('message', (data) => {
      const msg = JSON.parse(String(data));
      ws.messages.push(msg);
      if (msg.t === 'ready') {
        clearTimeout(timer);
        resolve(ws);
      }
    });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', token })));
    ws.on('error', reject);
  });
}

/** Wait until the socket receives a message matching `predicate` (or timeout). */
export function waitForMessage(
  ws: RawWebSocket & { messages: any[] },
  predicate: (msg: any) => boolean,
  timeoutMs = 2000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const found = ws.messages.find(predicate);
    if (found) return resolve(found);

    const onMsg = (data: unknown) => {
      const msg = JSON.parse(String(data));
      if (predicate(msg)) {
        cleanup();
        resolve(msg);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timed out waiting for message'));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMsg);
    };
    ws.on('message', onMsg);
  });
}

/** Insert `count` text messages directly into the DB (for pagination tests). */
export function seedMessages(db: Db, chatId: number, senderId: number, count: number, textPrefix = 'msg'): void {
  const ins = db.prepare('INSERT INTO messages (chat_id, sender_id, kind, text, created_at) VALUES (?, ?, ?, ?, ?)');
  const now = Date.now();
  db.transaction(() => {
    for (let i = 1; i <= count; i++) ins.run(chatId, senderId, 'text', `${textPrefix} ${i}`, now + i);
  })();
}
