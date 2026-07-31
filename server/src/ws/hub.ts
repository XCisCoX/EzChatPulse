import { WebSocket } from 'ws';

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

/** Return the number of active connections for a user (0 if offline). */
export function connectionCount(userId: number): number {
  return connections.get(userId)?.size ?? 0;
}
