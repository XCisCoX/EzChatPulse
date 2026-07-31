import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';

test('schema creates all tables', () => {
  const db = openDb(':memory:');
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
    name: string;
  }[];
  const names = rows.map((r) => r.name).sort();
  for (const expected of [
    'users',
    'chats',
    'chat_members',
    'files',
    'messages',
    'read_state',
    'schema_migrations',
  ]) {
    assert.ok(names.includes(expected), `missing table: ${expected}`);
  }
  db.close();
});

test('WAL mode is active on file databases', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatpulse-'));
  try {
    const db = openDb(path.join(dir, 'test.db'));
    const mode = db.pragma('journal_mode', { simple: true }) as unknown as string;
    assert.equal(mode, 'wal');
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('user row round-trips', () => {
  const db = openDb(':memory:');
  const info = db
    .prepare('INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run('alice', 'Alice', 'hash', Date.now());
  const user = db
    .prepare('SELECT id, username, display_name FROM users WHERE id = ?')
    .get(info.lastInsertRowid) as { id: number; username: string; display_name: string };
  assert.equal(user.username, 'alice');
  assert.equal(user.display_name, 'Alice');
  db.close();
});

test('schema_migrations seeded with version 1', () => {
  const db = openDb(':memory:');
  const row = db.prepare('SELECT version FROM schema_migrations').get() as { version: number };
  assert.equal(row.version, 1);
  db.close();
});
