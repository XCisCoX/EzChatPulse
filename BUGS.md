# ChatPulse — Bug & Feedback Tracker

> Converted from `bugs-n-stuff.txt` (day-1 live testing, Aug 1–2 2026; 1 dev + 2 friends).
> Status legend: 🔴 open · 🟡 in progress · 🟢 fixed · ✅ verified · 💤 parked
> Severity: 🔥 critical (blocks use) · ⚠️ major (broken/wrong UX) · 🔸 minor (glitch) · ✨ polish

## Summary

| ID | Issue | Severity | Type | Status | Area |
|----|-------|----------|------|--------|------|
| CP-1 | Read receipts: second tick (✓✓) never appears | ⚠️ major | bug | 🔴 open | chat pane / presence |
| CP-2 | No auto-scroll when at the bottom of a chat | ⚠️ major | bug/ux | 🔴 open | chat pane |
| CP-3 | Persian (RTL) messages render LTR | 🔸 minor | feature | 🔴 open | bubbles |
| CP-4 | Esc should close the open chat | ✨ polish | suggestion | 🔴 open | keyboard |
| CP-5 | Hard to find how to start a new chat | 🔸 minor | ux feedback | 🔴 open | sidebar |
| CP-6 | Image pokes outside the bubble on phones | 🔸 minor | bug | 🔴 open | bubbles / css |
| CP-7 | Selected-chat highlight doesn't restore on chat switch | 🔸 minor | bug | 🔴 open | sidebar / css |
| CP-8 | Narrow screens split the pane when no chat is open | 🔸 minor | bug | 🔴 open | layout / css |
| CP-9 | History loads newest-first on a fresh device (top msg = 26th, bottom = 1st) | ⚠️ major | bug | 🔴 open | history load |

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

## Workflow

1. Fix → mark `🟢 fixed` (reference the commit).
2. Deploy to the server → test live → mark `✅ verified` (note who/what tested).
3. Suggestions get a decision: adopt → becomes a task; park → `💤` with reason.
4. When the project moves to GitHub (repo + remote), migrate each entry to a
   real issue; this file then becomes the changelog reference.

Raw notes preserved in `bugs-n-stuff.txt` (can be deleted once this file is trusted).
