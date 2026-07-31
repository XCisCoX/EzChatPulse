// Load test: N simulated users over real WebSockets, each sending M messages
// to a shared group chat. Reports latency percentiles, throughput, memory.
//
// Usage (from repo root):
//   LOAD_USERS=50 LOAD_MSGS=200 npm run loadtest
import https from 'node:https';
import fs from 'node:fs';
import WebSocket from 'ws';

const BASE = process.env.LOAD_BASE ?? 'https://localhost:8443';
const USERS = Number(process.env.LOAD_USERS ?? 50);
const MSGS_PER_USER = Number(process.env.LOAD_MSGS ?? 200);

function request(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = opts.body ? JSON.stringify(opts.body) : null;
    const req = https.request(
      BASE + path,
      {
        method: opts.method ?? 'GET',
        rejectUnauthorized: false,
        headers: {
          ...(data ? { 'content-type': 'application/json' } : {}),
          ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        },
      },
      (res) => {
        let chunk = '';
        res.on('data', (c) => (chunk += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(chunk || '{}') }));
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function connectAuthed(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace(/^http/, 'ws') + '/ws', { rejectUnauthorized: false });
    const timer = setTimeout(() => reject(new Error('ws connect timeout')), 5000);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', token })));
    ws.on('message', (d) => {
      const msg = JSON.parse(String(d));
      if (msg.t === 'ready') {
        clearTimeout(timer);
        resolve(ws);
      }
    });
    ws.on('error', reject);
  });
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

async function main(): Promise<void> {
  const t0 = performance.now();
  console.log(`loadtest: ${USERS} users × ${MSGS_PER_USER} msgs on ${BASE}`);

  // ── users ────────────────────────────────────────────────────────────
  const sessions: Array<{ token: string; id: number }> = [];
  for (let i = 1; i <= USERS; i++) {
    const username = `load_${i}`;
    const reg = await request('/api/register', {
      method: 'POST',
      body: { username, displayName: `Load ${i}`, password: 'loadtest123' },
    });
    if (reg.status === 409) {
      const login = await request('/api/login', {
        method: 'POST',
        body: { username, password: 'loadtest123' },
      });
      sessions.push({ token: login.body.token, id: login.body.user.id });
    } else {
      sessions.push({ token: reg.body.token, id: reg.body.user.id });
    }
  }

  // ── shared group chat ────────────────────────────────────────────────
  const chat = await request('/api/chats', {
    method: 'POST',
    token: sessions[0]!.token,
    body: {
      type: 'group',
      name: `Load Test ${Date.now() % 100000}`,
      userIds: sessions.slice(1).map((s) => s.id),
    },
  });
  if (chat.status !== 201) {
    console.error('failed to create chat:', JSON.stringify(chat));
    process.exit(1);
  }
  const chatId = chat.body.chatId as number;
  console.log(`chat ${chatId} ready`);

  // ── connect all sockets ──────────────────────────────────────────────
  const sockets = await Promise.all(sessions.map((s) => connectAuthed(s.token)));
  console.log(`connected ${sockets.length} sockets`);

  // ── fire messages ────────────────────────────────────────────────────
  const latencies: number[] = [];
  const errors: string[] = [];
  let sent = 0;
  let acks = 0;

  const t1 = performance.now();
  await Promise.all(
    sockets.map((ws, i) =>
      (async () => {
        for (let m = 1; m <= MSGS_PER_USER; m++) {
          const tempId = `u${i}-m${m}`;
          const start = performance.now();
          await new Promise<void>((resolve) => {
            const onMsg = (d: unknown) => {
              const msg = JSON.parse(String(d));
              if (msg.t === 'msg.ack' && msg.tempId === tempId) {
                latencies.push(performance.now() - start);
                acks++;
                ws.off('message', onMsg);
                resolve();
              } else if (msg.t === 'error') {
                errors.push(`${tempId}: ${msg.code} ${msg.message}`);
                ws.off('message', onMsg);
                resolve();
              }
            };
            ws.on('message', onMsg);
            ws.send(
              JSON.stringify({
                t: 'msg.send',
                cid: chatId,
                tempId,
                text: `load message ${m} from user ${i}`,
              }),
            );
          });
          sent++;
        }
      })(),
    ),
  );
  const dt = performance.now() - t1;

  // ── report ───────────────────────────────────────────────────────────
  const sorted = [...latencies].sort((a, b) => a - b);
  const mem = process.memoryUsage();
  const dbPath = new URL('../../data/chatpulse.db', import.meta.url).pathname;
  const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

  console.log('──────────────────────────────────────────');
  console.log(`messages sent:   ${sent}`);
  console.log(`acks received:   ${acks}`);
  console.log(`errors:          ${errors.length}${errors.length ? ' — ' + errors.slice(0, 3).join('; ') : ''}`);
  console.log(`duration:        ${(dt / 1000).toFixed(1)}s`);
  console.log(`throughput:      ${Math.round((sent / (dt / 1000)))} msg/s`);
  console.log(`ack p50:         ${pct(sorted, 50).toFixed(1)} ms`);
  console.log(`ack p95:         ${pct(sorted, 95).toFixed(1)} ms`);
  console.log(`ack p99:         ${pct(sorted, 99).toFixed(1)} ms`);
  console.log(`server RSS:      ${(mem.rss / 1024 / 1024).toFixed(0)} MB`);
  console.log(`db size:         ${(dbSize / 1024 / 1024).toFixed(1)} MB`);

  // ── history page latency at the end ──────────────────────────────────
  const t2 = performance.now();
  const hist = await request(`/api/chats/${chatId}/messages?limit=50`, { token: sessions[0]!.token });
  console.log(`history page:    ${(performance.now() - t2).toFixed(1)} ms (${hist.body.messages?.length ?? 0} msgs, status ${hist.status})`);

  sockets.forEach((ws) => ws.close());
  console.log('loadtest done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
