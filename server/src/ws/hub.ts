import { WebSocket } from 'ws';
import { getDb } from '../db.js';
import { memberIds } from '../services/membership.js';

// Map<userId, Set<WebSocket>> — supports multiple devices / tabs per user
const connections = new Map<number, Set<WebSocket>>();

export function register(userId: number, ws: WebSocket): void {
  let set = connections.get(userId);
  if (!set) {
    set = new Set();
    connections.set(userId, set);
  }
  set.add(ws);
}

export function unregister(userId: number, ws: WebSocket): void {
  const set = connections.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) connections.delete(userId);
}

export function isOnline(userId: number): boolean {
  return connections.has(userId);
}

/** Number of active connections for a user (0 if offline). */
export function connectionCount(userId: number): number {
  return connections.get(userId)?.size ?? 0;
}

/**
 * Fan-out a JSON event to all online members of a chat.
 * Payload is serialized once and reused for every socket (no per-socket re-serialize).
 * Returns the number of sockets that received it.
 */
export function broadcastToChat(chatId: number, event: object, exceptUserId?: number): number {
  const payload = JSON.stringify(event);
  const ids = memberIds(getDb(), chatId);
  let sent = 0;
  for (const userId of ids) {
    if (userId === exceptUserId) continue;
    const set = connections.get(userId);
    if (!set) continue;
    for (const ws of set) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
        sent++;
      }
    }
  }
  return sent;
}
