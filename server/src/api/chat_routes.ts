import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../db.js';
import { requireAuth } from '../auth.js';
import { findOrCreatePrivate, listChats } from '../services/chats.js';
import { listMessages, markRead } from '../services/messages.js';

const router = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

router.get('/chats', requireAuth, wrap(async (req, res) => {
  const chats = listChats(getDb(), req.userId);
  res.json({ chats });
}));

router.post('/chats', requireAuth, wrap(async (req, res) => {
  const { type, userId } = req.body;
  if (type !== 'private') {
    res.status(400).json({ error: 'Only private chats are supported for now' });
    return;
  }
  const chatId = findOrCreatePrivate(getDb(), req.userId, Number(userId));
  res.status(201).json({ chatId });
}));

router.get('/chats/:id/messages', requireAuth, wrap(async (req, res) => {
  const chatId = Number(req.params.id);
  const before = req.query.before != null ? Number(req.query.before) : undefined;
  const limit = req.query.limit != null ? Number(req.query.limit) : 50;
  const messages = listMessages(getDb(), req.userId, chatId, before, limit);
  res.json({ messages });
}));

router.post('/chats/:id/read', requireAuth, wrap(async (req, res) => {
  const chatId = Number(req.params.id);
  const msgId = Number(req.body.msgId);
  if (!Number.isInteger(msgId)) {
    res.status(400).json({ error: 'msgId is required' });
    return;
  }
  markRead(getDb(), req.userId, chatId, msgId);
  res.json({ ok: true });
}));

export default router;
