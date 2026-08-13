import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, destroyTestContext, registerUser, type TestContext } from './helpers.js';

// admins are whoever is on the ADMIN_USERNAMES list (read lazily at request time)
process.env.ADMIN_USERNAMES = 'admin';

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

test('admin endpoints return 403 for non-admin users', async () => {
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  for (const path of ['/api/admin/stats', '/api/admin/users']) {
    const res = await authed(path, bob.token);
    assert.equal(res.status, 403, `${path} must be forbidden for non-admins`);
  }
  const reset = await authed('/api/admin/users/1/reset-password', bob.token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ newPassword: 'hackedpass1' }),
  });
  assert.equal(reset.status, 403);
});

test('admin stats report counts, uptime, and registration state', async () => {
  const admin = await registerUser(ctx, 'admin', 'Admin', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  // one chat + one message so counts are non-zero
  const chat = await authed('/api/chats', admin.token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'private', userId: bob.user.id }),
  });
  const chatId = ((await chat.json()) as any).chatId as number;
  const { WebSocket } = await import('ws');
  const ws = new WebSocket(`ws://127.0.0.1:${ctx.port}/ws`);
  await new Promise((res, rej) => {
    ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', token: admin.token })));
    ws.on('message', (d) => { if (JSON.parse(String(d)).t === 'ready') res(); });
    ws.on('error', rej);
  });
  ws.send(JSON.stringify({ t: 'msg.send', cid: chatId, tempId: 't1', kind: 'text', text: 'hi' }));

  const res = await authed('/api/admin/stats', admin.token);
  assert.equal(res.status, 200);
  const stats = (await res.json()) as any;
  assert.equal(stats.users, 2);
  assert.equal(stats.chats, 1);
  assert.equal(stats.messages, 1);
  assert.equal(stats.files, 0);
  assert.ok(stats.uptimeSec > 0, 'uptime must be positive');
  assert.equal(stats.connections, 1, 'the admin ws connection counts');
  assert.equal(stats.registrationOpen, true, 'registration open by default');
  assert.ok(typeof stats.dbSizeBytes === 'number');
  ws.close();
});

test('admin can reset a user password', async () => {
  const admin = await registerUser(ctx, 'admin', 'Admin', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');

  const res = await authed(`/api/admin/users/${bob.user.id}/reset-password`, admin.token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ newPassword: 'freshpass99' }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.username, 'bob');

  // old password fails, new one works
  const oldLogin = await api('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'bob', password: 'password123' }),
  });
  assert.equal(oldLogin.status, 401);
  const newLogin = await api('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'bob', password: 'freshpass99' }),
  });
  assert.equal(newLogin.status, 200);
});

test('registration kill-switch blocks and re-opens signups', async () => {
  const admin = await registerUser(ctx, 'admin', 'Admin', 'password123');

  // close registration
  const close = await authed('/api/admin/registration', admin.token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(close.status, 200);
  assert.equal(((await close.json()) as any).registrationOpen, false);

  // new signup blocked
  const blocked = await api('/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'newbie', displayName: 'Newbie', password: 'password123' }),
  });
  assert.equal(blocked.status, 403);

  // re-open → signup works again
  const open = await authed('/api/admin/registration', admin.token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(((await open.json()) as any).registrationOpen, true);
  const allowed = await api('/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'newbie2', displayName: 'Newbie2', password: 'password123' }),
  });
  assert.equal(allowed.status, 201);
});

test('admin users list includes online state', async () => {
  const admin = await registerUser(ctx, 'admin', 'Admin', 'password123');
  const res = await authed('/api/admin/users', admin.token);
  assert.equal(res.status, 200);
  const { users } = (await res.json()) as any;
  assert.equal(users.length, 1);
  assert.equal(users[0].username, 'admin');
  assert.equal(users[0].online, false);
  assert.ok('lastSeenAt' in users[0]);
});
