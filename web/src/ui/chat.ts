import { api, authedFileUrl } from '../api';
import { store } from '../store';
import { socket } from '../ws';
import { loadMore } from '../actions';
import { avatarEl, formatTime, formatLastSeen, formatBytes, isImageMime } from './format';
import { openModal, toast } from './toast';
import type { UIChat, UIMessage, MemberInfo } from '../types';

let currentChatId: number | null = null;
let atBottom = true;
let lastTypingSent = 0;

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;

/** Stable DOM key for a message row (tempId for optimistic sends, else server id). */
const keyOf = (m: UIMessage): string => (m.tempId ? `t:${m.tempId}` : `m:${m.id}`);

export function mountChatPane(): void {
  const headerEl = $('#chat-header');
  const messagesEl = $('#messages');
  const typingBar = $('#typing-bar');
  const composerEl = $('#composer');
  const emptyState = $('#empty-state');
  const chatPane = $('#chat-pane');

  // ── header ────────────────────────────────────────────────────────────
  function subtitle(chat: UIChat): string {
    if (chat.type === 'group') {
      const onlineCount = chat.members.filter((m) => m.online).length;
      return `${chat.members.length} members · ${onlineCount} online`;
    }
    const me = store.state.session?.user.id;
    const other = chat.members.find((m) => m.userId !== me);
    if (!other) return '';
    return other.online ? 'online' : formatLastSeen(other.lastSeenAt);
  }

  function renderHeader(chat: UIChat): void {
    headerEl.innerHTML = '';
    const back = document.createElement('button');
    back.className = 'icon-btn back-btn';
    back.title = 'Back';
    back.textContent = '‹';
    back.addEventListener('click', () => store.setActiveChat(null));
    headerEl.appendChild(back);

    const avatarId =
      chat.type === 'private'
        ? (chat.members.find((m) => m.userId !== store.state.session?.user.id)?.userId ?? chat.id)
        : chat.id;
    const avatar = avatarEl(avatarId, store.chatTitle(chat), 40);
    if (chat.type === 'group') avatar.classList.add('group-avatar');
    headerEl.appendChild(avatar);

    const info = document.createElement('div');
    info.className = 'chat-header-info';
    const name = document.createElement('div');
    name.className = 'chat-header-name';
    name.textContent = store.chatTitle(chat);
    const sub = document.createElement('div');
    sub.className = 'chat-header-sub';
    sub.id = 'chat-header-sub';
    sub.textContent = subtitle(chat);
    info.append(name, sub);
    headerEl.appendChild(info);

    if (chat.type === 'group') {
      const btn = document.createElement('button');
      btn.className = 'icon-btn';
      btn.title = 'Members';
      btn.textContent = '👥';
      btn.addEventListener('click', () => openMembersModal(chat));
      headerEl.appendChild(btn);
    }
  }

  function updateHeaderSub(chat: UIChat): void {
    const sub = document.querySelector('#chat-header-sub');
    if (sub) sub.textContent = subtitle(chat);
  }

  // ── message nodes ─────────────────────────────────────────────────────
  function isMine(msg: UIMessage): boolean {
    return msg.senderId === store.state.session?.user.id;
  }

  function dayKey(ts: number): string {
    return new Date(ts).toDateString();
  }

  function dayLabel(ts: number): string {
    return new Date(ts).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function bubbleContent(msg: UIMessage): HTMLElement {
    const content = document.createElement('div');
    content.className = 'msg-content';
    content.setAttribute('dir', 'auto'); // RTL-aware bubbles (Persian etc.)
    if (msg.kind === 'text') {
      content.textContent = msg.text ?? '';
    } else if (msg.kind === 'image' && msg.file) {
      const img = document.createElement('img');
      img.src = msg.file.url;
      img.alt = msg.file.name;
      img.loading = 'lazy';
      img.addEventListener('click', () => openLightbox(msg.file!.url, msg.file!.name));
      void authedFileUrl(msg.file.url)
        .then((u) => {
          img.src = u;
        })
        .catch(() => {
          img.classList.add('img-error');
          img.title = 'Failed to load image';
        });
      content.appendChild(img);
      if (msg.text) {
        const cap = document.createElement('div');
        cap.className = 'msg-caption';
        cap.textContent = msg.text;
        content.appendChild(cap);
      }
    } else if (msg.file) {
      const row = document.createElement('div');
      row.className = 'file-row';
      row.innerHTML = `<span class="file-icon">📎</span>`;
      const meta = document.createElement('div');
      meta.className = 'file-meta';
      const fname = document.createElement('div');
      fname.className = 'file-name';
      fname.textContent = msg.file.name;
      const fsize = document.createElement('div');
      fsize.className = 'file-size';
      fsize.textContent = formatBytes(msg.file.size);
      meta.append(fname, fsize);
      const dl = document.createElement('a');
      dl.className = 'file-dl';
      dl.textContent = '⬇';
      dl.href = msg.file.url;
      dl.title = 'Download';
      dl.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          const u = await authedFileUrl(msg.file!.url);
          const a = document.createElement('a');
          a.href = u;
          a.download = msg.file!.name;
          a.click();
        } catch {
          toast('Download failed', 'error');
        }
      });
      row.append(meta, dl);
      content.appendChild(row);
      if (msg.text) {
        const cap = document.createElement('div');
        cap.className = 'msg-caption';
        cap.textContent = msg.text;
        content.appendChild(cap);
      }
    }
    return content;
  }

  function makeMessageNode(chat: UIChat, msg: UIMessage): HTMLElement {
    const mine = isMine(msg);
    const row = document.createElement('div');
    row.className = `msg-row ${mine ? 'mine' : 'theirs'}`;
    row.dataset.key = msg.tempId ? `t:${msg.tempId}` : `m:${msg.id}`;
    if (msg.pending) row.classList.add('pending');
    if (msg.failed) row.classList.add('failed');

    if (!mine && chat.type === 'group') {
      const sender = chat.members.find((m) => m.userId === msg.senderId);
      row.appendChild(avatarEl(msg.senderId, sender?.displayName ?? '?', 34));
    }

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    if (!mine && chat.type === 'group') {
      const senderName = document.createElement('div');
      senderName.className = 'msg-sender';
      const sender = chat.members.find((m) => m.userId === msg.senderId);
      senderName.textContent = sender?.displayName ?? `user ${msg.senderId}`;
      bubble.appendChild(senderName);
    }
    bubble.appendChild(bubbleContent(msg));

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = formatTime(msg.createdAt);
    meta.appendChild(time);
    if (mine) {
      const ticks = document.createElement('span');
      ticks.className = 'msg-ticks';
      ticks.textContent = msg.pending ? '…' : msg.failed ? '!' : '✓';
      ticks.title = msg.failed ? 'Not delivered — click to retry' : 'Sent';
      meta.appendChild(ticks);
    }
    bubble.appendChild(meta);
    row.appendChild(bubble);

    if (msg.failed) {
      row.addEventListener('click', () => {
        if (!msg.tempId) return;
        store.setMessageFailed(chat.id, msg.tempId); // clears failed flag? no — re-send below
        sendText(chat.id, msg.text ?? '', msg.tempId);
      });
    }
    return row;
  }

  function refreshTicks(): void {
    const chat = store.activeChat();
    if (!chat) return;
    const me = store.state.session?.user.id;
    const maxRead = Math.max(0, ...[...chat.readBy.entries()].filter(([uid]) => uid !== me).map(([, v]) => v));
    const mine = messagesEl.querySelectorAll('.msg-row.mine');
    for (const row of mine) {
      const key = (row as HTMLElement).dataset.key ?? '';
      const id = Number(key.startsWith('m:') ? key.slice(2) : 0);
      const ticks = row.querySelector<HTMLElement>('.msg-ticks');
      if (!ticks || !id) continue;
      if (row.classList.contains('pending')) ticks.textContent = '…';
      else if (row.classList.contains('failed')) ticks.textContent = '!';
      else ticks.textContent = id > 0 && maxRead >= id ? '✓✓' : '✓';
    }
  }

  // ── rendering ─────────────────────────────────────────────────────────
  function renderChat(chat: UIChat): void {
    currentChatId = chat.id;
    chatPane.classList.remove('hidden');
    emptyState.classList.add('hidden');
    renderHeader(chat);
    messagesEl.innerHTML = '';
    renderMessages(chat);
    renderTypingBar(chat);
    scrollToBottom(true);
    refreshTicks();
  }

  function renderMessages(chat: UIChat): void {
    messagesEl.innerHTML = '';
    let lastDay = '';
    for (const msg of chat.messages) {
      const d = dayKey(msg.createdAt);
      if (d !== lastDay) {
        lastDay = d;
        const sep = document.createElement('div');
        sep.className = 'day-sep';
        const span = document.createElement('span');
        span.textContent = dayLabel(msg.createdAt);
        sep.appendChild(span);
        messagesEl.appendChild(sep);
      }
      messagesEl.appendChild(makeMessageNode(chat, msg));
    }
  }

  function appendMessage(chat: UIChat, msg: UIMessage): void {
    const d = dayKey(msg.createdAt);
    const nodes = messagesEl.children;
    let lastDay = '';
    for (let i = nodes.length - 1; i >= 0; i--) {
      const el = nodes[i] as HTMLElement;
      if (el.classList.contains('msg-row')) {
        const ts = chat.messages.find((m) => el.dataset.key === (m.tempId ? `t:${m.tempId}` : `m:${m.id}`))?.createdAt;
        lastDay = ts ? dayKey(ts) : '';
        break;
      }
    }
    if (d !== lastDay) {
      const sep = document.createElement('div');
      sep.className = 'day-sep';
      const span = document.createElement('span');
      span.textContent = dayLabel(msg.createdAt);
      sep.appendChild(span);
      messagesEl.appendChild(sep);
    }
    messagesEl.appendChild(makeMessageNode(chat, msg));
  }

  /** Insert an older message ABOVE the current first row (history pagination).
   *  `idx` is its index in chat.messages; the next message in the array is the
   *  one directly below it (already in the DOM from an earlier notify), so we
   *  insert before that row to keep consecutive prepends chronological. */
  function prependMessage(chat: UIChat, msg: UIMessage, idx: number): void {
    const next = idx + 1 < chat.messages.length ? chat.messages[idx + 1] : undefined;
    const nextKey = next ? keyOf(next) : null;
    const anchorEl = nextKey
      ? messagesEl.querySelector<HTMLElement>(`.msg-row[data-key="${CSS.escape(nextKey)}"]`)
      : null;
    const frag = document.createDocumentFragment();
    const d = dayKey(msg.createdAt);
    const nextDay = next ? dayKey(next.createdAt) : '';
    if (next && d !== nextDay) {
      const sep = document.createElement('div');
      sep.className = 'day-sep';
      const span = document.createElement('span');
      span.textContent = dayLabel(msg.createdAt);
      sep.appendChild(span);
      frag.appendChild(sep);
    }
    frag.appendChild(makeMessageNode(chat, msg));
    if (anchorEl) {
      messagesEl.insertBefore(frag, anchorEl);
    } else {
      const firstRow = messagesEl.querySelector<HTMLElement>('.msg-row');
      if (firstRow) messagesEl.insertBefore(frag, firstRow);
      else messagesEl.appendChild(frag);
    }
  }

  function renderTypingBar(chat: UIChat): void {
    const now = Date.now();
    const names = [...chat.typingUsers.entries()]
      .filter(([, exp]) => exp > now)
      .map(([uid]) => {
        const member = chat.members.find((m) => m.userId === uid);
        return member?.displayName ?? `user ${uid}`;
      });
    if (names.length === 0) {
      typingBar.classList.add('hidden');
      typingBar.textContent = '';
      return;
    }
    typingBar.classList.remove('hidden');
    typingBar.innerHTML = `<span class="typing-dots"><i></i><i></i><i></i></span><span>${names.join(', ')} ${names.length > 1 ? 'are' : 'is'} typing…</span>`;
  }

  // ── scroll & history ──────────────────────────────────────────────────
  function scrollToBottom(force = false): void {
    if (force || atBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  messagesEl.addEventListener('scroll', () => {
    const chat = store.activeChat();
    atBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
    if (chat && messagesEl.scrollTop < 60) {
      const first = chat.messages[0];
      if (first && chat.hasMore && !chat.loadingHistory) {
        const prevHeight = messagesEl.scrollHeight;
        void loadMore(chat.id, first.id).then(() => {
          messagesEl.scrollTop = messagesEl.scrollHeight - prevHeight;
        });
      }
    }
  });

  // ── composer ──────────────────────────────────────────────────────────
  composerEl.innerHTML = `
    <button id="attach-btn" class="icon-btn attach-btn" title="Attach file">＋</button>
    <textarea id="msg-input" rows="1" dir="auto" placeholder="Message" maxlength="4096"></textarea>
    <button id="send-btn" class="send-btn" title="Send">➤</button>
    <input type="file" id="file-input" hidden />
    <div id="upload-progress" class="hidden"><div id="upload-bar"></div></div>
  `;

  const input = $('#msg-input') as HTMLTextAreaElement;
  const sendBtn = $('#send-btn') as HTMLButtonElement;
  const attachBtn = $('#attach-btn') as HTMLButtonElement;
  const fileInput = $('#file-input') as HTMLInputElement;
  const progressWrap = $('#upload-progress') as HTMLDivElement;
  const progressBar = $('#upload-bar') as HTMLDivElement;

  function autoGrow(): void {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }

  input.addEventListener('input', () => {
    autoGrow();
    const now = Date.now();
    const chat = store.activeChat();
    if (chat && now - lastTypingSent > 1500) {
      lastTypingSent = now;
      socket.send({ t: 'typing', cid: chat.id });
    }
  });

  function sendText(chatId: number, text: string, tempId?: string): void {
    const t = tempId ?? `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!tempId) {
      store.addMessage(chatId, {
        id: 0,
        chatId,
        senderId: store.state.session?.user.id ?? 0,
        kind: 'text',
        text,
        file: null,
        replyTo: null,
        createdAt: Date.now(),
        tempId: t,
        pending: true,
      });
    }
    socket.send({ t: 'msg.send', cid: chatId, tempId: t, kind: 'text', text });
  }

  function send(): void {
    const chat = store.activeChat();
    const text = input.value.trim();
    if (!chat || !text) return;
    sendText(chat.id, text);
    input.value = '';
    autoGrow();
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    void attachFile(file);
  });

  async function attachFile(file: File): Promise<void> {
    const chat = store.activeChat();
    if (!chat) return;
    progressWrap.classList.remove('hidden');
    try {
      const { file: meta } = await api.upload(file, (pct) => {
        progressBar.style.width = `${pct}%`;
      });
      const kind = isImageMime(meta.mime) ? 'image' : 'file';
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      store.addMessage(chat.id, {
        id: 0,
        chatId: chat.id,
        senderId: store.state.session?.user.id ?? 0,
        kind,
        text: '',
        file: meta,
        replyTo: null,
        createdAt: Date.now(),
        tempId,
        pending: true,
      });
      socket.send({ t: 'msg.send', cid: chat.id, tempId, kind, fileId: meta.id });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      progressWrap.classList.add('hidden');
      progressBar.style.width = '0%';
    }
  }

  // ── store subscription ────────────────────────────────────────────────
  store.subscribe(() => {
    const chat = store.activeChat();
    if (!chat) {
      currentChatId = null;
      chatPane.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }
    if (chat.id !== currentChatId) {
      renderChat(chat);
      return;
    }
    // incremental updates for the already-open chat
    renderHeader(chat); // cheap; keeps presence subtitle fresh
    updateHeaderSub(chat);
    const domRows = [...messagesEl.querySelectorAll<HTMLElement>('.msg-row')];
    const rendered = new Set(domRows.map((el) => el.dataset.key));
    const firstRenderedKey = domRows[0]?.dataset.key ?? null;
    const lastRenderedKey = domRows.length ? (domRows[domRows.length - 1]!.dataset.key ?? null) : null;
    const firstRenderedIdx = firstRenderedKey
      ? chat.messages.findIndex((m) => keyOf(m) === firstRenderedKey)
      : -1;
    let appended = 0;
    for (let i = 0; i < chat.messages.length; i++) {
      const msg = chat.messages[i]!;
      const key = keyOf(msg);
      if (rendered.has(key)) continue;
      // messages older than the rendered window go on top (history pagination);
      // everything else (new msgs, first-page streaming) appends at the bottom
      if (firstRenderedIdx >= 0 && i < firstRenderedIdx) prependMessage(chat, msg, i);
      else {
        appendMessage(chat, msg);
        appended++;
      }
    }
    // reconcile existing nodes whose state changed (pending→acked, failed→resent, text update)
    for (const el of messagesEl.querySelectorAll<HTMLElement>('.msg-row')) {
      const key = el.dataset.key ?? '';
      const storeMsg = chat.messages.find((m) => keyOf(m) === key);
      if (!storeMsg) continue;
      const stateChanged =
        el.classList.contains('pending') !== !!storeMsg.pending ||
        el.classList.contains('failed') !== !!storeMsg.failed;
      if (stateChanged) {
        const fresh = makeMessageNode(chat, storeMsg);
        const oldBubble = el.querySelector('.msg-bubble');
        const newBubble = fresh.querySelector('.msg-bubble');
        if (oldBubble && newBubble) el.replaceChild(newBubble, oldBubble);
        el.classList.toggle('pending', !!storeMsg.pending);
        el.classList.toggle('failed', !!storeMsg.failed);
      }
    }
    // follow new messages only when they were APPENDED and the user is at the
    // bottom. Prepend-only updates (older history) must not move the viewport.
    const newLast = chat.messages[chat.messages.length - 1];
    if (appended > 0 && lastRenderedKey && newLast && keyOf(newLast) !== lastRenderedKey) {
      scrollToBottom();
    }
    renderTypingBar(chat);
    refreshTicks();
  });
}

// ── members modal ───────────────────────────────────────────────────────
function openMembersModal(chat: UIChat): void {
  const root = document.createElement('div');
  root.className = 'members-modal';
  root.innerHTML = `
    <h2>${chat.name ?? 'Group'}</h2>
    <div id="mm-list"></div>
    <div id="mm-add" class="hidden">
      <input id="mm-q" type="text" placeholder="Search users…" maxlength="32" />
      <div id="mm-results"></div>
    </div>
    <button id="mm-toggle">＋ Add member</button>
  `;

  const listEl = root.querySelector<HTMLDivElement>('#mm-list')!;
  const addEl = root.querySelector<HTMLDivElement>('#mm-add')!;
  const toggleBtn = root.querySelector<HTMLButtonElement>('#mm-toggle')!;
  const qInput = root.querySelector<HTMLInputElement>('#mm-q')!;
  const resultsEl = root.querySelector<HTMLDivElement>('#mm-results')!;

  const me = store.state.session?.user.id;
  const amAdmin = chat.members.find((m) => m.userId === me)?.role === 'admin';

  function renderList(members: MemberInfo[]): void {
    listEl.innerHTML = '';
    for (const member of members) {
      const row = document.createElement('div');
      row.className = 'mm-row';
      row.appendChild(avatarEl(member.userId, member.displayName, 32));
      const info = document.createElement('div');
      info.className = 'mm-info';
      const name = document.createElement('div');
      name.className = 'mm-name';
      name.textContent = member.displayName + (member.userId === me ? ' (you)' : '');
      const sub = document.createElement('div');
      sub.className = 'mm-sub';
      sub.textContent = member.online ? 'online' : formatLastSeen(member.lastSeenAt);
      if (member.role === 'admin') sub.textContent += ' · admin';
      info.append(name, sub);
      row.appendChild(info);
      if (amAdmin && member.userId !== me) {
        const kick = document.createElement('button');
        kick.className = 'mm-kick';
        kick.textContent = 'Remove';
        kick.addEventListener('click', async () => {
          try {
            await api.removeMember(chat.id, member.userId);
            toast(`${member.displayName} removed`);
            const updated = chat.members.filter((m) => m.userId !== member.userId);
            store.setMembers(chat.id, updated);
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Failed to remove', 'error');
          }
        });
        row.appendChild(kick);
      }
      listEl.appendChild(row);
    }
  }

  renderList(chat.members);

  toggleBtn.addEventListener('click', () => {
    addEl.classList.toggle('hidden');
    toggleBtn.classList.toggle('hidden');
    if (!addEl.classList.contains('hidden')) qInput.focus();
  });

  let debounce: ReturnType<typeof setTimeout> | undefined;
  qInput.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = qInput.value.trim();
    if (!q) {
      resultsEl.innerHTML = '';
      return;
    }
    debounce = setTimeout(async () => {
      try {
        const { users } = await api.users(q);
        resultsEl.innerHTML = '';
        for (const user of users) {
          if (user.id === me || chat.members.some((m) => m.userId === user.id)) continue;
          const row = document.createElement('div');
          row.className = 'gm-result';
          row.appendChild(avatarEl(user.id, user.displayName, 30));
          const span = document.createElement('span');
          span.textContent = `${user.displayName} (@${user.username})`;
          row.appendChild(span);
          row.addEventListener('click', async () => {
            try {
              const { members } = await api.addMember(chat.id, user.id);
              store.setMembers(chat.id, members as MemberInfo[]);
              renderList(members as MemberInfo[]);
              toast(`${user.displayName} added`);
              qInput.value = '';
              resultsEl.innerHTML = '';
            } catch (err) {
              toast(err instanceof Error ? err.message : 'Failed to add', 'error');
            }
          });
          resultsEl.appendChild(row);
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Search failed', 'error');
      }
    }, 250);
  });

  openModal(root);
}

// ── lightbox ────────────────────────────────────────────────────────────
async function openLightbox(url: string, name: string): Promise<void> {
  const lb = $('#lightbox');
  lb.innerHTML = '';
  lb.classList.remove('hidden');
  const img = document.createElement('img');
  img.alt = name;
  try {
    img.src = await authedFileUrl(url);
  } catch {
    img.alt = 'Failed to load image';
  }
  const close = document.createElement('button');
  close.className = 'lb-close';
  close.textContent = '✕';
  close.addEventListener('click', () => lb.classList.add('hidden'));
  lb.addEventListener('click', (e) => {
    if (e.target === lb) lb.classList.add('hidden');
  });
  lb.append(img, close);
}
