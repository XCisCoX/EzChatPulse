# ChatPulse

A self-hosted, Telegram-style chat application: real-time messaging over WebSocket,
private + group chats, presence (online / last seen), persistent history, and media
sharing — served over TLS with a self-signed certificate.

## Stack

- Server: Node.js 20 + TypeScript, `ws` (WebSocket), Express (REST), `better-sqlite3` (SQLite, WAL mode)
- Client: Vite + vanilla TypeScript SPA (no framework), custom dark UI
- Transport: WSS (WebSocket over TLS) for real-time; REST + JWT for auth, history, uploads

## Status

Early development — see `.hermes/plans/` for the implementation plan.
