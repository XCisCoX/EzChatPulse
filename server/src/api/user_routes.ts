import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth, searchUsers } from '../auth.js';
import { isOnline } from '../ws/hub.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  const q = String(req.query.q ?? '');
  const users = searchUsers(getDb(), q).map((u) => ({ ...u, online: isOnline(u.id) }));
  res.json({ users });
});

export default router;
