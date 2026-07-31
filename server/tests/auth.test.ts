import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import {
  createTestContext,
  destroyTestContext,
  registerUser,
  wsConnectAuthed,
  waitForMessage,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createTestContext();
});

afterEach(async () => {
  await destroyTestContext(ctx);
});

function api(path: string, options: RequestInit = {}) {
  return fetch(`http://127.0.0.1:${ctx.port}${path}`, options);
}

function authed(path: string, token: string, options: RequestInit = {}) {
  return api(path, {
    ...options,
    headers: { authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
  });
}

// ── Registration ────────────────────────────────────────────────────────

test('register creates a user and returns a token', async () => {
  const res = await api('/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'alice', displayName: 'Alice', password: 'password123' }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as any;
  assert.equal(body.user.username, 'alice');
  assert.equal(body.user.displayName, 'Alice');
  assert.ok(body.user.id > 0);
  assert.ok(typeof body.token === 'string' && body.token.length > 20);
});

test('register rejects duplicate username with 409', async () => {
  await registerUser(ctx, 'bob', 'Bob', 'password123');
  const res = await api('/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'bob', displayName: 'Bob2', password: 'password123' }),
  });
  assert.equal(res.status, 409);
});

test('register rejects weak username and short password', async () => {
  const badUsername = await api('/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'a!', displayName: 'X', password: 'password123' }),
  });
  assert.equal(badUsername.status, 400);

  const shortPw = await api('/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'carol', displayName: 'Carol', password: 'short' }),
  });
  assert.equal(shortPw.status, 400);
});

// ── Login ───────────────────────────────────────────────────────────────

test('login succeeds with correct credentials', async () => {
  await registerUser(ctx, 'dave', 'Dave', 'password123');
  const res = await api('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'dave', password: 'password123' }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.user.username, 'dave');
  assert.ok(body.token);
  assert.equal(body.user.online, false); // not connected yet
});

test('login rejects wrong password with 401', async () => {
  await registerUser(ctx, 'erin', 'Erin', 'password123');
  const res = await api('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'erin', password: 'wrongpass' }),
  });
  assert.equal(res.status, 401);
});

test('login rejects unknown username with 401 (no user enumeration)', async () => {
  const res = await api('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'ghost', password: 'whatever123' }),
  });
  assert.equal(res.status, 401);
});

// ── /api/me ─────────────────────────────────────────────────────────────

test('/api/me returns the authenticated user', async () => {
  const { token } = await registerUser(ctx, 'frank', 'Frank', 'password123');
  const res = await authed('/api/me', token);
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.user.username, 'frank');
});

test('/api/me rejects missing/invalid tokens', async () => {
  const noToken = await api('/api/me');
  assert.equal(noToken.status, 401);

  const badToken = await authed('/api/me', 'not.a.jwt');
  assert.equal(badToken.status, 401);
});

// ── User search ─────────────────────────────────────────────────────────

test('/api/users?q= searches by username prefix', async () => {
  await registerUser(ctx, 'alice', 'Alice', 'password123');
  await registerUser(ctx, 'bob', 'Bob', 'password123');
  const { token } = await registerUser(ctx, 'carol', 'Carol', 'password123');

  const res = await authed('/api/users?q=al', token);
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.users.length, 1);
  assert.equal(body.users[0].username, 'alice');
});

test('/api/users requires auth', async () => {
  const res = await api('/api/users?q=a');
  assert.equal(res.status, 401);
});

// ── WebSocket handshake ─────────────────────────────────────────────────

test('ws auth with valid token receives ready', async () => {
  const { token } = await registerUser(ctx, 'grace', 'Grace', 'password123');
  const ws = await wsConnectAuthed(ctx.port, token);
  assert.ok(ws.messages.some((m) => m.t === 'ready'));
  ws.close();
});

test('ws without auth receives AUTH_REQUIRED error', async () => {
  const ws = await new Promise<any>((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${ctx.port}/ws`);
    const timer = setTimeout(() => reject(new Error('timeout')), 2000);
    socket.on('message', (data: unknown) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(data)));
    });
    socket.on('open', () => socket.send(JSON.stringify({ t: 'ping' })));
    socket.on('error', reject);
  });
  assert.equal(ws.t, 'error');
  assert.equal(ws.code, 'AUTH_REQUIRED');
});

test('ws with invalid token receives AUTH_FAILED', async () => {
  const ws = await new Promise<any>((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${ctx.port}/ws`);
    const timer = setTimeout(() => reject(new Error('timeout')), 2000);
    socket.on('message', (data: unknown) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(data)));
    });
    socket.on('open', () => socket.send(JSON.stringify({ t: 'auth', token: 'bogus.token.here' })));
    socket.on('error', reject);
  });
  assert.equal(ws.t, 'error');
  assert.equal(ws.code, 'AUTH_FAILED');
});

test('online status flips true when ws connected, false after close', async () => {
  const { token, user } = await registerUser(ctx, 'heidi', 'Heidi', 'password123');

  const ws = await wsConnectAuthed(ctx.port, token);

  const res = await authed('/api/me', token);
  const body = (await res.json()) as any;
  assert.equal(body.user.online, true);

  ws.close();
  await new Promise((r) => setTimeout(r, 50));

  const res2 = await authed('/api/me', token);
  const body2 = (await res2.json()) as any;
  assert.equal(body2.user.online, false);
});

test('unknown ws message type returns UNKNOWN_TYPE error', async () => {
  const { token } = await registerUser(ctx, 'ivan', 'Ivan', 'password123');
  const ws = await wsConnectAuthed(ctx.port, token);
  ws.send(JSON.stringify({ t: 'definitely-not-real' }));
  const msg = await waitForMessage(ws, (m) => m.t === 'error');
  assert.equal(msg.code, 'UNKNOWN_TYPE');
  ws.close();
});
