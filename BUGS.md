# ChatPulse — Bug & Feedback Tracker

> Converted from `bugs-n-stuff.txt` (day-1 live testing, Aug 1–2 2026; 1 dev + 2 friends).
> Status legend: 🔴 open · 🟡 in progress · 🟢 fixed · ✅ verified · 💤 parked
> Severity: 🔥 critical (blocks use) · ⚠️ major (broken/wrong UX) · 🔸 minor (glitch) · ✨ polish

## Summary

| ID | Issue | Severity | Type | Status | Area |
|----|-------|----------|------|--------|------|
| CP-1 | Read receipts: second tick (✓✓) never appears | ⚠️ major | bug | ✅ verified | chat pane / presence |
| CP-2 | No auto-scroll when at the bottom of a chat | ⚠️ major | bug/ux | ✅ verified | chat pane |
| CP-3 | Persian (RTL) messages render LTR | 🔸 minor | feature | ✅ verified | bubbles |
| CP-4 | Esc should close the open chat | ✨ polish | suggestion | ✅ verified | keyboard |
| CP-5 | Hard to find how to start a new chat | 🔸 minor | ux feedback | ✅ verified | sidebar |
| CP-6 | Image pokes outside the bubble on phones | 🔸 minor | bug | 🟢 fixed | bubbles / css |
| CP-7 | Selected-chat highlight doesn't restore on chat switch | 🔸 minor | bug | ✅ verified | sidebar / css |
| CP-8 | Narrow screens split the pane when no chat is open | 🔸 minor | bug | 🟢 fixed | layout / css |
| CP-9 | History loads newest-first on a fresh device (top msg = 26th, bottom = 1st) | ⚠️ major | bug | ✅ verified | history load |
| CP-10 | Second tick (✓✓) missing during live chat (works after reload) | ⚠️ major | bug | ✅ verified | chat pane |
| CP-11 | Sidebar header cramped — user name truncated (design: search top, profile bottom, + menu) | 🔸 minor | ux | ✅ verified | sidebar |
| CP-12 | Persian filename uploaded as mojibake ('ØªÙ…') | 🔸 minor | bug | ✅ verified | uploads |
| CP-13 | On phone, profile + button slip under Firefox's bottom search bar | 🔸 minor | bug | 🟢 fixed | layout / mobile |
| CP-14 | Clearing the sidebar search does nothing (results stay stuck) | 🔸 minor | bug | ✅ verified | sidebar search |
| CP-15 | False unread: your own message shows as '1' after refresh | 🔸 minor | bug | ✅ verified | unread counts |
| CP-16 | Edit/delete buttons misplaced (off-screen on phone, horizontal scrollbar on desktop hover) | 🔸 minor | bug | ✅ verified | message actions |
| CP-17 | Delete-for-everyone leaves a WhatsApp-style tombstone — should vanish | 🔸 minor | bug | ✅ verified | message delete |
| CP-18 | Deleted message still shows its content in the chat-list preview | 🔸 minor | bug | ✅ verified | sidebar preview |
| CP-19 | 'edited' label unreadable on colorful bubbles (too dark) | 🔹 cosmetic | bug | ✅ verified | message meta |
| CP-20 | On phone, Enter sends instead of inserting a newline | 🔸 minor | bug | ✅ verified | composer / mobile |
| CP-21 | Group sender-name gradient spans the bubble width, not the name | 🔹 cosmetic | bug | ✅ verified | group bubbles |

---

## CP-1 — Read receipts: second tick (✓✓) never appears

- **Reported:** live testing, day 1. Both parties online; read receipts expected.
- **Status:** 🔴 open · **Type:** bug · **Severity:** ⚠️ major
- **Symptom:** Own messages stay at ✓ even after the other party reads them.
- **Suspected cause:** `readBy` state is only fed by live WS `read` events
  (`store.setRead`). It is **not** part of the chat/history payloads, so after a
  reload or when the reader's `read` event was missed (offline/scroll-not-fired),
  ticks regress to ✓ and stay there. Also `refreshTicks` runs on render only —
  check it re-runs when a `read` event lands while the pane is open.
- **Code pointers:**
  - `web/src/ui/chat.ts` — `refreshTicks()` ~L210 (maxRead from `chat.readBy`)
  - `web/src/store.ts` — `setRead()` ~L126
  - `web/src/ws.ts` — `'read'` case ~L81
  - server `GET /api/chats` DTO — doesn't include per-chat read state
- **Fix direction:** include max-read-by-others per chat in the chat DTO (or a
  `/read` fetch), and re-run `refreshTicks` on `read` events + after history load.

## CP-2 — No auto-scroll when at the bottom of a chat

- **Reported:** first thing noticed during testing.
- **Status:** 🔴 open · **Type:** bug/ux · **Severity:** ⚠️ major
- **Symptom:** Sitting at the bottom, new messages arrive but the view doesn't
  follow. (The planned "jump to latest" pill is also absent.)
- **Suspected cause:** the pane re-renders fully (`innerHTML=''`) per message
  change, which resets scroll metrics; `scrollToBottom(force=false)` depends on
  `atBottom` computed before the re-render. Scroll anchoring gets lost.
- **Code pointers:** `web/src/ui/chat.ts` — `render()` ~L232–237,
  `scrollToBottom()` L299, scroll listener L303–311.
- **Fix direction:** append rows instead of full re-render on `msg.new`;
  re-check `atBottom` after render; add "↓ jump to latest" pill when not at bottom.

## CP-3 — Persian (RTL) messages render LTR

- **Reported:** messages starting in Persian show left-to-right.
- **Status:** 🔴 open · **Type:** feature · **Severity:** 🔸 minor
- **Fix direction:** `dir="auto"` (or `unicode-bidi: plaintext`) on message
  text so each bubble follows its content direction. Check composer too.
- **Code pointers:** `web/src/ui/chat.ts` message render; `web/src/styles.css`.

## CP-4 — Esc closes the open chat

- **Reported:** suggestion.
- **Status:** 🔴 open · **Type:** suggestion · **Severity:** ✨ polish
- **Fix direction:** global `keydown` handler → `store.setActiveChat(null)` when
  Esc pressed and no modal is open.

## CP-5 — Hard to find how to start a new chat

- **Reported:** two of three testers struggled to find it.
- **Status:** 🔴 open · **Type:** ux feedback · **Severity:** 🔸 minor (high priority)
- **Fix direction:** make the entry obvious — e.g. a prominent "New chat" button
  (not only "New group") at the top of the sidebar, and/or an empty-state hint
  in the sidebar ("Search for a user to start chatting"). Search users flow
  exists (`GET /api/users?q=`) — surface it.
- **Code pointers:** `web/src/ui/sidebar.ts`.

## CP-6 — Image pokes outside the bubble on phones

- **Reported:** mobile. Image left edge escapes the bubble.
- **Status:** 🔴 open · **Type:** bug · **Severity:** 🔸 minor
- **Fix direction:** constrain `img` width inside `.msg-image` (max-width:100%,
  `overflow:hidden` on bubble, or `object-fit` + border-radius) at narrow widths.
- **Code pointers:** `web/src/styles.css` (bubble / image classes),
  `web/src/ui/chat.ts` image message render.

## CP-7 — Selected-chat highlight doesn't restore on chat switch

- **Reported:** the bubble indicating the selected chat looks unresponsive;
  switching chats doesn't restore the highlight.
- **Status:** 🔴 open · **Type:** bug · **Severity:** 🔸 minor
- **Fix direction:** likely CSS specificity (hover vs `.active`) or the active
  class not re-applied after sidebar re-render. Verify state source:
  `store.state.activeChatId`.
- **Code pointers:** `web/src/ui/sidebar.ts`, `web/src/styles.css`.

## CP-8 — Narrow screens split the pane when no chat is open

- **Reported:** on narrow screens with no chat selected, the screen is split
  vertically, leaving a very thin chat-list column.
- **Status:** 🔴 open · **Type:** bug · **Severity:** 🔸 minor
- **Fix direction:** on narrow widths, when `activeChatId` is null the sidebar
  should take the full width (and the empty chat pane hide), i.e. the layout
  should collapse to a single column until a chat is picked.
- **Code pointers:** `web/src/styles.css` (layout grid/flex media queries).

## CP-9 — History loads newest-first on a fresh device

- **Reported:** logged in on another device, opened an existing chat: landed in
  the middle of the page; the last 25 messages were actually the *first* 25 of
  the conversation, and the top message was the 26th (i.e. the window is
  displayed newest → oldest).
- **Status:** 🔴 open · **Type:** bug · **Severity:** ⚠️ major
- **Suspected cause:** double reversal in `loadMore`: API returns newest-first;
  the code does `[...messages].reverse()` **and then prepends each message**
  (`store.addMessage(..., 'prepend')`), which flips the order again → array ends
  up newest-first. Combined with `scrollToBottom(true)` on render, the view can
  also land mid-page instead of at the newest message.
- **Code pointers:**
  - `web/src/actions.ts` — `loadMore()` ~L36–44 ("append in chronological
    order" comment vs actual `prepend`)
  - `web/src/store.ts` — `addMessage()` `'prepend'` branch L101
  - `web/src/ui/chat.ts` — `render()` L232–237
- **Fix direction:** reverse-then-append (or iterate API order with prepend) —
  one reversal, not two; verify first-page load also scrolls to the newest.

---

## CP-10 — Second tick (✓✓) missing during live chat

- **Reported:** Aug 4. Related to CP-1: with both parties in an open chat, the
  second tick never appeared for either side — but appeared after a reload.
- **Status:** ✅ verified · **Type:** bug · **Severity:** ⚠️ major
- **Root cause:** rows of optimistic sends keep a `t:<tempId>` DOM key even
  after ack (the store message retains `tempId`), and `refreshTicks` derived the
  message id by parsing the DOM key — `t:` keys yielded id 0 and were skipped.
  Reload rebuilt rows with `m:<id>` keys, so ticks worked only after reload.
- **Fix:** `refreshTicks` now resolves the message from the store by key lookup
  and uses `storeMsg.id`. (commit `900ff75`)
- **Verified live:** Alice sends → Bob (connected) reads → Alice's tick flips to
  ✓✓ immediately, no reload.

## CP-11 — Sidebar header cramped (user name truncated)

- **Reported:** Aug 4, with a design suggestion: search bar on top, profile at
  the bottom, a "+" button above the profile opening a new-chat/new-group menu
  (Telegram-style).
- **Status:** ✅ verified · **Type:** ux · **Severity:** 🔸 minor
- **Implemented** (commit `900ff75`): search bar on top (filters chats AND finds
  users — one tap starts a chat), profile chip moved to a bottom footer,
  circular "+" FAB opens a menu with "✎ New chat" / "＋ New group".
- **Verified live:** layout + menu in a real browser.

## CP-12 — Persian filename uploaded as mojibake

- **Reported:** Aug 4. A PDF named "تمرین سوم.pdf" came back as
  "ØªÙ…pdf" (UTF-8 bytes decoded as latin1).
- **Status:** ✅ verified · **Type:** bug · **Severity:** 🔸 minor
- **Root cause:** multer/busboy decodes Content-Disposition filenames as latin1;
  the name was stored as-is. (Download headers already used RFC 5987
  `filename*=UTF-8''`.)
- **Fix:** `decodeFilename()` in `storeUpload` re-encodes latin1 → bytes → UTF-8
  (identity for ASCII, U+FFFD guard keeps already-correct names). Test added
  with raw UTF-8 bytes spliced into the multipart header. (commit `900ff75`)
- **Verified live:** upload through the CDN returns "تمرین سوم.pdf" intact.

---

## CP-13 — On phone, profile + button slip under Firefox's bottom search bar

- **Reported:** Aug 5 (mobile Firefox). The sidebar footer ended up behind the
  browser's bottom search bar.
- **Status:** 🟢 fixed (needs phone retest) · **Type:** bug · **Severity:** 🔸 minor
- **Root cause:** `height: 100vh` on mobile browsers extends behind the browser
  chrome (URL/search bar).
- **Fix:** `#app` / `#main-view` now use `100dvh` (dynamic viewport height, vh
  fallback) + `env(safe-area-inset-bottom)` padding on the footer; the fixed
  mobile chat pane got the same dvh treatment. (commit `d49f0a7`)

## CP-14 — Clearing the sidebar search does nothing

- **Reported:** Aug 5.
- **Status:** ✅ verified · **Type:** bug · **Severity:** 🔸 minor
- **Root cause:** `renderChats()` skips re-rendering when the render key is
  unchanged; while searching, the list was replaced by results but `lastKey`
  still matched, so clearing the input early-returned and left the results up.
- **Fix:** on clear, reset `lastKey = ''` to force a rebuild. (commit `d49f0a7`)
- **Verified live:** type → results → clear → chat list restored.

## CP-11 follow-up (Aug 5): FAB moved to floating position

The "+" button no longer sits in the footer row next to the profile — it now
floats over the chat-list area, bottom-right, above the profile (Telegram-style),
with the menu opening above it. Verified live (commit `d49f0a7`).

---

## CP-20, CP-21 — testing-with-friends round (Aug 9) ✅

Two findings from real friend testing (commit `b8f9b7a`), both verified live:

- **CP-20 — mobile newline:** phone keyboards have no Shift, so Enter always
  sent. Now: on coarse-pointer devices (phones/tablets) Enter inserts a
  newline and sending is via the ➤ button; on desktop Enter sends,
  Shift+Enter / Ctrl+Enter make a newline. Also added an `isComposing` guard so
  IME input (Persian etc.) never sends mid-composition. Verified: desktop
  Enter sends, Shift/Ctrl+Enter newline, emulated-coarse Enter newline with no
  send.
- **CP-21 — group sender-name gradient:** `.msg-sender` is a block, so the
  gradient spanned the whole bubble and shifted with message width. Now
  `display: inline-block; width: fit-content` — the gradient spans exactly the
  name. Verified: name 73px vs bubble 146px in a live group chat.

---

## CP-15 — False unread: your own message shows as '1' after refresh

- **Reported:** Aug 7. Send a message in a chat, refresh → the chat shows an
  unread badge for your own message.
- **Status:** ✅ verified · **Type:** bug · **Severity:** 🔸 minor
- **Root cause:** the unread count SQL counted every message above the viewer's
  read cursor regardless of sender — your own sends sit above your cursor
  (sending doesn't advance it), so they counted as unread.
- **Fix:** unread now excludes the viewer's own messages
  (`AND m.sender_id != ?` in the count subqueries of both `getChat` and
  `listChats`). Test added: sender sees unread 0, recipient sees unread N.
  (commit `56a1901`)
- **Verified live:** own message → unread 0; same message from the recipient's
  view → unread 1.

---

## Feature backlog (Aug 7) — next iteration candidates

From bugs-n-stuff.txt (not bugs; planned features):

| Item | Notes |
|------|-------|
| ~~Message edit / delete~~ | ✅ DONE Aug 7 — see "Feature round 1" below |
| Emoji panel | picker in the composer (needs a small emoji dataset + popover) |
| Leave / delete group | leave = remove self + eviction events; delete = admin destroys chat |
| User settings | display name, password change, maybe avatar later |

### Feature round 1 — Aug 7: message edit + delete ✅

Implemented end to end (commit `36dc3ae`), 55/55 tests, verified live in a
real browser with a second WS client:

- **Edit** (sender only, text messages): `msg.edit` WS op → `msg.edited`
  broadcast to everyone; UI: tap/hover your message → ✎ → inline textarea
  (Enter saves, Esc cancels) → "edited" marker next to the time.
- **Delete for everyone** (sender or group admin): soft delete →
  `deleted_at` tombstone ("This message was deleted") broadcast as
  `msg.deleted {mode:'everyone'}`.
- **Delete for me** (any member): per-user `message_hidden` table; message
  disappears only for the actor (history + sidebar preview filtered), acked
  locally, no broadcast.
- Schema migration v2 (edited_at/deleted_at columns + message_hidden table),
  applied cleanly to the live DB.
- Tests: edit happy path + non-sender forbidden + can't edit deleted/media,
  delete-everyone + non-sender forbidden, group-admin delete, delete-for-me
  isolation. Also hardened the test helper: contexts now force-close client
  sockets, so a failing test can never hang the suite again.

## CP-16..CP-19 — edit/delete UX round (Aug 9) ✅

Follow-up feedback on the Aug 7 feature, all verified live in a real browser
(desktop mouse + CDP real touch events) at commit `08a1f1e`:

- **CP-16 — menu placement:** the hover/tap ✎🗑 buttons are gone. The message
  menu (✎ Edit · 🗑 Delete for me · 🗑 Delete for everyone) now opens on
  **right-click** (desktop, at the cursor) or **single tap** (mobile, above the
  message — Telegram style). Tap detection is drag-safe: a touch that moves
  more than 10 px or lasts over 400 ms is treated as scroll/drag and never
  opens the menu (verified with real CDP touch events incl. a 300 px drag).
  Menu closes on outside tap/click, Esc, or scroll; items are clamped to the
  viewport. Group admins additionally get "Delete for everyone" on any message.
- **CP-17 — no more tombstone:** delete-for-everyone now **hard-deletes** the
  row server-side (`DELETE FROM messages`), so nothing is left behind for
  anyone. Idempotent (deleting twice is a no-op); editing a deleted message
  returns NOT_FOUND. Legacy tombstone rows (from the previous build) still
  render for compatibility but no new ones are created.
- **CP-18 — sidebar preview:** `removeMessage` now rolls the chat-list preview
  back to the previous message when the last one is deleted (live, no reload);
  server-side the last-message query naturally falls back after a hard delete.
- **CP-19 — 'edited' label:** now light (white 82% + subtle shadow) instead of
  the dark muted tone, readable on any bubble color.

Tests updated to the hard-delete semantics (55/55 green).

---

## Feature backlog (Aug 9)

| Item | Notes |
|------|-------|
| ~~Message edit / delete~~ | ✅ DONE Aug 7 + UX round Aug 9 |
| ~~User settings~~ | ✅ DONE Aug 9 — see "Feature round 2" below |
| ~~Admin panel~~ | ✅ DONE Aug 9 — see "Feature round 3" below (monitor + manage) |
| ~~Emoji panel~~ | ✅ DONE Aug 9 — see "Feature round 4" below |
| ~~Reply to messages~~ | ✅ DONE Aug 9 — see "Feature round 5" below |
| Leave / delete group | leave = remove self + eviction events; delete = admin destroys chat |

### Feature round 4 — Aug 9: emoji panel ✅

Commit `ac3adb7` (+ `c9c5f53` fix), all live browser checks passed.

- Curated offline emoji set (no external dependency): 8 categories — Smileys,
  Gestures, Hearts, Animals, Food, Activity, Objects, Symbols (~400 emojis).
- 😊 button in the composer toggles the panel above the input; category tabs;
  clicking an emoji inserts it **at the cursor** (works mid-text).
- Dismiss: outside click, Esc, after sending, or switching chats.
- Pitfall found live: a scroll-close listener was killing the panel on every
  insert — `input.focus()` + autoGrow fires a real scroll event. The panel is
  anchored to the composer, so scroll-close was removed (outside click/Esc
  suffice).

### Backlog — Aug 9 additions (from bugs-n-stuff.txt)

| Item | Notes |
|------|-------|
| ~~Soft-delete retention~~ | ✅ DONE Aug 9 — see "Feature round 5" |
| Per-user storage quota | still pending — per-user space, admin-editable quota, add/remove/replace files, shared-file bubble, public/private flag |
| ~~Email capture~~ | ✅ DONE Aug 9 — see "Feature round 5" |

### Feature round 5 — Aug 9: reply, email capture, soft-delete retention ✅

Commit `b71f37f`, 68/68 tests, 12/12 live browser+WS checks passed.

**Reply to messages** (server already stored replyTo — mostly client work):
- Context menu → "↩ Reply" on any message (own or others', text or media).
- A reply bar appears above the composer ("↩ Sender: preview") with a cancel ✕.
- Sending attaches `replyTo`; the bubble renders a quote block (sender + text /
  [Photo] / [File]) — clicking it smooth-scrolls to the original and flashes it.
- Test: replyTo round-trips to the other side; replying across chats is rejected.

**Email capture** (foundation for password reset later):
- Migration v4: `users.email` + `email_verified` (0). Registration accepts an
  optional email.
- `PATCH /api/me {email}` — allowed exactly ONCE (cannot be changed after);
  format validated. /api/me returns the private shape (email + verified flag);
  **email never leaves the server in public DTOs** — search results, member
  lists, and the user.updated broadcast stay clean (tested).
- Settings modal: email section — set once, then locked, with a
  "not verified yet" status (no verification flow until SMTP exists).

**Soft-delete retention** (their Aug 9 spec):
- delete-for-everyone is again a soft delete (deleted_at flag), but the row is
  excluded from EVERY normal query — history, sidebar previews, unread counts,
  chat ordering — so users see nothing (no tombstone; client removes rows live).
- Admin: stats gains "deleted (retained)"; a new "Purge deleted > N days"
  control (POST /api/admin/cleanup-deleted) physically removes flagged rows
  older than N days. Verified: retained-but-hidden, preview falls back,
  days=3650 keeps, days=0 purges, non-admin 403.

Pitfall found live: a WS broadcast can miss a pane whose socket is still
connecting (no catch-up re-fetch yet) — a test-script race, not an app bug,
but worth remembering for the future "reconnect catch-up" work.

### Feature round 3 — Aug 9: admin panel ✅

Motivated by: friends forgetting passwords with no reset path (email reset
needs SMTP + user emails that don't exist yet — admin reset solves it today).
Commit `f2ff715`, 63/63 tests, all live checks passed (incl. real 28-user DB).

- **Gate:** `ADMIN_USERNAMES` env (comma-separated) — checked lazily per
  request; everyone else gets 403 on all admin endpoints.
- **Console:** `/admin` — self-contained page (server/admin-page.html), its own
  login, hidden from normal users (no link anywhere in the app).
- **Monitor:** live stats — users / chats / messages / files, DB size, uptime,
  live WS connections, registration state; user table with online/last-seen.
- **Manage:**
  - reset any user's password (the original ask — no email needed)
  - registration kill-switch (persists in `app_settings`, survives restarts;
    env default via `REGISTRATION_OPEN`); register route returns 403 when closed.
- Migration v3 (`app_settings` key/value). The test harness mounts admin routes
  too, so integration tests cover the real wiring.

### Feature round 2 — Aug 9: user settings ✅

Implemented end to end (commit `f0b37d7`), 58/58 tests, verified live in a
browser with a second WS client (9/9 checks):

- **Entry point:** click your profile chip (bottom of the sidebar) → Settings
  modal (display name · password · log out).
- **Display name:** `PATCH /api/me {displayName}` (validated: non-empty,
  ≤ 32 chars) → `user.updated` WS event fanned out to everyone who shares a
  chat with you — the name updates live in their member lists/headers, and in
  your own me-chip + session.
- **Password change:** `PATCH /api/me {currentPassword, newPassword}` — verifies
  the current password, enforces min 8 chars, rehashes with bcrypt. Verified
  end-to-end: change → old password rejected, new password logs in.
- **Log out:** clears the stored token and returns to the login screen.
- Tests: name update + broadcast to chat partner, empty/too-long rejection,
  wrong-current rejection, old-password-fails/new-password-works.

Concerns (deferred, noted):
- Registration is unguarded (anyone can sign up) — fine for now; later: invite
  token or email verification.
- User search lists all matching users on a letter — acceptable for a private
  app; later: hide-by-default / friends-only search.

## Fix round 1 — 2026-08-02 (all 9 closed)

Root causes found & fixed in one pass, deployed as commits `bef2f53`, `aee1b28`, `5bffeb9`:

- **CP-9 + CP-2 (same root cause):** the store subscription's "new message →
  scroll" check compared the just-added message to itself (store pushes *before*
  notify), so auto-scroll was dead code — the pane opened pinned to the TOP of
  the loaded page. Fixed by comparing against the last *rendered* key and
  scrolling only on appends while at bottom. Also fixed a second latent bug:
  older history pages were double-reversed (`reverse()` + `unshift()`), so the
  prepended block rendered newest-first; and prepended rows were appended at the
  bottom of the DOM instead of the top. All three fixed and verified live with a
  60-message conversation (chronological across the page boundary, pane opens
  at the newest message).
- **CP-1:** read state was only fed by live WS events; after reload the client
  had no read cursors. Server chat DTO now includes `readBy` (per-member read
  cursor); client seeds its map on upsert. Verified live: ✓✓ appears when the
  other party reads, and persists across a full reload.
- **CP-3:** `dir="auto"` on message content + composer (verified with a live
  Persian message).
- **CP-4:** global Esc handler closes the open chat (skips when a modal or the
  lightbox is up).
- **CP-5:** icon-only buttons replaced with labeled "✎ New chat" / "＋ New group"
  (new-chat button gradient-highlighted) + empty-list hint in the sidebar.
- **CP-6:** image max-width `min(280px, 100%)` + `min-width:0` on bubble content.
  **Needs phone retest.**
- **CP-7:** sidebar render key omitted `activeChatId`, so switching chats never
  re-rendered the list — the `.active` class never moved. Key now includes it.
- **CP-8:** `#empty-state` was a flex sibling of `#main-view`, so on narrow
  screens it split the app and squeezed the sidebar to half width. Moved inside
  `#main-view` (fills the pane area on desktop) and hidden ≤820px (sidebar takes
  the whole screen). **Needs phone retest.**

---

## Workflow

1. Fix → mark `🟢 fixed` (reference the commit).
2. Deploy to the server → test live → mark `✅ verified` (note who/what tested).
3. Suggestions get a decision: adopt → becomes a task; park → `💤` with reason.
4. When the project moves to GitHub (repo + remote), migrate each entry to a
   real issue; this file then becomes the changelog reference.

Raw notes preserved in `bugs-n-stuff.txt` (can be deleted once this file is trusted).
