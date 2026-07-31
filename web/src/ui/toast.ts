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
