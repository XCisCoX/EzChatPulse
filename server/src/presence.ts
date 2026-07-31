import { getDb } from './db.js';
import { isOnline } from './ws/hub.js';

const DEBOUNCE_MS = 15_000;
const pendingFlush = new Map<number, ReturnType<typeof setTimeout>>();

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
