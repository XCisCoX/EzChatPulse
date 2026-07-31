import { api } from '../api';
import { store } from '../store';
import { openModal, toast } from './toast';
import { avatarEl } from './format';
import type { UserDTO } from '../types';

let closeCurrent: (() => void) | null = null;

/** Shared user-search modal content. `onPick` is called with the chosen user. */
function userSearchModal(title: string, onPick: (user: UserDTO) => void): void {
  closeCurrent?.();
  const root = document.createElement('div');
  root.className = 'group-modal';
  root.innerHTML = `
    <h2>${title}</h2>
    <input id="gm-q" type="text" placeholder="Search users…" maxlength="32" autofocus />
    <div id="gm-results"></div>
  `;
  const qInput = root.querySelector<HTMLInputElement>('#gm-q')!;
  const resultsEl = root.querySelector<HTMLDivElement>('#gm-results')!;

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
        const me = store.state.session?.user.id;
        resultsEl.innerHTML = '';
        for (const user of users) {
          if (user.id === me) continue;
          const row = document.createElement('div');
          row.className = 'gm-result';
          row.appendChild(avatarEl(user.id, user.displayName, 30));
          const span = document.createElement('span');
          span.textContent = `${user.displayName} (@${user.username})`;
          row.appendChild(span);
          row.addEventListener('click', () => {
            closeCurrent?.();
            onPick(user);
          });
          resultsEl.appendChild(row);
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Search failed', 'error');
      }
    }, 250);
  });

  closeCurrent = openModal(root);
}

/** Modal: start a private chat with a searched user. */
export function openNewChatModal(): void {
  userSearchModal('New chat', async (user) => {
    try {
      const { chatId } = await api.createPrivate(user.id);
      store.setActiveChat(chatId);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to start chat', 'error');
    }
  });
}

/** Modal: create a group chat (name + searchable member picker). */
export function openCreateGroupModal(): void {
  closeCurrent?.();
  const root = document.createElement('div');
  root.className = 'group-modal';

  root.innerHTML = `
    <h2>New group</h2>
    <input id="gm-name" type="text" placeholder="Group name" maxlength="64" />
    <div class="gm-search">
      <input id="gm-q" type="text" placeholder="Search users to add…" maxlength="32" />
      <div id="gm-results"></div>
    </div>
    <div id="gm-selected"></div>
    <button id="gm-create" disabled>Create group</button>
  `;

  const nameInput = root.querySelector<HTMLInputElement>('#gm-name')!;
  const qInput = root.querySelector<HTMLInputElement>('#gm-q')!;
  const resultsEl = root.querySelector<HTMLDivElement>('#gm-results')!;
  const selectedEl = root.querySelector<HTMLDivElement>('#gm-selected')!;
  const createBtn = root.querySelector<HTMLButtonElement>('#gm-create')!;

  const selected = new Map<number, UserDTO>();

  function renderSelected(): void {
    selectedEl.innerHTML = '';
    for (const user of selected.values()) {
      const chip = document.createElement('div');
      chip.className = 'gm-chip';
      chip.appendChild(avatarEl(user.id, user.displayName, 24));
      const span = document.createElement('span');
      span.textContent = user.displayName;
      chip.appendChild(span);
      chip.addEventListener('click', () => {
        selected.delete(user.id);
        renderSelected();
        updateCreate();
      });
      selectedEl.appendChild(chip);
    }
    updateCreate();
  }

  function updateCreate(): void {
    createBtn.disabled = !nameInput.value.trim() || selected.size === 0;
  }

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
        const me = store.state.session?.user.id;
        resultsEl.innerHTML = '';
        for (const user of users) {
          if (user.id === me || selected.has(user.id)) continue;
          const row = document.createElement('div');
          row.className = 'gm-result';
          row.appendChild(avatarEl(user.id, user.displayName, 30));
          const span = document.createElement('span');
          span.textContent = `${user.displayName} (@${user.username})`;
          row.appendChild(span);
          row.addEventListener('click', () => {
            selected.set(user.id, user);
            renderSelected();
            qInput.value = '';
            resultsEl.innerHTML = '';
          });
          resultsEl.appendChild(row);
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Search failed', 'error');
      }
    }, 250);
  });

  nameInput.addEventListener('input', updateCreate);
  updateCreate();

  createBtn.addEventListener('click', async () => {
    createBtn.disabled = true;
    try {
      const { chatId } = await api.createGroup(nameInput.value.trim(), [...selected.keys()]);
      closeCurrent?.();
      // the chat.created ws event will add it to the sidebar; open it directly
      store.setActiveChat(chatId);
      toast('Group created');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create group', 'error');
      createBtn.disabled = false;
    }
  });

  closeCurrent = openModal(root);
}
