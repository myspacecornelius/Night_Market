import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearTokens, getAccessToken, getRefreshToken, refreshAccessToken, storeTokens } from '@/lib/auth-tokens';

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('session tokens across tabs', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    clearTokens();
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('keeps the session when another tab renewed it first', async () => {
    // Both tabs hold refresh-1. The other tab's renewal wins on the server and it
    // stores the new pair; ours arrives second and is refused.
    storeTokens({ access_token: 'expired', refresh_token: 'refresh-1', token_type: 'bearer' });
    fetchMock.mockImplementationOnce(async () => {
      storeTokens({ access_token: 'from-other-tab', refresh_token: 'refresh-2', token_type: 'bearer' });
      return json(401);
    });

    const renewed = await refreshAccessToken();

    expect(renewed).toBe('from-other-tab');
    expect(getRefreshToken()).toBe('refresh-2');
  });

  it('gives up when the refresh token is refused and nobody else renewed', async () => {
    storeTokens({ access_token: 'expired', refresh_token: 'revoked', token_type: 'bearer' });
    fetchMock.mockResolvedValueOnce(json(401));

    expect(await refreshAccessToken()).toBeNull();
  });

  it('does not call the server when another tab already renewed while this one waited', async () => {
    storeTokens({ access_token: 'expired', refresh_token: 'refresh-1', token_type: 'bearer' });
    // A cross-tab lock: our turn comes after the other tab has stored its new pair.
    const locks = {
      request: vi.fn(async (_name: string, run: () => Promise<string | null>) => {
        storeTokens({ access_token: 'from-other-tab', refresh_token: 'refresh-2', token_type: 'bearer' });
        return run();
      }),
    };
    vi.stubGlobal('navigator', { ...navigator, locks });

    const renewed = await refreshAccessToken();

    expect(locks.request).toHaveBeenCalledTimes(1);
    expect(renewed).toBe('from-other-tab');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('logout', () => {
  const fetchMock = vi.fn();
  // The test setup replaces the API client with a mock for every other test file;
  // this one is about the real thing.
  let apiClient: (typeof import('@/lib/api-client'))['apiClient'];

  beforeEach(async () => {
    ({ apiClient } = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client'));
    vi.stubGlobal('fetch', fetchMock);
    clearTokens();
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('ends the session on the server with the token it is about to forget', async () => {
    storeTokens({ access_token: 'access-1', refresh_token: 'refresh-1', token_type: 'bearer' });
    fetchMock.mockResolvedValueOnce(json(200, { message: 'Successfully logged out' }));

    apiClient.logout();

    // the tokens are gone at once, and the server was still told whose session to end
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toMatch(/\/auth\/logout$/);
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer access-1');
  });

  it('makes no request when nobody is signed in', () => {
    apiClient.logout();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
