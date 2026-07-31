import { getDb } from './db.js';
import { isOnline, broadcastPayloadToChat } from './ws/hub.js';

const DEBOUNCE_MS = 15_000;
const pendingFlush = new Map<number, ReturnType<typeof setTimeout>>();

function chatIdsFor(userId: number): number[] {
  const rows = getDb()
    .prepare('SELECT chat_id FROM chat_members WHERE user_id = ?')
    .all(userId) as Array<{ chat_id: number }>;
  return rows.map((r) => r.chat_id);
}

/** Broadcast {t:'presence', online:true} to everyone sharing a chat with userId. */
export function announceOnline(userId: number): void {
  const payload = JSON.stringify({ t: 'presence', userId, online: true });
  for (const chatId of chatIdsFor(userId)) broadcastPayloadToChat(chatId, payload);
}

/** Broadcast {t:'presence', online:false, lastSeenAt} to everyone sharing a chat with userId. */
export function announceOffline(userId: number): void {
  const payload = JSON.stringify({ t: 'presence', userId, online: false, lastSeenAt: Date.now() });
  for (const chatId of chatIdsFor(userId)) broadcastPayloadToChat(chatId, payload);
}

function flushLastSeen(userId: number): void {
  const db = getDb();
  db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(Date.now(), userId);
  pendingFlush.delete(userId);
}

/**
 * Schedule an eventual `last_seen_at` write.
 * Only flushes if the user has no remaining sockets (multi-device safe).
 */
export function scheduleLastSeen(userId: number): void {
  if (isOnline(userId)) return; // still connected on another device
  const existing = pendingFlush.get(userId);
  if (existing) clearTimeout(existing);
  pendingFlush.set(userId, setTimeout(() => flushLastSeen(userId), DEBOUNCE_MS));
}

/** Force-flush all pending last_seen writes (e.g. on SIGTERM). */
export function flushAll(): void {
  for (const [userId] of pendingFlush) flushLastSeen(userId);
}
