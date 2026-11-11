// Token storage and refresh, shared by every module that talks to the API.

export const API_BASE_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const ACCESS_KEY = 'auth_token';
const REFRESH_KEY = 'refresh_token';

export interface TokenPair {
  access_token: string;
  refresh_token?: string;
  token_type: string;
}

export const getAccessToken = (): string | null => localStorage.getItem(ACCESS_KEY);
export const getRefreshToken = (): string | null => localStorage.getItem(REFRESH_KEY);

export function storeTokens(tokens: TokenPair): void {
  localStorage.setItem(ACCESS_KEY, tokens.access_token);
  if (tokens.refresh_token) {
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
  }
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

/** Forget the session and send the user to the login page. */
export function endSession(): void {
  clearTokens();
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

let refreshInFlight: Promise<string | null> | null = null;

const REFRESH_LOCK = 'night-market-session-refresh';

type LockManagerLike = { request: (name: string, run: () => Promise<string | null>) => Promise<string | null> };

/**
 * One renewal attempt. `seen` is the refresh token this tab held when it decided
 * to renew. Tabs share the stored tokens, and the API accepts a refresh token only
 * once, so another tab may already have renewed the session:
 *  - before our turn: the stored token is no longer `seen`, and its pair is used
 *    without asking the server;
 *  - at the same moment: our request is refused, but by then the other tab's pair
 *    is in storage, and that is used instead of giving up.
 */
async function renewSession(seen: string | null): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  if (seen !== null && refreshToken !== seen) return getAccessToken();
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) {
      const current = getRefreshToken();
      return current !== null && current !== refreshToken ? getAccessToken() : null;
    }
    const tokens = (await response.json()) as TokenPair;
    storeTokens(tokens);
    return tokens.access_token;
  } catch {
    return null;
  }
}

/**
 * Exchange the stored refresh token for a new pair.
 * Returns the access token to use, or null when the session cannot be renewed.
 * Callers in this tab share one request; tabs take turns through the Web Locks
 * API where the browser has it.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  const seen = getRefreshToken();
  const locks = (globalThis.navigator as unknown as { locks?: LockManagerLike } | undefined)?.locks;
  const attempt: Promise<string | null> = locks
    ? locks.request(REFRESH_LOCK, () => renewSession(seen))
    : renewSession(seen);
  const flight = attempt
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });
  refreshInFlight = flight;
  return flight;
}
