# EzChatPulse — Roadmap

> Feature backlog, parked ideas, and what's been shipped. Bug log lives in
> **[BUGS.md](BUGS.md)**.
> Legend: ✅ done · 🔜 next · 🟡 needs a decision · 💤 parked

## Active backlog (priority order)

| # | Feature | Notes | Status |
|---|---------|-------|--------|
| 1 | Profile image + user info popup | click a chat header → user card (avatar, name, username); avatar upload reuses the existing file infra | 🔜 next |
| 2 | Reconnect catch-up | if a WS broadcast is missed while the socket is connecting, the pane never re-fetches (known gap found live Aug 9); on reconnect, refetch chats + recent messages | 🔜 next |
| 3 | Message search (FTS) | server-side full-text search over messages (SQLite FTS5); search box in the sidebar searches messages too | 🟡 |
| 4 | GIF support "like Telegram" | GIF **search** needs a provider decision (Tenor/Giphy API key) + quick-send UI; sending GIFs as files already works | 🟡 needs decision |
| 5 | Per-user storage quota + file management | per-user space (cap exists), admin-editable quota, add/remove/replace files, distinct shared-file bubble, per-file public/private flag | 🟡 |
| 6 | Notifications (Web Push) | service worker + VAPID push for new messages when the tab is closed | 🟡 |
| 7 | Channels + bots | broadcast channels; bot API | 💤 |
| 8 | Server-side image thumbnails | downscale large uploads (sharp) instead of shipping originals to phones | 💤 |
| 9 | Android app | separate project; cheapest first step = PWA wrapper around the existing web client | 💤 |

## Parked / concerns

| Item | Note |
|------|------|
| Registration hardening | unguarded signup is fine for a private app; later: invite code or email verification |
| Search privacy | user search lists all matches on a letter; later: friends-only/hide-by-default |
| Email password reset | blocked on SMTP + verification flow; emails now exist (v4) + one-time capture in settings — the plumbing is ready |
| Password change doesn't invalidate other sessions | stateless JWTs; acceptable for now |
| Origin TLS | self-signed behind ArvanCloud "Full" mode; optional certbot-on-origin (~15 min) |

## Shipped (feature rounds)

| Round | Date | What | Proof |
|-------|------|------|-------|
| 1 | Aug 7 | Message edit + delete (context menu, edited marker, delete-for-me/for-everyone, migration v2) | 55/55 tests, live-verified |
| 2 | Aug 9 | User settings (display name live fan-out, password change, logout) | 58/58, 9/9 live |
| 3 | Aug 9 | Admin panel (stats, users, password reset, registration kill-switch, migration v3) | 63/63, live |
| 4 | Aug 9 | Emoji panel (8 offline categories, cursor insert) | live |
| 5 | Aug 9 | Reply-to-message (quote + jump), email capture (one-time, private DTO, migration v4), soft-delete retention (hidden rows + admin purge) | 68/68, 12/12 live |
| 6 | Aug 15 | Delete confirmation, leave/delete group (member.left, last-member auto-delete, admin cascade + chat.deleted) | 71/71, 11/11 live |

## License

This project uses GPL-3.0 (LICENSE).
