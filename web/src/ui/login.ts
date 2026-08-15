import { api, setToken } from '../api';
import { store } from '../store';
import { toast } from './toast';

/** Mount the register/login screen. Calls onSuccess after a successful auth. */
export function mountLogin(onSuccess: () => void): void {
  const root = document.querySelector('#login-view')!;
  root.innerHTML = `
    <div class="login-card">
      <div class="login-logo">◉</div>
      <h1>EzChatPulse</h1>
      <p class="login-sub">fast · private · yours</p>
      <div class="login-tabs">
        <button type="button" class="tab active" data-tab="login">Sign in</button>
        <button type="button" class="tab" data-tab="register">Create account</button>
      </div>
      <form id="login-form" autocomplete="on">
        <div id="register-fields" class="hidden">
          <input id="f-display" type="text" placeholder="Display name" maxlength="32" autocomplete="nickname" />
        </div>
        <input id="f-username" type="text" placeholder="Username" maxlength="32" autocomplete="username" required />
        <input id="f-password" type="password" placeholder="Password (min 8 characters)" minlength="8" autocomplete="current-password" required />
        <button type="submit" id="login-submit">Sign in</button>
        <p class="login-error hidden"></p>
      </form>
    </div>`;

  const tabs = [...root.querySelectorAll<HTMLButtonElement>('.tab')];
  const registerFields = root.querySelector<HTMLDivElement>('#register-fields')!;
  const submitBtn = root.querySelector<HTMLButtonElement>('#login-submit')!;
  const errEl = root.querySelector<HTMLParagraphElement>('.login-error')!;

  tabs.forEach((tab) =>
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const isRegister = tab.dataset.tab === 'register';
      registerFields.classList.toggle('hidden', !isRegister);
      submitBtn.textContent = isRegister ? 'Create account' : 'Sign in';
    }),
  );

  root.querySelector<HTMLFormElement>('#login-form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const isRegister = !registerFields.classList.contains('hidden');
    const username = (root.querySelector<HTMLInputElement>('#f-username')!).value.trim();
    const password = root.querySelector<HTMLInputElement>('#f-password')!.value;
    const display = root.querySelector<HTMLInputElement>('#f-display')!.value.trim();

    errEl.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = isRegister ? 'Creating…' : 'Signing in…';
    try {
      const session = isRegister
        ? await api.register(username, display || username, password)
        : await api.login(username, password);
      setToken(session.token);
      store.setSession(session);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      errEl.textContent = message;
      errEl.classList.remove('hidden');
      submitBtn.classList.remove('shake');
      void submitBtn.offsetWidth; // restart animation
      submitBtn.classList.add('shake');
      toast(message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isRegister ? 'Create account' : 'Sign in';
    }
  });
}
