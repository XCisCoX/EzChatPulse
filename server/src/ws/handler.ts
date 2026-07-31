import type { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { register, unregister, isOnline } from './hub.js';
import { scheduleLastSeen } from '../presence.js';

const AUTH_TIMEOUT_MS = 5000;

/* Extend WebSocket with an optional userId property. */
type ExtSocket = WebSocket & { userId?: number };

export function handleConnection(raw: WebSocket): void {
  const ws = raw as ExtSocket;
  let authed = false;

  const timer = setTimeout(() => {
    if (!authed) ws.close(4001, 'Auth timeout');
  }, AUTH_TIMEOUT_MS);

  ws.on('message', (data) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(data));
    } catch {
      sendError(ws, 'BAD_REQUEST', 'Invalid JSON');
      return;
    }

    // ── Auth handshake ─────────────────────────────────────────
    if (msg.t === 'auth' && typeof msg.token === 'string') {
      try {
        const payload = jwt.verify(msg.token, config.jwtSecret) as jwt.JwtPayload;
        const sub = Number(payload.sub);
        if (!Number.isInteger(sub)) throw new Error('invalid sub');
        clearTimeout(timer);
        authed = true;
        ws.userId = sub;
        register(ws.userId, ws);

        ws.send(JSON.stringify({ t: 'ready', userId: ws.userId }));
      } catch {
        sendError(ws, 'AUTH_FAILED', 'Invalid or expired token');
      }
      return;
    }

    // ── All messages after auth ────────────────────────────────
    if (!ws.userId) {
      sendError(ws, 'AUTH_REQUIRED', 'Send {t:"auth", token:...} first');
      return;
    }

    switch (msg.t) {
      // Future types: msg.send, typing, read
      default:
        sendError(ws, 'UNKNOWN_TYPE', `Unknown message type: ${msg.t}`);
    }
  });

  ws.on('close', () => {
    clearTimeout(timer);
    if (ws.userId) {
      unregister(ws.userId, ws);
      if (!isOnline(ws.userId)) {
        scheduleLastSeen(ws.userId);
      }
    }
  });

  ws.on('error', () => {
    /* close event will fire next */

  });
}

function sendError(ws: WebSocket, code: string, message: string): void {
  ws.send(JSON.stringify({ t: 'error', code, message }));
}
