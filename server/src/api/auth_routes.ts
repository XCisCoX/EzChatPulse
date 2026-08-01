import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../db.js';
import { register, login, requireAuth, getUserById } from '../auth.js';
import { isOnline } from '../ws/hub.js';
import { rateLimit } from '../rate-limit.js';
import { config } from '../config.js';

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

export default router;
