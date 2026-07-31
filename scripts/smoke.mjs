// Smoke test: full auth flow against the live server.
// health -> register -> login -> /api/me -> ws auth handshake.
// Idempotent: if the smoke user already exists, it just logs in.
// Usage: node scripts/smoke.mjs   (BASE env var optional, default https://localhost:8443)
import https from 'node:https';
import WebSocket from 'ws';

const BASE = process.env.BASE ?? 'https://localhost:8443';
const USERNAME = 'smoke_test';

function request(path, { method = 'GET', body, token } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      BASE + path,
      {
        method,
        rejectUnauthorized: false,
        headers: {
          ...(data ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
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

function fail(msg) {
  console.error(`SMOKE FAILED: ${msg}`);
  process.exit(1);
}

// 1. health
const health = await request('/api/health');
console.log(`health: ${health.status} ${JSON.stringify(health.body)}`);
if (health.status !== 200) fail('health check');

// 2. register (idempotent)
const reg = await request('/api/register', {
  method: 'POST',
  body: { username: USERNAME, displayName: 'Smoke Test', password: 'smoketest123' },
});
if (reg.status === 409) console.log('register: 409 (user exists, will login)');
else if (reg.status === 201) console.log(`register: 201 (${reg.body.user.username})`);
else fail(`register (${reg.status}): ${JSON.stringify(reg.body)}`);

// 3. login
const login = await request('/api/login', {
  method: 'POST',
  body: { username: USERNAME, password: 'smoketest123' },
});
console.log(`login: ${login.status} online=${login.body.user?.online}`);
if (login.status !== 200) fail('login');
const token = login.body.token;

// 4. /api/me
const me = await request('/api/me', { token });
console.log(`me: ${me.status} ${me.body.user?.username}`);
if (me.status !== 200) fail('/api/me');

// 5. ws auth handshake
const wsReady = await new Promise((resolve, reject) => {
  const ws = new WebSocket(BASE.replace(/^http/, 'ws') + '/ws', { rejectUnauthorized: false });
  const timer = setTimeout(() => reject(new Error('ws ready timeout')), 3000);
  ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', token })));
  ws.on('message', (d) => {
    const msg = JSON.parse(String(d));
    if (msg.t === 'ready') {
      clearTimeout(timer);
      ws.close();
      resolve(msg);
    }
  });
  ws.on('error', reject);
});
console.log(`ws auth -> ready: ${JSON.stringify(wsReady)}`);
if (wsReady.t !== 'ready') fail('ws auth handshake');

console.log('smoke OK');
