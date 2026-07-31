// Smoke test: hits /api/health over HTTPS and round-trips a WS ping.
// Usage: node scripts/smoke.mjs   (BASE env var optional, default https://localhost:8443)
import https from 'node:https';
import WebSocket from 'ws';

const BASE = process.env.BASE ?? 'https://localhost:8443';

function health() {
  return new Promise((resolve, reject) => {
    https
      .get(`${BASE}/api/health`, { rejectUnauthorized: false }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
      })
      .on('error', reject);
  });
}

function wsPing() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws`, {
      rejectUnauthorized: false,
    });
    const timer = setTimeout(() => reject(new Error('ws ping timeout')), 3000);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'ping' })));
    ws.on('message', (data) => {
      clearTimeout(timer);
      ws.close();
      resolve(JSON.parse(String(data)));
    });
    ws.on('error', reject);
  });
}

const [h, p] = await Promise.all([health(), wsPing()]);
console.log(`health: ${h.status} ${JSON.stringify(h.body)}`);
console.log(`ws ping -> pong: ${JSON.stringify(p)}`);
if (h.status !== 200 || p.t !== 'pong') {
  console.error('SMOKE FAILED');
  process.exit(1);
}
console.log('smoke OK');
