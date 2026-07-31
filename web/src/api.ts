import type { ChatDTO, FileDTO, MessageDTO, Session, UserDTO } from './types';

const TOKEN_KEY = 'chatpulse.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...((options.headers as Record<string, string>) ?? {}) };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
  return body as T;
}

export const api = {
  register: (username: string, displayName: string, password: string) =>
    request<Session>('/api/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, displayName, password }),
    }),
  login: (username: string, password: string) =>
    request<Session>('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<{ user: UserDTO }>('/api/me'),
  users: (q: string) => request<{ users: UserDTO[] }>(`/api/users?q=${encodeURIComponent(q)}`),
  chats: () => request<{ chats: ChatDTO[] }>('/api/chats'),
  createPrivate: (userId: number) =>
    request<{ chatId: number }>('/api/chats', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'private', userId }),
    }),
  createGroup: (name: string, userIds: number[]) =>
    request<{ chatId: number }>('/api/chats', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'group', name, userIds }),
    }),
  chat: (id: number) => request<{ chat: ChatDTO }>(`/api/chats/${id}`),
  messages: (id: number, before?: number) =>
    request<{ messages: MessageDTO[] }>(`/api/chats/${id}/messages${before ? `?before=${before}` : ''}`),
  read: (id: number, msgId: number) =>
    request<{ ok: boolean }>(`/api/chats/${id}/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ msgId }),
    }),
  addMember: (id: number, userId: number) =>
    request<{ members: unknown[] }>(`/api/chats/${id}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId }),
    }),
  removeMember: (id: number, userId: number) =>
    request<{ ok: boolean }>(`/api/chats/${id}/members`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId }),
    }),
  upload: (file: File, onProgress?: (pct: number) => void) =>
    new Promise<{ file: FileDTO }>((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload');
      const token = getToken();
      if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          let message = 'Upload failed';
          try {
            message = JSON.parse(xhr.responseText).error ?? message;
          } catch {
            /* keep default */
          }
          reject(new ApiError(xhr.status, message));
        }
      };
      xhr.onerror = () => reject(new ApiError(0, 'Network error'));
      xhr.send(fd);
    }),
};
