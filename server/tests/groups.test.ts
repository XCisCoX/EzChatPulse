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

async function createGroup(token: string, name: string, userIds: number[]): Promise<number> {
  const res = await authed('/api/chats', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'group', name, userIds }),
  });
  assert.equal(res.status, 201, `create group failed: ${res.status}`);
  return ((await res.json()) as any).chatId as number;
}

// ── Creation ────────────────────────────────────────────────────────────

test('create group: creator is admin, all members receive chat.created', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const carol = await registerUser(ctx, 'carol', 'Carol', 'password123');

  const wsA = await wsConnectAuthed(ctx.port, alice.token);
  const wsB = await wsConnectAuthed(ctx.port, bob.token);
  const wsC = await wsConnectAuthed(ctx.port, carol.token);

  const chatId = await createGroup(alice.token, 'Dev Team', [bob.user.id, carol.user.id]);

  // Both members get chat.created
  const evtB = await waitForMessage(wsB, (m) => m.t === 'chat.created' && m.chat.id === chatId);
  assert.equal(evtB.chat.name, 'Dev Team');
  assert.equal(evtB.chat.members.length, 3);
  const evtC = await waitForMessage(wsC, (m) => m.t === 'chat.created' && m.chat.id === chatId);
  assert.equal(evtC.chat.members.length, 3);

  // Roles
  const detail = await (await authed(`/api/chats/${chatId}`, alice.token)).json();
  const aliceMember = detail.chat.members.find((m: any) => m.userId === alice.user.id);
  const bobMember = detail.chat.members.find((m: any) => m.userId === bob.user.id);
  assert.equal(aliceMember.role, 'admin');
  assert.equal(bobMember.role, 'member');

  wsA.close(); wsB.close(); wsC.close();
});

test('create group with unknown user returns 404', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const res = await authed('/api/chats', alice.token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'group', name: 'Bad', userIds: [999999] }),
  });
  assert.equal(res.status, 404);
});

test('group chat appears in listChats with name and members', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  await createGroup(alice.token, 'Dev Team', [bob.user.id]);

  const chats = await (await authed('/api/chats', alice.token)).json();
  const group = chats.chats.find((c: any) => c.type === 'group');
  assert.equal(group.name, 'Dev Team');
  assert.equal(group.members.length, 2);
});

// ── Group messaging fan-out ─────────────────────────────────────────────

test('group message fans out to all online members', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const carol = await registerUser(ctx, 'carol', 'Carol', 'password123');
  const chatId = await createGroup(alice.token, 'Dev Team', [bob.user.id, carol.user.id]);

  const wsA = await wsConnectAuthed(ctx.port, alice.token);
  const wsB = await wsConnectAuthed(ctx.port, bob.token);
  const wsC = await wsConnectAuthed(ctx.port, carol.token);

  wsA.send(JSON.stringify({ t: 'msg.send', cid: chatId, tempId: 'g1', text: 'meeting at 5' }));

  const ack = await waitForMessage(wsA, (m) => m.t === 'msg.ack');
  const evtB = await waitForMessage(wsB, (m) => m.t === 'msg.new');
  const evtC = await waitForMessage(wsC, (m) => m.t === 'msg.new');
  assert.equal(evtB.msg.id, ack.msg.id);
  assert.equal(evtC.msg.id, ack.msg.id);
  assert.equal(evtB.msg.text, 'meeting at 5');

  wsA.close(); wsB.close(); wsC.close();
});

// ── Membership management ───────────────────────────────────────────────

test('add member: admin adds, new member gets chat.created and can send', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const carol = await registerUser(ctx, 'carol', 'Carol', 'password123');
  const chatId = await createGroup(alice.token, 'Dev Team', [bob.user.id]);

  const wsA = await wsConnectAuthed(ctx.port, alice.token);
  const wsB = await wsConnectAuthed(ctx.port, bob.token);
  const wsC = await wsConnectAuthed(ctx.port, carol.token);

  const res = await authed(`/api/chats/${chatId}/members`, alice.token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: carol.user.id }),
  });
  assert.equal(res.status, 200);

  // Existing members see the added event with updated chat summary
  const addEvt = await waitForMessage(wsB, (m) => m.t === 'chat.member' && m.action === 'added');
  assert.equal(addEvt.userId, carol.user.id);
  assert.equal(addEvt.chat.members.length, 3);

  // Carol gets the chat and can now send to it
  const createdEvt = await waitForMessage(wsC, (m) => m.t === 'chat.created');
  assert.equal(createdEvt.chat.id, chatId);
  wsC.send(JSON.stringify({ t: 'msg.send', cid: chatId, tempId: 'c1', text: 'hi from carol' }));
  const ack = await waitForMessage(wsC, (m) => m.t === 'msg.ack');
  assert.equal(ack.msg.text, 'hi from carol');

  wsA.close(); wsB.close(); wsC.close();
});

test('non-admin cannot add members', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const carol = await registerUser(ctx, 'carol', 'Carol', 'password123');
  const dave = await registerUser(ctx, 'dave', 'Dave', 'password123');
  const chatId = await createGroup(alice.token, 'Dev Team', [bob.user.id, carol.user.id]);

  const res = await authed(`/api/chats/${chatId}/members`, bob.token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: dave.user.id }),
  });
  assert.equal(res.status, 403);
});

test('remove member: kicked user loses access, gets chat.removed', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const carol = await registerUser(ctx, 'carol', 'Carol', 'password123');
  const chatId = await createGroup(alice.token, 'Dev Team', [bob.user.id, carol.user.id]);

  const wsB = await wsConnectAuthed(ctx.port, bob.token);
  const wsC = await wsConnectAuthed(ctx.port, carol.token);

  const res = await authed(`/api/chats/${chatId}/members`, alice.token, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: carol.user.id }),
  });
  assert.equal(res.status, 200);

  // Carol is notified and removed
  const removedEvt = await waitForMessage(wsC, (m) => m.t === 'chat.removed');
  assert.equal(removedEvt.cid, chatId);

  // Bob sees the membership change
  const memberEvt = await waitForMessage(wsB, (m) => m.t === 'chat.member' && m.action === 'removed');
  assert.equal(memberEvt.userId, carol.user.id);

  // Carol can no longer send or read history
  wsC.send(JSON.stringify({ t: 'msg.send', cid: chatId, tempId: 'x', text: 'am i still in?' }));
  const err = await waitForMessage(wsC, (m) => m.t === 'error');
  assert.equal(err.code, 'FORBIDDEN');
  const history = await authed(`/api/chats/${chatId}/messages`, carol.token);
  assert.equal(history.status, 403);

  wsB.close(); wsC.close();
});

test('admin cannot remove themselves', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const chatId = await createGroup(alice.token, 'Dev Team', [bob.user.id]);

  const res = await authed(`/api/chats/${chatId}/members`, alice.token, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: alice.user.id }),
  });
  assert.equal(res.status, 400);
});
