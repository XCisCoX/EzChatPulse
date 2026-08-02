import { store } from '../store';
import { avatarEl, formatTime } from './format';
import { openCreateGroupModal, openNewChatModal } from './group';
import type { UIChat, UIMessage } from '../types';

function previewText(m: UIMessage | null): string {
  if (!m) return 'No messages yet';
  if (m.kind === 'image') return '📷 Photo';
  if (m.kind === 'file') return `📎 ${m.file?.name ?? 'File'}`;
  return m.text ?? '';
}

export function mountSidebar(onSelect: (chatId: number) => void): void {
  const list = document.querySelector('#chat-list')!;
  const meChip = document.querySelector('#me-chip')!;
  const newGroupBtn = document.querySelector<HTMLButtonElement>('#btn-new-group')!;
  const newChatBtn = document.querySelector<HTMLButtonElement>('#btn-new-chat')!;
  let lastKey = '';

  function renderMe(): void {
    const session = store.state.session;
    if (!session) return;
    meChip.innerHTML = '';
    meChip.appendChild(avatarEl(session.user.id, session.user.displayName, 36));
    const span = document.createElement('span');
    span.className = 'me-name';
    span.textContent = session.user.displayName;
    meChip.appendChild(span);
    const dot = document.createElement('span');
    dot.className = `conn-dot conn-${store.state.connection}`;
    dot.title = `connection: ${store.state.connection}`;
    meChip.appendChild(dot);
  }

  function chatItem(chat: UIChat): HTMLElement {
    const el = document.createElement('div');
    el.className = 'chat-item' + (store.state.activeChatId === chat.id ? ' active' : '');
    const me = store.state.session?.user.id;
    const title = store.chatTitle(chat);

    const avatarId =
      chat.type === 'private' ? (chat.members.find((m) => m.userId !== me)?.userId ?? chat.id) : chat.id;
    const avatarName = chat.type === 'private' ? title : chat.name ?? 'G';
    const avatar = avatarEl(avatarId, avatarName, 46);
    if (chat.type === 'group') avatar.classList.add('group-avatar');

    // presence dot for private chats
    if (chat.type === 'private') {
      const other = chat.members.find((m) => m.userId !== me);
      if (other) {
        const dot = document.createElement('span');
        dot.className = `presence-dot ${other.online ? 'online' : ''}`;
        avatar.appendChild(dot);
      }
    }
    el.appendChild(avatar);

    const body = document.createElement('div');
    body.className = 'chat-item-body';

    const top = document.createElement('div');
    top.className = 'chat-item-top';
    const nameEl = document.createElement('span');
    nameEl.className = 'chat-item-name';
    nameEl.textContent = title + (chat.type === 'group' ? ` · ${chat.members.length}` : '');
    const timeEl = document.createElement('span');
    timeEl.className = 'chat-item-time';
    timeEl.textContent = chat.lastMessage ? formatTime(chat.lastMessage.createdAt) : '';
    top.append(nameEl, timeEl);

    const bottom = document.createElement('div');
    bottom.className = 'chat-item-bottom';
    const preview = document.createElement('span');
    preview.className = 'chat-item-preview';
    const lm = chat.lastMessage;
    const prefix = lm && lm.senderId === me ? 'You: ' : '';
    preview.textContent = lm ? prefix + previewText(lm) : previewText(null);
    const unread = document.createElement('span');
    unread.className = 'unread-badge' + (chat.unread > 0 ? '' : ' hidden');
    unread.textContent = String(Math.min(chat.unread, 99));
    bottom.append(preview, unread);

    body.append(top, bottom);
    el.appendChild(body);
    el.addEventListener('click', () => onSelect(chat.id));
    return el;
  }

  function render(): void {
    renderMe();
    const chats = store.sortedChats();
    // activeChatId is part of the key so the .active highlight moves on switch
    const key =
      `active:${store.state.activeChatId}|` +
      chats
        .map(
          (c) =>
            `${c.id}:${c.lastMessage?.id ?? 0}:${c.unread}:${c.members
              .map((m) => `${m.userId}${m.online ? '+on' : ''}`)
              .join(',')}`,
        )
        .join('|');
    if (key === lastKey) return;
    lastKey = key;
    list.innerHTML = '';
    if (chats.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'list-empty';
      hint.textContent = 'No chats yet — tap “✎ New chat” to start';
      list.appendChild(hint);
      return;
    }
    for (const chat of chats) list.appendChild(chatItem(chat));
  }

  newGroupBtn.addEventListener('click', () => openCreateGroupModal());
  newChatBtn.addEventListener('click', () => openNewChatModal());
  store.subscribe(render);
  render();
}
