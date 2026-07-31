import type { Db } from '../db.js';
import { BadRequest, NotFound } from '../errors.js';
import { isOnline } from '../ws/hub.js';
import { getMessage, type MessageDTO } from './messages.js';

export interface MemberInfo {
  userId: number;
  username: string;
  displayName: string;
  role: 'member' | 'admin';
  online: boolean;
  lastSeenAt: number | null;
}

export interface ChatDTO {
  id: number;
  type: 'private' | 'group';
  name: string | null;
  createdAt: number;
  members: MemberInfo[];
  lastMessage: MessageDTO | null;
  unread: number;
}

/** Find the private chat between two users, creating it if needed. Returns chat id. */
export function findOrCreatePrivate(db: Db, userId: number, otherId: number): number {
  if (userId === otherId) throw new BadRequest('Cannot start a chat with yourself');
  const other = db.prepare('SELECT id FROM users WHERE id = ?').get(otherId);
  if (!other) throw new NotFound('User not found');

  const [a, b] = userId < otherId ? [userId, otherId] : [otherId, userId];
  const existing = db
    .prepare(
      `SELECT c.id FROM chats c
       JOIN chat_members x ON x.chat_id = c.id AND x.user_id = ?
       JOIN chat_members y ON y.chat_id = c.id AND y.user_id = ?
       WHERE c.type = 'private'`,
    )
    .get(a, b) as { id: number } | undefined;
  if (existing) return existing.id;

  const now = Date.now();
  return db.transaction(() => {
    const info = db
      .prepare('INSERT INTO chats (type, created_by, created_at) VALUES (?, ?, ?)')
      .run('private', userId, now);
    const chatId = Number(info.lastInsertRowid);
    const ins = db.prepare('INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)');
    ins.run(chatId, a, 'member', now);
    ins.run(chatId, b, 'member', now);
    return chatId;
  })();
}

export function listMembers(db: Db, chatId: number): MemberInfo[] {
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.last_seen_at, cm.role
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.chat_id = ?
       ORDER BY cm.joined_at`,
    )
    .all(chatId) as Array<{
    id: number;
    username: string;
    display_name: string;
    last_seen_at: number | null;
    role: string;
  }>;
  return rows.map((r) => ({
    userId: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role as 'member' | 'admin',
    online: isOnline(r.id),
    lastSeenAt: r.last_seen_at,
  }));
}

/** All chats the user belongs to, newest activity first, with unread + last message. */
export function listChats(db: Db, userId: number): ChatDTO[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.type, c.name, c.created_at,
              (SELECT MAX(m.id) FROM messages m WHERE m.chat_id = c.id) AS last_msg_id,
              (SELECT COUNT(*) FROM messages m
               WHERE m.chat_id = c.id AND m.id > COALESCE(rs.last_read_message_id, 0)) AS unread,
              (SELECT MAX(m.created_at) FROM messages m WHERE m.chat_id = c.id) AS last_activity
       FROM chats c
       JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = ?
       LEFT JOIN read_state rs ON rs.chat_id = c.id AND rs.user_id = ?
       ORDER BY COALESCE(last_activity, c.created_at) DESC`,
    )
    .all(userId, userId) as Array<{
    id: number;
    type: string;
    name: string | null;
    created_at: number;
    last_msg_id: number | null;
    unread: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    type: r.type as 'private' | 'group',
    name: r.name,
    createdAt: r.created_at,
    unread: r.unread,
    lastMessage: r.last_msg_id ? getMessage(db, r.last_msg_id) : null,
    members: listMembers(db, r.id),
  }));
}
