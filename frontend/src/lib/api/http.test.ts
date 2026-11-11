import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from './http';
import { clearTokens, getAccessToken, getRefreshToken, refreshAccessToken, storeTokens } from '@/lib/auth-tokens';

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const authHeader = (call: unknown[]) => new Headers((call[1] as RequestInit | undefined)?.headers).get('Authorization');

describe('apiFetch', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    clearTokens();
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('sends the stored access token', async () => {
    storeTokens({ access_token: 'access-1', refresh_token: 'refresh-1', token_type: 'bearer' });
    fetchMock.mockResolvedValueOnce(json(200, { balance: 5 }));

    const response = await apiFetch('/v1/laces/balance');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/v1\/laces\/balance$/);
    expect(authHeader(fetchMock.mock.calls[0])).toBe('Bearer access-1');
  });

  it('sends no Authorization header when signed out', async () => {
    fetchMock.mockResolvedValueOnce(json(200));

    await apiFetch('/v1/heatmap');

    expect(authHeader(fetchMock.mock.calls[0])).toBeNull();
  });

  it('refreshes the session once on 401 and retries with the new token', async () => {
    storeTokens({ access_token: 'expired', refresh_token: 'refresh-1', token_type: 'bearer' });
    fetchMock
      .mockResolvedValueOnce(json(401))
      .mockResolvedValueOnce(json(200, { access_token: 'access-2', refresh_token: 'refresh-2', token_type: 'bearer' }))
      .mockResolvedValueOnce(json(200, { ok: true }));

    const response = await apiFetch('/v1/laces/daily-stipend', { method: 'POST' });

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/auth\/refresh$/);
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)).toEqual({ refresh_token: 'refresh-1' });
    expect(authHeader(fetchMock.mock.calls[2])).toBe('Bearer access-2');
    expect((fetchMock.mock.calls[2][1] as RequestInit).method).toBe('POST');
    expect(getAccessToken()).toBe('access-2');
    expect(getRefreshToken()).toBe('refresh-2');
  });

  it('ends the session when the refresh token is rejected', async () => {
    storeTokens({ access_token: 'expired', refresh_token: 'revoked', token_type: 'bearer' });
    fetchMock.mockResolvedValueOnce(json(401)).mockResolvedValueOnce(json(401));

    const response = await apiFetch('/v1/laces/balance');

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('shares one refresh request between concurrent callers', async () => {
    storeTokens({ access_token: 'expired', refresh_token: 'refresh-1', token_type: 'bearer' });
    fetchMock.mockResolvedValueOnce(json(200, { access_token: 'access-2', refresh_token: 'refresh-2', token_type: 'bearer' }));

    const [first, second] = await Promise.all([refreshAccessToken(), refreshAccessToken()]);

    expect(first).toBe('access-2');
    expect(second).toBe('access-2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
