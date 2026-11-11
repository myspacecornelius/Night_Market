import { API_BASE_URL, endSession, getAccessToken, refreshAccessToken } from '@/lib/auth-tokens';

function withAuth(init: RequestInit | undefined, token: string | null): RequestInit {
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

/**
 * fetch() against the API with the signed-in user's token.
 * A 401 triggers one token refresh and one retry; if that fails the session ends.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${API_BASE_URL}${path}`;
  let response = await fetch(url, withAuth(init, getAccessToken()));

  if (response.status === 401) {
    const renewed = await refreshAccessToken();
    if (renewed) {
      response = await fetch(url, withAuth(init, renewed));
    }
    if (response.status === 401) {
      endSession();
    }
  }
  return response;
}
