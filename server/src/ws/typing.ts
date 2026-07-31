import { getDb } from '../db.js';
import { broadcastToChat } from './hub.js';
import { isMember } from '../services/membership.js';

const TYPING_TTL_MS = 5000; // how long a "typing" indicator stays live
const REBROADCAST_MS = 2000; // min gap between broadcasts for the same user+chat

interface TypingState {
  expiresAt: number;
  lastBroadcastAt: number;
}

// key: `${chatId}:${userId}`
const typing = new Map<string, TypingState>();

/**
 * Record a typing signal and broadcast it to the chat (debounced).
 * Non-members are silently ignored — no error, no leak.
 */
export function handleTyping(userId: number, chatId: number): void {
  if (!isMember(getDb(), chatId, userId)) return;

  const now = Date.now();
  const key = `${chatId}:${userId}`;
  const existing = typing.get(key);
  if (existing && now - existing.lastBroadcastAt < REBROADCAST_MS) return;

  typing.set(key, { expiresAt: now + TYPING_TTL_MS, lastBroadcastAt: now });
  broadcastToChat(chatId, { t: 'typing', cid: chatId, userId }, userId);

  // Drop the entry after it expires (clients also self-expire their own indicator)
  setTimeout(() => {
    const cur = typing.get(key);
    if (cur && cur.expiresAt <= Date.now()) typing.delete(key);
  }, TYPING_TTL_MS + 50).unref();
}
