# ChatPulse

A self-hosted, Telegram-style chat application: real-time messaging over WebSocket,
private + group chats, presence (online / last seen), persistent history, media
sharing, typing indicators, read receipts — all served over TLS with a self-signed
certificate. Single process, single language, single dependency tree.

## Features

- Real-time delivery over WebSocket (send → ack → fan-out, optimistic UI)
- Private chats & group chats (admin-managed membership)
- Presence: online / last seen, live in the UI, multi-device safe
- Typing indicators (debounced) and read receipts (✓ sent / ✓✓ read)
- Persistent history with **keyset pagination** — pages stay O(50) even after
  100k+ messages
- Media & file sharing (25 MB cap, content-addressed dedupe, member-gated access)
- TLS with a self-signed certificate (swap in any real cert later — zero code change)
- Dark, glassy, animated web UI — no client framework, ~9 KB gzipped JS

## Quick start

```bash
# dev (hot reload)
npm install
./scripts/gen-cert.sh          # self-signed cert → certs/ (one-time)
npm run dev                    # server :8443 + vite dev :5173
# open http://localhost:5173 — the browser will warn about the self-signed
# cert on API calls; click through, or trust certs/cert.pem in your OS.

# production (single deployment)
npm run build
npm start                      # https://localhost:8443 serves the app + API + WS
```

Config via env vars (defaults in parentheses):

| Var | Default | Description |
|---|---|---|
| `PORT` | `8443` | HTTPS/WSS port |
| `HOST` | `0.0.0.0` | bind address |
| `DATA_DIR` | `../data` | SQLite db + uploads live here |
| `JWT_SECRET` | auto-generated | persisted in `data/.jwt-secret` |
| `MAX_UPLOAD_BYTES` | `26214400` (25 MB) | upload cap |
| `SERVER_ROOT` | cwd | base for cert/data resolution |

## Test & perf tooling

```bash
npm test                       # 49 integration tests (real HTTP + WS + in-memory DB)
SEED_USERS=20 SEED_MESSAGES=100000 npm run seed     # backfill fake history
LOAD_USERS=50 LOAD_MSGS=200 npm run loadtest        # 50 ws clients, 10k messages
npm run smoke                  # full auth flow against the live server
```

Measured on this machine (Node 20, SQLite WAL):

| Metric | Result |
|---|---|
| Seed insert rate (100k msgs) | ~144,000 msg/s (DB ends at ~10 MB) |
| Load test: 50 users × 200 msgs | 10,000/10,000 acks, 0 errors |
| Throughput | ~4,500 msg/s |
| Ack latency p50 / p95 / p99 | 9 / 21 / 25 ms |
| History page (after 100k+ msgs) | ~2 ms |
| Server RSS under load | ~99 MB |

## Architecture

```
web/ (Vite SPA, vanilla TS) ── REST (auth/history/upload) ──┐
                             ── WSS (real-time events)   ──┤
                                                           ▼
server/ (Node + TS)  ┌─ ws/hub.ts     socket registry + fan-out (payload serialized once)
                     ├─ ws/handler.ts auth handshake, msg.send/read/typing dispatch
                     ├─ services/     messages (keyset pagination), chats, files
                     ├─ presence.ts   online registry, debounced last_seen
                     └─ db.ts         better-sqlite3, WAL, schema_migrations
                                           │
                                     data/chatpulse.db + data/uploads/
```

Why it stays fast with years of history:
- Keyset pagination (`WHERE chat_id=? AND id<? LIMIT 50`) — never `OFFSET`
- Index `(chat_id, id DESC)`; append-only messages; unread = arithmetic diff
  of one `read_state` row per (chat, user) — no `COUNT(*)` scans
- WAL + `synchronous=NORMAL` + prepared statements (better-sqlite3)
- Hot paths (presence, typing, sockets) live in memory; DB touched only on
  persist / read / login

## Real-time protocol (WSS, JSON)

Client → server: `auth`, `msg.send {cid, tempId, kind, text?, fileId?, replyTo?}`,
`read {cid, msgId}`, `typing {cid}`.
Server → client: `ready`, `msg.ack {tempId, msg}`, `msg.new {msg}`,
`typing`, `read`, `presence {userId, online, lastSeenAt?}`,
`chat.created {chat}`, `chat.member {cid, action, userId, chat?}`,
`chat.removed {cid}`, `error {code, message}`.

## Roadmap (natural next steps)

- Message editing/deletion, delete-for-everyone
- Channels, bots, message search, notifications
- Horizontal scale: Redis pub/sub for fan-out, shared DB
- Let's Encrypt or any real cert (replace `certs/` — no code change)
- Server-side image thumbnails for large uploads

## License

GPL-3.0 — see [LICENSE](LICENSE).
