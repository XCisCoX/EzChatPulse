import { api } from './api';
import { store } from './store';
import { socket } from './ws';

/** Refresh the whole chat list from the server. */
export async function refreshChats(): Promise<void> {
  const { chats } = await api.chats();
  for (const c of chats) store.upsertChat(c);
}

/** Fetch a single chat's full detail (used after chat.created events). */
export async function loadChatDetail(chatId: number): Promise<void> {
  try {
    const { chat } = await api.chat(chatId);
    store.upsertChat(chat);
  } catch (err) {
    console.warn('loadChatDetail failed', err);
  }
}

/** Open a chat: load its first history page if empty, then mark as read. */
export async function openChat(chatId: number): Promise<void> {
  store.setActiveChat(chatId);
  const chat = store.state.chats.get(chatId);
  if (!chat) return;
  if (chat.messages.length === 0) await loadMore(chatId);
  const last = chat.messages[chat.messages.length - 1];
  if (last && last.id > 0) {
    chat.unread = 0;
    socket.send({ t: 'read', cid: chatId, msgId: last.id });
    store.touch();
  }
}

/** Load one page of history (newest page first, or older than `before`). */
export async function loadMore(chatId: number, before?: number): Promise<void> {
  const chat = store.state.chats.get(chatId);
  if (!chat || chat.loadingHistory || !chat.hasMore) return;
  chat.loadingHistory = true;
  store.touch();
  try {
    const { messages } = await api.messages(chatId, before);
    // newest-first from the API → append in chronological order
    for (const m of [...messages].reverse()) {
      store.addMessage(chatId, m, before ? 'prepend' : 'append');
    }
    chat.hasMore = messages.length >= 50;
  } finally {
    chat.loadingHistory = false;
    store.touch();
  }
}
