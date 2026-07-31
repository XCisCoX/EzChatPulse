import { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { register, unregister, isOnline, broadcastToChat } from './hub.js';
import { scheduleLastSeen } from '../presence.js';
import { sendMessage, markRead } from '../services/messages.js';
import { AppError } from '../errors.js';

const AUTH_TIMEOUT_MS = 5000;

/* Extend WebSocket with an optional userId property. */
type ExtSocket = WebSocket & { userId?: number };

export function handleConnection(raw: WebSocket): void {
  const ws = raw as ExtSocket;
  let authed = false;

  const timer = setTimeout(() => {
    if (!authed) ws.close(4001, 'Auth timeout');
  }, AUTH_TIMEOUT_MS);

  ws.on('message', (data) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(data));
    } catch {
      sendError(ws, 'BAD_REQUEST', 'Invalid JSON');
      return;
    }

    // ── Auth handshake ─────────────────────────────────────────
    if (msg.t === 'auth' && typeof msg.token === 'string') {
      try {
        const payload = jwt.verify(msg.token, config.jwtSecret) as jwt.JwtPayload;
        const sub = Number(payload.sub);
        if (!Number.isInteger(sub)) throw new Error('invalid sub');
        clearTimeout(timer);
        authed = true;
        ws.userId = sub;
        register(ws.userId, ws);

        ws.send(JSON.stringify({ t: 'ready', userId: ws.userId }));
      } catch {
        sendError(ws, 'AUTH_FAILED', 'Invalid or expired token');
      }
      return;
    }

    if (!ws.userId) {
      sendError(ws, 'AUTH_REQUIRED', 'Send {t:"auth", token:...} first');
      return;
    }

    // ── Authenticated message types ────────────────────────────
    switch (msg.t) {
      case 'msg.send':
        handleSend(ws, msg);
        break;
      case 'read':
        handleRead(ws, msg);
        break;
      default:
        sendError(ws, 'UNKNOWN_TYPE', `Unknown message type: ${msg.t}`);
    }
  });

  ws.on('close', () => {
    clearTimeout(timer);
    if (ws.userId) {
      unregister(ws.userId, ws);
      if (!isOnline(ws.userId)) {
        scheduleLastSeen(ws.userId);
      }
    }
  });

  ws.on('error', () => {
    /* close event will fire next */
  });
}

function handleSend(ws: ExtSocket, msg: Record<string, unknown>): void {
  const cid = Number(msg.cid);
  if (!Number.isInteger(cid)) {
    sendError(ws, 'BAD_REQUEST', 'cid must be an integer');
    return;
  }
  try {
    const result = sendMessage(getDb(), ws.userId!, cid, {
      tempId: typeof msg.tempId === 'string' ? msg.tempId : '',
      kind: typeof msg.kind === 'string' ? msg.kind : 'text',
      text: typeof msg.text === 'string' ? msg.text : '',
      fileId: msg.fileId != null ? Number(msg.fileId) : null,
      replyTo: msg.replyTo != null ? Number(msg.replyTo) : null,
    });

    // Sender: acknowledge with the server-assigned id (client reconciles optimistic send)
    ws.send(JSON.stringify({ t: 'msg.ack', tempId: result.tempId, msg: result.msg }));
    // Other online members: deliver the message
    broadcastToChat(result.msg.chatId, { t: 'msg.new', msg: result.msg }, ws.userId);
  } catch (err) {
    sendWsError(ws, err);
  }
}

function handleRead(ws: ExtSocket, msg: Record<string, unknown>): void {
  const cid = Number(msg.cid);
  const msgId = Number(msg.msgId);
  if (!Number.isInteger(cid) || !Number.isInteger(msgId)) {
    sendError(ws, 'BAD_REQUEST', 'cid and msgId must be integers');
    return;
  }
  try {
    markRead(getDb(), ws.userId!, cid, msgId);
    broadcastToChat(cid, { t: 'read', cid, userId: ws.userId, msgId });
  } catch (err) {
    sendWsError(ws, err);
  }
}

function sendWsError(ws: WebSocket, err: unknown): void {
  if (err instanceof AppError) {
    const code: Record<number, string> = {
      400: 'BAD_REQUEST',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
    };
    sendError(ws, code[err.statusCode] ?? 'ERROR', err.message);
  } else {
    console.error('ws handler error:', err);
    sendError(ws, 'INTERNAL', 'Internal server error');
  }
}

function sendError(ws: WebSocket, code: string, message: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ t: 'error', code, message }));
  }
}
