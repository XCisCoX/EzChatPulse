import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { getDb, getSetting, setSetting } from '../db.js';
import { config, isAdminUsername } from '../config.js';
import { requireAuth, getUserById } from '../auth.js';
import { isOnline, totalConnections } from '../ws/hub.js';
import { BadRequest } from '../errors.js';

const router = Router();

/** requireAuth + the user must be on the ADMIN_USERNAMES list. */
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = getUserById(getDb(), req.userId);
  if (!user || !isAdminUsername(user.username)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}

router.use(requireAuth, requireAdmin);

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

/** General status: counts, DB size, uptime, live connections, kill-switch state. */
router.get(
  '/stats',
  wrap(async (_req, res) => {
    const db = getDb();
    const count = (table: string): number =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    let dbSizeBytes = 0;
    if (config.dbPath !== ':memory:') {
      try {
        dbSizeBytes = fs.statSync(config.dbPath).size;
      } catch {
        dbSizeBytes = 0;
      }
    }
    res.json({
      users: count('users'),
      chats: count('chats'),
      messages: count('messages'),
      files: count('files'),
      dbSizeBytes,
      uptimeSec: Math.round(process.uptime()),
      connections: totalConnections(),
      registrationOpen: getSetting(db, 'registration_open', process.env.REGISTRATION_OPEN ?? 'true') === 'true',
    });
  }),
);

/** User list for management (id, username, display name, online, last seen). */
router.get(
  '/users',
  wrap(async (_req, res) => {
    const db = getDb();
    const rows = db
      .prepare('SELECT id, username, display_name, created_at, last_seen_at FROM users ORDER BY id')
      .all() as Array<{ id: number; username: string; display_name: string; created_at: number; last_seen_at: number | null }>;
    res.json({
      users: rows.map((r) => ({
        id: r.id,
        username: r.username,
        displayName: r.display_name,
        createdAt: r.created_at,
        online: isOnline(r.id),
        lastSeenAt: r.last_seen_at,
      })),
    });
  }),
);

/** Admin sets a new password for a user (friends forget theirs — no email needed). */
router.post(
  '/users/:id/reset-password',
  wrap(async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) throw new BadRequest('Invalid user id');
    const newPassword = (req.body ?? {}).newPassword;
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      throw new BadRequest('New password must be at least 8 characters');
    }
    const db = getDb();
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId) as
      | { id: number; username: string }
      | undefined;
    if (!user) throw new BadRequest('User not found');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), userId);
    res.json({ ok: true, username: user.username });
  }),
);

/** Registration kill-switch — persists in app_settings, survives restarts. */
router.post(
  '/registration',
  wrap(async (req, res) => {
    const enabled = (req.body ?? {}).enabled;
    if (typeof enabled !== 'boolean') throw new BadRequest('enabled must be a boolean');
    setSetting(getDb(), 'registration_open', String(enabled));
    res.json({ registrationOpen: enabled });
  }),
);

export default router;
