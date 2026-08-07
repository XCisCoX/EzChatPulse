import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestContext,
  destroyTestContext,
  registerUser,
  wsConnectAuthed,
  waitForMessage,
  seedMessages,
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

async function createPrivateChat(token: string, otherUserId: number): Promise<number> {
  const res = await authed('/api/chats', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'private', userId: otherUserId }),
  });
  assert.equal(res.status, 201, `create chat failed: ${res.status}`);
  return ((await res.json()) as any).chatId as number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Real-time delivery ──────────────────────────────────────────────────

test('send: sender gets msg.ack, receiver gets msg.new with same id', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const chatId = await createPrivateChat(alice.token, bob.user.id);

  const wsA = await wsConnectAuthed(ctx.port, alice.token);
  const wsB = await wsConnectAuthed(ctx.port, bob.token);

  wsA.send(JSON.stringify({ t: 'msg.send', cid: chatId, tempId: 'tmp-1', text: 'hello bob' }));

  const ack = await waitForMessage(wsA, (m) => m.t === 'msg.ack');
  assert.equal(ack.tempId, 'tmp-1');
  assert.equal(ack.msg.text, 'hello bob');
  assert.equal(ack.msg.chatId, chatId);
  assert.equal(ack.msg.senderId, alice.user.id);
  assert.ok(ack.msg.id > 0 && Number.isInteger(ack.msg.id));

  const fresh = await waitForMessage(wsB, (m) => m.t === 'msg.new');
  assert.equal(fresh.msg.id, ack.msg.id);
  assert.equal(fresh.msg.text, 'hello bob');

  wsA.close();
  wsB.close();
});

test('sender does not receive msg.new for own message', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const chatId = await createPrivateChat(alice.token, bob.user.id);

  const wsA = await wsConnectAuthed(ctx.port, alice.token);
  const wsB = await wsConnectAuthed(ctx.port, bob.token);

  wsA.send(JSON.stringify({ t: 'msg.send', cid: chatId, tempId: 't', text: 'hi' }));
  await waitForMessage(wsA, (m) => m.t === 'msg.ack');
  await waitForMessage(wsB, (m) => m.t === 'msg.new');
  await sleep(150);

  assert.ok(!wsA.messages.some((m) => m.t === 'msg.new'), 'sender must not receive own msg.new');

  wsA.close();
  wsB.close();
});

test('non-member cannot send or read history', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const carol = await registerUser(ctx, 'carol', 'Carol', 'password123');
  const chatId = await createPrivateChat(alice.token, bob.user.id);

  const wsC = await wsConnectAuthed(ctx.port, carol.token);
  wsC.send(JSON.stringify({ t: 'msg.send', cid: chatId, tempId: 'x', text: 'intrusion' }));
  const err = await waitForMessage(wsC, (m) => m.t === 'error');
  assert.equal(err.code, 'FORBIDDEN');
  wsC.close();

  const history = await authed(`/api/chats/${chatId}/messages`, carol.token);
  assert.equal(history.status, 403);
});

// ── Persistence & keyset pagination ─────────────────────────────────────

test('history paginates 120 messages in 50/50/20 pages, newest first, no overlap', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const chatId = await createPrivateChat(alice.token, bob.user.id);
  seedMessages(ctx.db, chatId, alice.user.id, 120);

  const page1 = await (await authed(`/api/chats/${chatId}/messages?limit=50`, bob.token)).json();
  assert.equal(page1.messages.length, 50);
  assert.equal(page1.messages[0].text, 'msg 120'); // newest first
  const lastOfPage1 = page1.messages[49].id;

  const page2 = await (await authed(`/api/chats/${chatId}/messages?limit=50&before=${lastOfPage1}`, bob.token)).json();
  assert.equal(page2.messages.length, 50);
  assert.ok(page2.messages[0].id < lastOfPage1, 'pages must not overlap');
  const lastOfPage2 = page2.messages[49].id;

  const page3 = await (await authed(`/api/chats/${chatId}/messages?limit=50&before=${lastOfPage2}`, bob.token)).json();
  assert.equal(page3.messages.length, 20);
  assert.equal(page3.messages[19].text, 'msg 1'); // oldest message is last

  // Full reconstruction matches 1..120 exactly
  const all = [...page1.messages, ...page2.messages, ...page3.messages].map((m) => m.text).reverse();
  assert.deepEqual(all, Array.from({ length: 120 }, (_, i) => `msg ${i + 1}`));
});

test('message persists after both sockets disconnect', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const chatId = await createPrivateChat(alice.token, bob.user.id);

  const wsA = await wsConnectAuthed(ctx.port, alice.token);
  wsA.send(JSON.stringify({ t: 'msg.send', cid: chatId, tempId: 't', text: 'persist me' }));
  await waitForMessage(wsA, (m) => m.t === 'msg.ack');
  wsA.close();
  await sleep(100);

  const history = await (await authed(`/api/chats/${chatId}/messages`, bob.token)).json();
  assert.equal(history.messages.length, 1);
  assert.equal(history.messages[0].text, 'persist me');
});

// ── Unread counts & read receipts ───────────────────────────────────────

test('unread count reflects messages sent while offline; read resets it', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const chatId = await createPrivateChat(alice.token, bob.user.id);

  // Alice sends 3 messages while Bob is offline
  const wsA = await wsConnectAuthed(ctx.port, alice.token);
  for (let i = 1; i <= 3; i++) {
    wsA.send(JSON.stringify({ t: 'msg.send', cid: chatId, tempId: `t${i}`, text: `msg ${i}` }));
    await waitForMessage(wsA, (m) => m.t === 'msg.ack');
  }

  // Bob's chat list shows unread=3 and the last message
  const chats = await (await authed('/api/chats', bob.token)).json();
  assert.equal(chats.chats.length, 1);
  assert.equal(chats.chats[0].unread, 3);
  assert.equal(chats.chats[0].lastMessage.text, 'msg 3');
  assert.equal(chats.chats[0].members.length, 2);

  // Alice's own messages must NOT count as unread for her (CP-15)
  const aliceChatsOwn = await (await authed('/api/chats', alice.token)).json();
  assert.equal(aliceChatsOwn.chats[0].unread, 0, 'own messages are never unread');

  // Bob connects, reads, and alice gets the read event
  const wsB = await wsConnectAuthed(ctx.port, bob.token);
  wsB.send(JSON.stringify({ t: 'read', cid: chatId, msgId: chats.chats[0].lastMessage.id }));
  const readEvent = await waitForMessage(wsA, (m) => m.t === 'read');
  assert.equal(readEvent.userId, bob.user.id);
  assert.equal(readEvent.msgId, chats.chats[0].lastMessage.id);

  const chatsAfter = await (await authed('/api/chats', bob.token)).json();
  assert.equal(chatsAfter.chats[0].unread, 0);

  // Alice's chat DTO now carries Bob's read cursor (drives ✓✓ ticks after reload)
  const aliceChats = await (await authed('/api/chats', alice.token)).json();
  const readBy: { userId: number; msgId: number }[] = aliceChats.chats[0].readBy ?? [];
  assert.ok(
    readBy.some((r) => r.userId === bob.user.id && r.msgId === chats.chats[0].lastMessage.id),
    'alice chat DTO should include bob readBy cursor',
  );

  wsA.close();
  wsB.close();
});

test('read cursor is monotonic (older reads do not move it back)', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const chatId = await createPrivateChat(alice.token, bob.user.id);
  seedMessages(ctx.db, chatId, alice.user.id, 10);

  const wsB = await wsConnectAuthed(ctx.port, bob.token);
  wsB.send(JSON.stringify({ t: 'read', cid: chatId, msgId: 10 }));
  await sleep(50);
  wsB.send(JSON.stringify({ t: 'read', cid: chatId, msgId: 5 })); // backwards
  await sleep(50);

  const chats = await (await authed('/api/chats', bob.token)).json();
  assert.equal(chats.chats[0].unread, 0); // still fully read
  wsB.close();
});

// ── Validation ──────────────────────────────────────────────────────────

test('empty text is rejected', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const chatId = await createPrivateChat(alice.token, bob.user.id);

  const wsA = await wsConnectAuthed(ctx.port, alice.token);
  wsA.send(JSON.stringify({ t: 'msg.send', cid: chatId, tempId: 't', text: '   ' }));
  const err = await waitForMessage(wsA, (m) => m.t === 'error');
  assert.equal(err.code, 'BAD_REQUEST');
  wsA.close();
});

test('text longer than 4096 chars is rejected', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const chatId = await createPrivateChat(alice.token, bob.user.id);

  const wsA = await wsConnectAuthed(ctx.port, alice.token);
  wsA.send(JSON.stringify({ t: 'msg.send', cid: chatId, tempId: 't', text: 'x'.repeat(5000) }));
  const err = await waitForMessage(wsA, (m) => m.t === 'error');
  assert.equal(err.code, 'BAD_REQUEST');
  wsA.close();
});

test('unknown chat id in history returns 403 (not member)', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const res = await authed('/api/chats/99999/messages', alice.token);
  assert.equal(res.status, 403);
});

test('findOrCreatePrivate is idempotent', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const first = await createPrivateChat(alice.token, bob.user.id);
  const second = await createPrivateChat(bob.token, alice.user.id); // other direction
  assert.equal(first, second, 'same chat must be reused');

  const chats = await (await authed('/api/chats', alice.token)).json();
  assert.equal(chats.chats.length, 1, 'no duplicate chat rows');
});
