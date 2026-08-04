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
