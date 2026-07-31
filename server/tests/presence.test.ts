import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function authed(path: string, token: string, options: RequestInit = {}) {
  return fetch(`http://127.0.0.1:${ctx.port}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
  });
}

async function createPrivateChat(token: string, otherUserId: number): Promise<number> {
  const res = await authed('/api/chats', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'private', userId: otherUserId }),
  });
  assert.equal(res.status, 201);
  return ((await res.json()) as any).chatId as number;
}

// ── Presence events ─────────────────────────────────────────────────────

test('presence: connect/disconnect broadcasts online/offline to chat members', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  await createPrivateChat(alice.token, bob.user.id);

  const wsA = await wsConnectAuthed(ctx.port, alice.token);
  const wsB = await wsConnectAuthed(ctx.port, bob.token);

  const onlineEvt = await waitForMessage(
    wsA,
    (m) => m.t === 'presence' && m.userId === bob.user.id && m.online === true,
  );
  assert.equal(onlineEvt.userId, bob.user.id);

  wsB.close();
  const offlineEvt = await waitForMessage(
    wsA,
    (m) => m.t === 'presence' && m.userId === bob.user.id && m.online === false,
  );
  assert.ok(offlineEvt.lastSeenAt > 0, 'offline event carries lastSeenAt');

  wsA.close();
});

test('presence events are not leaked to users in other chats', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const carol = await registerUser(ctx, 'carol', 'Carol', 'password123');
  const dave = await registerUser(ctx, 'dave', 'Dave', 'password123');
  await createPrivateChat(alice.token, bob.user.id);
  await createPrivateChat(carol.token, dave.user.id);

  const wsA = await wsConnectAuthed(ctx.port, alice.token);
  const wsD = await wsConnectAuthed(ctx.port, dave.token);
  wsD.close();
  await sleep(150);

  assert.ok(
    !wsA.messages.some((m) => m.t === 'presence' && m.userId === dave.user.id),
    'alice must not see dave presence events',
  );
  wsA.close();
});

test('multi-device: second socket keeps user online after first closes', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  await createPrivateChat(alice.token, bob.user.id);

  const wsA = await wsConnectAuthed(ctx.port, alice.token);
  const wsB1 = await wsConnectAuthed(ctx.port, bob.token);
  const wsB2 = await wsConnectAuthed(ctx.port, bob.token); // bob, second device

  // Bob closes one device — no offline event yet
  wsB1.close();
  await sleep(150);
  assert.ok(
    !wsA.messages.some((m) => m.t === 'presence' && m.userId === bob.user.id && m.online === false),
    'bob must stay online while a second socket is open',
  );

  // Bob closes the last device — offline event fires
  wsB2.close();
  await waitForMessage(wsA, (m) => m.t === 'presence' && m.userId === bob.user.id && m.online === false);

  wsA.close();
});

// ── Typing indicator ────────────────────────────────────────────────────

test('typing: broadcast to chat members, not to sender, debounced', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const chatId = await createPrivateChat(alice.token, bob.user.id);

  const wsA = await wsConnectAuthed(ctx.port, alice.token);
  const wsB = await wsConnectAuthed(ctx.port, bob.token);

  wsA.send(JSON.stringify({ t: 'typing', cid: chatId }));
  const typingEvt = await waitForMessage(wsB, (m) => m.t === 'typing');
  assert.equal(typingEvt.userId, alice.user.id);
  assert.equal(typingEvt.cid, chatId);

  // Debounce: an immediate second typing signal is not re-broadcast
  wsA.send(JSON.stringify({ t: 'typing', cid: chatId }));
  await sleep(300);
  assert.equal(wsB.messages.filter((m) => m.t === 'typing').length, 1);

  // Sender never receives own typing event
  assert.ok(!wsA.messages.some((m) => m.t === 'typing'));

  wsA.close();
  wsB.close();
});

test('typing from non-member is silently ignored', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const carol = await registerUser(ctx, 'carol', 'Carol', 'password123');
  const chatId = await createPrivateChat(alice.token, bob.user.id);

  const wsB = await wsConnectAuthed(ctx.port, bob.token);
  const wsC = await wsConnectAuthed(ctx.port, carol.token);

  wsC.send(JSON.stringify({ t: 'typing', cid: chatId }));
  await sleep(200);

  assert.ok(!wsB.messages.some((m) => m.t === 'typing'), 'bob must not receive carol typing');
  assert.ok(!wsC.messages.some((m) => m.t === 'error'), 'carol gets no error for typing as non-member');

  wsB.close();
  wsC.close();
});
