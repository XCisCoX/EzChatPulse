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

function uploadForm(token: string, fieldName: string, filename: string, contentType: string, body: Buffer) {
  const boundary = `----chatpulse${Date.now()}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([head, body, tail]),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
  };
}

test('upload + download round-trip: owner can fetch, content matches', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const content = Buffer.from('hello chatpulse file');

  const up = uploadForm(alice.token, 'file', 'note.txt', 'text/plain', content);
  const res = await fetch(`http://127.0.0.1:${ctx.port}/api/upload`, {
    method: 'POST',
    headers: up.headers,
    body: up.body,
  });
  assert.equal(res.status, 201);
  const { file } = (await res.json()) as any;
  assert.equal(file.name, 'note.txt');
  assert.equal(file.mime, 'text/plain');
  assert.equal(file.size, content.length);
  assert.equal(file.url, `/api/files/${file.id}`);

  // owner can fetch immediately (preview before attaching)
  const dl = await fetch(`http://127.0.0.1:${ctx.port}${file.url}`, {
    headers: { authorization: `Bearer ${alice.token}` },
  });
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get('content-type'), 'text/plain');
  assert.equal(await dl.arrayBuffer().then((b) => Buffer.from(b).toString()), 'hello chatpulse file');
});

test('persian filename: mojibake from latin1 header decode is repaired to UTF-8', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const boundary = `----chatpulse${Date.now()}`;
  const persian = 'تمرین سوم.pdf';
  // Browsers put the raw UTF-8 bytes of the filename into the Content-Disposition
  // header; busboy/multer decodes them as latin1 → mojibake. Splice the raw bytes
  // in directly so the test exercises that exact path.
  const prefix = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="`);
  const nameBytes = Buffer.from(persian, 'utf8');
  const suffix = Buffer.from(`"\r\nContent-Type: application/pdf\r\n\r\n`);
  const head = Buffer.concat([prefix, nameBytes, suffix]);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, Buffer.from('%PDF-1.4 fake'), tail]);

  const res = await fetch(`http://127.0.0.1:${ctx.port}/api/upload`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${alice.token}`,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  assert.equal(res.status, 201);
  const { file } = (await res.json()) as any;
  assert.equal(file.name, persian, 'filename must survive the latin1→UTF-8 repair');
  assert.equal(file.mime, 'application/pdf');
});

test('dedupe: same content uploads twice → same file id', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const content = Buffer.from('identical bytes');

  const first = uploadForm(alice.token, 'file', 'a.txt', 'text/plain', content);
  const r1 = await fetch(`http://127.0.0.1:${ctx.port}/api/upload`, { method: 'POST', headers: first.headers, body: first.body });
  const second = uploadForm(alice.token, 'file', 'b.txt', 'text/plain', content);
  const r2 = await fetch(`http://127.0.0.1:${ctx.port}/api/upload`, { method: 'POST', headers: second.headers, body: second.body });

  const f1 = ((await r1.json()) as any).file;
  const f2 = ((await r2.json()) as any).file;
  assert.equal(f1.id, f2.id);
});

test('empty file is rejected', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const up = uploadForm(alice.token, 'file', 'empty.txt', 'text/plain', Buffer.alloc(0));
  const res = await fetch(`http://127.0.0.1:${ctx.port}/api/upload`, { method: 'POST', headers: up.headers, body: up.body });
  assert.equal(res.status, 400);
});

test('image message: receiver gets file metadata and can download', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const chatId = await createPrivateChat(alice.token, bob.user.id);

  // 1x1 red PNG
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  const up = uploadForm(alice.token, 'file', 'pixel.png', 'image/png', png);
  const upRes = await fetch(`http://127.0.0.1:${ctx.port}/api/upload`, { method: 'POST', headers: up.headers, body: up.body });
  const { file } = (await upRes.json()) as any;

  const wsA = await wsConnectAuthed(ctx.port, alice.token);
  const wsB = await wsConnectAuthed(ctx.port, bob.token);
  wsA.send(JSON.stringify({ t: 'msg.send', cid: chatId, tempId: 'img1', kind: 'image', fileId: file.id }));

  const ack = await waitForMessage(wsA, (m) => m.t === 'msg.ack');
  assert.equal(ack.msg.kind, 'image');
  assert.equal(ack.msg.file.id, file.id);
  assert.equal(ack.msg.file.mime, 'image/png');

  const fresh = await waitForMessage(wsB, (m) => m.t === 'msg.new');
  assert.equal(fresh.msg.kind, 'image');
  assert.equal(fresh.msg.file.url, `/api/files/${file.id}`);

  // receiver can download (member access)
  const dl = await fetch(`http://127.0.0.1:${ctx.port}${fresh.msg.file.url}`, {
    headers: { authorization: `Bearer ${bob.token}` },
  });
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get('content-disposition')?.includes('inline'), true, 'images served inline');

  wsA.close();
  wsB.close();
});

test('non-member cannot download a file attached to a chat', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  const bob = await registerUser(ctx, 'bob', 'Bob', 'password123');
  const carol = await registerUser(ctx, 'carol', 'Carol', 'password123');
  const chatId = await createPrivateChat(alice.token, bob.user.id);

  const content = Buffer.from('secret file');
  const up = uploadForm(alice.token, 'file', 'secret.txt', 'text/plain', content);
  const upRes = await fetch(`http://127.0.0.1:${ctx.port}/api/upload`, { method: 'POST', headers: up.headers, body: up.body });
  const { file } = (await upRes.json()) as any;

  const wsA = await wsConnectAuthed(ctx.port, alice.token);
  wsA.send(JSON.stringify({ t: 'msg.send', cid: chatId, tempId: 'f1', kind: 'file', fileId: file.id }));
  await waitForMessage(wsA, (m) => m.t === 'msg.ack');
  wsA.close();

  const dl = await fetch(`http://127.0.0.1:${ctx.port}${file.url}`, {
    headers: { authorization: `Bearer ${carol.token}` },
  });
  assert.equal(dl.status, 403);
});

test('oversized upload is rejected', async () => {
  const alice = await registerUser(ctx, 'alice', 'Alice', 'password123');
  // 25 MB cap — send a 26 MB buffer
  const big = Buffer.alloc(26 * 1024 * 1024, 0x41);
  const up = uploadForm(alice.token, 'file', 'big.bin', 'application/octet-stream', big);
  const res = await fetch(`http://127.0.0.1:${ctx.port}/api/upload`, { method: 'POST', headers: up.headers, body: up.body });
  assert.equal(res.status, 400);
});
