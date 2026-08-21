import type { Capability } from './types.js';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

let sessionToken: string | null = localStorage.getItem('deliveryos.token');

export function setToken(token: string | null): void {
  sessionToken = token;
  if (token) localStorage.setItem('deliveryos.token', token);
  else localStorage.removeItem('deliveryos.token');
}

export const getToken = () => sessionToken;

/**
 * Every request goes through here so the error shape the UI handles is the
 * error shape the API actually returns — one place to change if that contract
 * moves.
 */
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (sessionToken) headers.set('authorization', `Bearer ${sessionToken}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`/api${path}`, { ...options, headers, credentials: 'include' });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = (payload as { error?: { code: string; message: string; details?: unknown } }).error;
    if (response.status === 401 && sessionToken) {
      // The session expired underneath the user. Clear it so the app falls
      // back to the sign-in screen instead of looping on 401s.
      setToken(null);
    }
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? `Request failed with status ${response.status}`,
      error?.details,
    );
  }

  return payload as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export interface Session {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    jobTitle: string | null;
    avatarColor: string | null;
  };
  capabilities: Capability[];
}
