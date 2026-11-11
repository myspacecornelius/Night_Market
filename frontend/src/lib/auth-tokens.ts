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

/**
 * Exchange the stored refresh token for a new pair.
 * Returns the new access token, or null when the session cannot be renewed.
 * Concurrent callers share one request, because the API rotates refresh tokens
 * and a second request with the same token would be rejected.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return null;
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!response.ok) return null;
        const tokens = (await response.json()) as TokenPair;
        storeTokens(tokens);
        return tokens.access_token;
      } catch {
        return null;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}
