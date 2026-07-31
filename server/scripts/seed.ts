// Seed script: backfill fake users, chats, and a large message history
// to prove the app stays fast with years of chat data.
//
// Usage (from repo root):
//   SEED_USERS=20 SEED_MESSAGES=100000 npm run seed
//   SEED_FORCE=1 npm run seed   # wipe & reseed the existing dev DB
import fs from 'node:fs';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { openDb } from '../src/db.js';

const USERS = Number(process.env.SEED_USERS ?? 20);
const MESSAGES = Number(process.env.SEED_MESSAGES ?? 100_000);
const CHATS = Number(process.env.SEED_CHATS ?? 3);

function main(): void {
  const dbPath = config.dbPath;
  if (fs.existsSync(dbPath) && process.env.SEED_FORCE !== '1') {
    console.error(`DB already exists at ${dbPath}. Delete it or set SEED_FORCE=1 to reseed.`);
    process.exit(1);
  }

  const db = openDb(dbPath);
  const t0 = Date.now();
  const hash = bcrypt.hashSync('seedpass123', 4); // cheap rounds — seed users don't log in

  // ── users ────────────────────────────────────────────────────────────
  const insUser = db.prepare(
    'INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?,?,?,?)',
  );
  const userIds: number[] = [];
  db.transaction(() => {
    for (let i = 1; i <= USERS; i++) {
      const info = insUser.run(`seed_${i}`, `Seed User ${i}`, hash, t0 - i * 1000);
      userIds.push(Number(info.lastInsertRowid));
    }
  })();
  console.log(`users: ${userIds.length}`);

  // ── chats ────────────────────────────────────────────────────────────
  const insChat = db.prepare('INSERT INTO chats (type, name, created_by, created_at) VALUES (?,?,?,?)');
  const insMember = db.prepare('INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?,?,?,?)');
  const chatIds: number[] = [];
  db.transaction(() => {
    const g = insChat.run('group', 'Seed Mega Group', userIds[0], t0);
    const gid = Number(g.lastInsertRowid);
    for (const uid of userIds) {
      insMember.run(gid, uid, uid === userIds[0] ? 'admin' : 'member', t0);
    }
    chatIds.push(gid);
    for (let i = 1; i < CHATS; i++) {
      const c = insChat.run('private', null, userIds[0], t0);
      const cid = Number(c.lastInsertRowid);
      insMember.run(cid, userIds[0]!, 'member', t0);
      insMember.run(cid, userIds[i % userIds.length]!, 'member', t0);
      chatIds.push(cid);
    }
  })();
  console.log(`chats: ${chatIds.length}`);

  // ── messages (batched inserts, 1000/transaction) ────────────────────
  const insMsg = db.prepare(
    'INSERT INTO messages (chat_id, sender_id, kind, text, created_at) VALUES (?,?,?,?,?)',
  );
  const perChat = Math.ceil(MESSAGES / chatIds.length);
  const t1 = Date.now();
  let inserted = 0;
  for (const cid of chatIds) {
    db.transaction(() => {
      for (let i = 0; i < perChat; i++) {
        const sender = userIds[Math.floor(Math.random() * userIds.length)]!;
        insMsg.run(
          cid,
          sender,
          'text',
          `seed message ${i} in chat ${cid} — ${crypto.randomBytes(8).toString('hex')}`,
          t1 + i,
        );
        inserted++;
      }
    })();
  }

  // mark first user as fully-read in every chat
  const insRead = db.prepare(
    'INSERT INTO read_state (chat_id, user_id, last_read_message_id, updated_at) VALUES (?,?,?,?)',
  );
  for (const cid of chatIds) {
    const last = db.prepare('SELECT MAX(id) AS id FROM messages WHERE chat_id = ?').get(cid) as {
      id: number | null;
    };
    if (last.id) insRead.run(cid, userIds[0]!, last.id, Date.now());
  }

  const dt = Date.now() - t0;
  const insertMs = Date.now() - t1;
  const dbSize = fs.statSync(dbPath).size;
  console.log(
    `inserted ${inserted} messages in ${insertMs}ms (~${Math.round(inserted / (insertMs / 1000))} msg/s)`,
  );
  console.log(`total: ${dt}ms · db size: ${(dbSize / 1024 / 1024).toFixed(1)} MB`);
  db.close();
  console.log('seed done');
}

main();
