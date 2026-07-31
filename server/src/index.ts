import fs from 'node:fs';
import https from 'node:https';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { config } from './config.js';

const app = express();
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

const server = https.createServer(
  {
    cert: fs.readFileSync(config.certPath),
    key: fs.readFileSync(config.keyPath),
  },
  app,
);

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', (data) => {
    // M0: minimal echo protocol — ping/pong round-trip.
    let msg: { t?: string };
    try {
      msg = JSON.parse(String(data));
    } catch {
      ws.send(JSON.stringify({ t: 'error', code: 'BAD_REQUEST', message: 'invalid json' }));
      return;
    }
    if (msg.t === 'ping') {
      ws.send(JSON.stringify({ t: 'pong', ts: Date.now() }));
    }
  });
});

server.listen(config.port, config.host, () => {
  console.log(`chatpulse server listening on https://${config.host}:${config.port}`);
  console.log(`  ws endpoint:   wss://localhost:${config.port}/ws`);
  console.log(`  health check:  https://localhost:${config.port}/api/health`);
});
