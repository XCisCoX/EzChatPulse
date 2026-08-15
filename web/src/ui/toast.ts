export function toast(message: string, kind: 'error' | 'info' = 'info'): void {
  const root = document.querySelector('#toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

export function openModal(content: HTMLElement): () => void {
  const root = document.querySelector('#modal-root');
  if (!root) return () => {};
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const box = document.createElement('div');
  box.className = 'modal-box';
  box.appendChild(content);
  overlay.appendChild(box);
  root.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  const close = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  return close;
}

/** Promise-based confirm dialog. Resolves true when the user confirms. */
export function confirmDialog(title: string, body: string, confirmLabel = 'Delete'): Promise<boolean> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'confirm-modal';
    const h = document.createElement('h2');
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = body;
    const actions = document.createElement('div');
    actions.className = 'confirm-actions';
    const cancel = document.createElement('button');
    cancel.className = 'confirm-cancel';
    cancel.textContent = 'Cancel';
    const confirm = document.createElement('button');
    confirm.className = 'confirm-delete';
    confirm.textContent = confirmLabel;
    const close = openModal(root);
    let done = false;
    const finish = (v: boolean): void => {
      if (done) return;
      done = true;
      close();
      resolve(v);
    };
    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    actions.append(cancel, confirm);
    root.append(h, p, actions);
  });
}
