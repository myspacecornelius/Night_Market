// Lightweight client wrappers for experimental endpoints.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// Hyperlocal follows / heat subscriptions
export const Hyperlocal = {
  followCell: (cellId: string) => http(`/hyperlocal/cells/${cellId}/follow`, { method: 'POST' }),
  unfollowCell: (cellId: string) => http(`/hyperlocal/cells/${cellId}/follow`, { method: 'DELETE' }),
  listFollows: () => http<string[]>(`/hyperlocal/cells/follows`),
  subscribeHeat: (threshold = 5) => http(`/hyperlocal/heat/subscribe?threshold=${threshold}`, { method: 'POST' }),
  listHeatSubscriptions: () => http<{ items: { threshold: number }[] }>(`/hyperlocal/heat/subscriptions`),
};

// Heatmap
export const Heatmap = {
  get: (params?: { bbox?: string; zoom?: number; window?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.bbox) searchParams.set('bbox', params.bbox);
    if (params?.zoom) searchParams.set('zoom', params.zoom.toString());
    if (params?.window) searchParams.set('window', params.window);
    return http(`/v1/heatmap?${searchParams.toString()}`);
  },
  refresh: () => http(`/v1/heatmap/refresh`, { method: 'POST' }),
};

// Dropzones (updated for v1 API)
export const Dropzones = {
  create: (data: {
    name: string;
    description?: string;
    center_lat: number;
    center_lng: number;
    radius_meters?: number;
    check_in_radius?: number;
    starts_at?: string;
    ends_at?: string;
    max_capacity?: number;
    rules?: string;
    tags?: string[];
    is_public?: boolean;
  }) => http(`/dropzones`, { method: 'POST', body: JSON.stringify(data) }),
  list: (params?: { bbox?: string; active?: boolean; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.bbox) searchParams.set('bbox', params.bbox);
    if (params?.active !== undefined) searchParams.set('active', params.active.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());
    return http(`/dropzones?${searchParams.toString()}`);
  },
  get: (id: string) => http(`/dropzones/${id}`),
  join: (id: string) => http(`/dropzones/${id}/join`, { method: 'POST' }),
  checkin: (id: string, data: { lat: number; lng: number; message?: string; photo_url?: string }) =>
    http(`/dropzones/${id}/checkin`, { method: 'POST', body: JSON.stringify(data) }),
};

// LACES Token System
export const Laces = {
  getBalance: () => http(`/v1/laces/balance`),
  getLedger: (params?: { page?: number; limit?: number; transaction_type?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.transaction_type) searchParams.set('transaction_type', params.transaction_type);
    return http(`/v1/laces/ledger?${searchParams.toString()}`);
  },
  claimStipend: () => http(`/v1/laces/daily-stipend`, { method: 'POST' }),
  getOpportunities: () => http(`/v1/laces/opportunities`),
  boostPost: (postId: string, amount: number) =>
    http(`/v1/laces/boost-post/${postId}?boost_amount=${amount}`, { method: 'POST' }),
};

// Quests
export const Quests = {
  progress: () => http(`/quests/progress`),
  complete: (id: string) => http(`/quests/complete?quest_id=${encodeURIComponent(id)}`, { method: 'POST' }),
  leaderboard: () => http(`/leaderboard`),
};

