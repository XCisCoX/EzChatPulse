import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { getDb, getSetting } from '../db.js';
import { register, login, requireAuth, getUserById, updateDisplayName, changePassword } from '../auth.js';
import { isOnline, broadcastUserUpdate } from '../ws/hub.js';
import { rateLimit } from '../rate-limit.js';
import { config } from '../config.js';
import { BadRequest } from '../errors.js';

const router = Router();

/** Wrap an async route handler so AppError is forwarded to Express error middleware. */
function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

/** N attempts per minute per IP on auth endpoints (brute-force guard). */
function authLimiter(req: Request, res: Response, next: NextFunction): void {
  if (!rateLimit(`auth:${req.ip}`, config.authRatePerMin, 60_000)) {
    res.status(429).json({ error: 'Too many attempts — try again in a minute' });
    return;
  }
  next();
}

router.post('/register', authLimiter, wrap(async (req, res) => {
  if (getSetting(getDb(), 'registration_open', process.env.REGISTRATION_OPEN ?? 'true') !== 'true') {
    res.status(403).json({ error: 'Registration is currently closed' });
    return;
  }
  const { username, displayName, password } = req.body;
  if (!username || !displayName || !password) {
    res.status(400).json({ error: 'username, displayName, and password are required' });
    return;
  }
  const result = register(getDb(), username, displayName, password);
  res.status(201).json(result);
}));

router.post('/login', authLimiter, wrap(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }
  const result = login(getDb(), username, password);
  res.json({ ...result, user: { ...result.user, online: isOnline(result.user.id) } });
}));

router.get('/me', requireAuth, wrap(async (req, res) => {
  const user = getUserById(getDb(), req.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user: { ...user, online: isOnline(user.id) } });
}));

/**
 * PATCH /api/me — update profile fields.
 * Body: { displayName?: string } and/or { currentPassword: string, newPassword: string }.
 * A display-name change is fanned out in real time to everyone who shares a chat.
 */
router.patch('/me', requireAuth, wrap(async (req, res) => {
  const { displayName, currentPassword, newPassword } = req.body ?? {};
  const userId = req.userId;
  let user = getUserById(getDb(), userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  let changed = false;
  if (displayName !== undefined) {
    user = updateDisplayName(getDb(), userId, displayName);
    changed = true;
  }
  if (newPassword !== undefined) {
    if (typeof currentPassword !== 'string') throw new BadRequest('currentPassword is required to change the password');
    changePassword(getDb(), userId, currentPassword, newPassword);
    changed = true;
  }
  if (!changed) throw new BadRequest('Nothing to update');
  if (displayName !== undefined) {
    broadcastUserUpdate(userId, { t: 'user.updated', user });
  }
  res.json({ user: { ...user, online: isOnline(user.id) } });
}));

export default router;
