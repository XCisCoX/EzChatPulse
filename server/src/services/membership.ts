import type { Db } from '../db.js';
import { Forbidden } from '../errors.js';

export function isMember(db: Db, chatId: number, userId: number): boolean {
  return !!db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
}

export function assertMember(db: Db, chatId: number, userId: number): void {
  if (!isMember(db, chatId, userId)) throw new Forbidden('You are not a member of this chat');
}

export function memberIds(db: Db, chatId: number): number[] {
  const rows = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chatId) as Array<{
    user_id: number;
  }>;
  return rows.map((r) => r.user_id);
}
