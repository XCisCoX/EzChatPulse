import type { Db } from '../db.js';
import { BadRequest, Forbidden } from '../errors.js';
import { assertMember } from './membership.js';

export interface FileDTO {
  id: number;
  name: string;
  mime: string;
  size: number;
  url: string;
}

export interface MessageDTO {
  id: number;
  chatId: number;
  senderId: number;
  kind: 'text' | 'image' | 'file';
  text: string | null;
  file: FileDTO | null;
  replyTo: number | null;
  createdAt: number;
}

interface MessageRow {
  id: number;
  chat_id: number;
  sender_id: number;
  kind: 'text' | 'image' | 'file';
  text: string | null;
  reply_to: number | null;
  created_at: number;
  f_id: number | null;
  f_name: string | null;
  f_mime: string | null;
  f_size: number | null;
}

const MESSAGE_SELECT = `
  SELECT m.id, m.chat_id, m.sender_id, m.kind, m.text, m.reply_to, m.created_at,
         f.id AS f_id, f.name AS f_name, f.mime AS f_mime, f.size AS f_size
  FROM messages m
  LEFT JOIN files f ON f.id = m.file_id
`;

function rowToDTO(row: MessageRow): MessageDTO {
  return {
    id: row.id,
    chatId: row.chat_id,
    senderId: row.sender_id,
    kind: row.kind,
    text: row.text,
    replyTo: row.reply_to,
    createdAt: row.created_at,
    file: row.f_id
      ? { id: row.f_id, name: row.f_name!, mime: row.f_mime!, size: row.f_size!, url: `/api/files/${row.f_id}` }
      : null,
  };
}

export function getMessage(db: Db, id: number): MessageDTO | null {
  const row = db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(id) as MessageRow | undefined;
  return row ? rowToDTO(row) : null;
}

export interface SendInput {
  tempId?: string;
  kind?: string;
  text?: string | null;
  fileId?: number | null;
  replyTo?: number | null;
}

export interface SendResult {
  tempId: string;
  msg: MessageDTO;
}

export function sendMessage(db: Db, senderId: number, chatId: number, input: SendInput): SendResult {
  assertMember(db, chatId, senderId);

  const kind = input.kind ?? 'text';
  if (kind !== 'text' && kind !== 'image' && kind !== 'file') {
    throw new BadRequest('Invalid message kind');
  }
  const text = (input.text ?? '').trim();
  if (kind === 'text' && !text) throw new BadRequest('Message text is empty');
  if (text.length > 4096) throw new BadRequest('Message too long (max 4096 characters)');

  let fileId: number | null = null;
  if (kind === 'image' || kind === 'file') {
    fileId = Number(input.fileId);
    if (!Number.isInteger(fileId)) throw new BadRequest('fileId is required for media messages');
    const file = db.prepare('SELECT id, owner_id FROM files WHERE id = ?').get(fileId) as
      | { id: number; owner_id: number }
      | undefined;
    if (!file) throw new BadRequest('File not found');
    if (file.owner_id !== senderId) throw new Forbidden('Cannot attach a file you did not upload');
  }

  let replyTo: number | null = null;
  if (input.replyTo != null) {
    replyTo = Number(input.replyTo);
    const reply = db.prepare('SELECT id, chat_id FROM messages WHERE id = ?').get(replyTo) as
      | { id: number; chat_id: number }
      | undefined;
    if (!reply || reply.chat_id !== chatId) throw new BadRequest('reply_to must reference a message in this chat');
  }

  const now = Date.now();
  const info = db
    .prepare('INSERT INTO messages (chat_id, sender_id, kind, text, file_id, reply_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(chatId, senderId, kind, text || null, fileId, replyTo, now);

  const msg = getMessage(db, Number(info.lastInsertRowid))!;
  return { tempId: String(input.tempId ?? ''), msg };
}

/**
 * Keyset pagination — O(page size), constant time regardless of total history.
 * Returns newest-first pages; pass the oldest id seen so far as `before`.
 */
export function listMessages(db: Db, viewerId: number, chatId: number, before?: number, limit = 50): MessageDTO[] {
  assertMember(db, chatId, viewerId);
  const capped = Math.min(Math.max(Math.floor(limit), 1), 100);
  const rows = db
    .prepare(`${MESSAGE_SELECT} WHERE m.chat_id = ? AND (? IS NULL OR m.id < ?) ORDER BY m.id DESC LIMIT ?`)
    .all(chatId, before ?? null, before ?? null, capped) as MessageRow[];
  return rows.map(rowToDTO);
}

/** Advance the user's read cursor (monotonic — never goes backwards). */
export function markRead(db: Db, userId: number, chatId: number, msgId: number): void {
  assertMember(db, chatId, userId);
  db.prepare(
    `INSERT INTO read_state (chat_id, user_id, last_read_message_id, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(chat_id, user_id) DO UPDATE SET
       last_read_message_id = MAX(last_read_message_id, excluded.last_read_message_id),
       updated_at = excluded.updated_at`,
  ).run(chatId, userId, msgId, Date.now());
}
