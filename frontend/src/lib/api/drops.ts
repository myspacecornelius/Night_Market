import { apiFetch } from './http';

/*
 * Typed client for the release calendar in services/routers/drops.py.
 * The shapes below were read from the router's response models and confirmed against the running API.
 *
 * Reading needs no sign-in; following does. For a caller who is not signed in every drop's
 * is_following is false. Timestamps are ISO 8601 strings in UTC; ids are UUID strings.
 */

/** The values of the drop's status; also the allowed values of the list's status filter. */
export type DropStatus = 'upcoming' | 'live' | 'sold_out' | 'delayed' | 'cancelled' | 'ended';

/**
 * The API's own countdown, worked out when the response was built, so it is out of date
 * a minute later: a page that stays open computes its countdown from release_at instead.
 */
export type TimeUntilDrop =
  | { status: 'no_date' }
  | { status: 'live_or_past' }
  | { status: 'upcoming'; days: number; hours: number; minutes: number; total_seconds: number };

/** A drop, as every route returns it. */
export interface Drop {
  id: string;
  brand: string;
  sku: string | null;
  name: string;
  description: string | null;
  /** null while no release date has been announced. */
  release_at: string | null;
  /** The API does not say in which currency. */
  retail_price: number | null;
  image_url: string | null;
  status: DropStatus;
  /** For example ["US", "EU"]. */
  regions: string[] | null;
  /** Free text, usually "FCFS", "RAFFLE", "SHOCK_DROP" or "EXCLUSIVE". */
  release_type: string | null;
  /**
   * Whatever was stored with the drop: usually a name mapped to a URL ({"snkrs": "https://..."}),
   * but a value can also be a list or anything else JSON can hold. Not checked by the API.
   */
  links: Record<string, unknown> | null;
  /** Community hype: one point per follower, two per signal about the drop. */
  hype_score: number;
  /** How many users follow the drop. */
  interest_count: number;
  signal_count: number;
  is_featured: boolean;
  is_verified: boolean;
  time_until_drop: TimeUntilDrop;
  /** How many stores carry the drop. */
  store_count: number;
  /** Whether the caller follows the drop; always false for a caller who is not signed in. */
  is_following: boolean;
}

/** GET /v1/drops/ and GET /v1/drops/following. */
export interface DropsPage {
  drops: Drop[];
  /** Number of drops matching the request, across all pages. */
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

/**
 * Filters of GET /v1/drops/. Without from_date and to_date the API lists what releases within
 * the next four weeks plus the drops that have no date yet; featured drops come first, then
 * the soonest release.
 */
export interface ListDropsParams {
  /** Part of the brand name, any case. */
  brand?: string;
  status?: DropStatus;
  /** Exactly one of the drop's regions, for example "US". */
  region?: string;
  /** Part of the city of a store that carries the drop, any case. */
  city?: string;
  /** ISO 8601; without an offset it is read as UTC. */
  from_date?: string;
  /** ISO 8601; without an offset it is read as UTC. */
  to_date?: string;
  featured_only?: boolean;
  /** 1-based; the API defaults to 1. */
  page?: number;
  /** 1 to 100; the API defaults to 20. */
  per_page?: number;
}

/** Parameters of GET /v1/drops/following. */
export interface FollowingParams {
  /**
   * true (the API's default) leaves out drops whose release date has passed. With false they
   * are listed after the ones still to come, most recent first.
   */
  upcoming_only?: boolean;
  /** 1-based; the API defaults to 1. */
  page?: number;
  /** 1 to 100; the API defaults to 20. */
  per_page?: number;
}

/** The answer to a follow or an unfollow: the caller's state and the drop's new counters. */
export interface DropFollowState {
  following: boolean;
  interest_count: number;
  hype_score: number;
}

/** GET /v1/drops/stats/overview */
export interface DropsStats {
  total_drops: number;
  /** Status "upcoming" with a release date still ahead. */
  upcoming_drops: number;
  live_drops: number;
  /** Releasing between Monday 00:00 UTC of this week and the next. */
  this_week_drops: number;
  /** At most ten, the brand with the most drops first. */
  top_brands: { brand: string; count: number }[];
  /** Drops without a release type are not counted. */
  release_types: { type: string; count: number }[];
}

/** A failed drops request. `message` is the API's "detail"; `status` is 0 when the API was unreachable. */
export class DropsApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'DropsApiError';
    this.status = status;
  }
}

interface ValidationIssue {
  loc: (string | number)[];
  msg: string;
}

function isValidationIssue(value: unknown): value is ValidationIssue {
  if (typeof value !== 'object' || value === null) return false;
  const issue = value as { loc?: unknown; msg?: unknown };
  return Array.isArray(issue.loc) && typeof issue.msg === 'string';
}

function describeIssue(issue: ValidationIssue): string {
  // loc is e.g. ["query", "per_page"]; its first entry only says where the value was sent.
  const field = issue.loc.slice(1).join('.');
  return field ? `${field}: ${issue.msg}` : issue.msg;
}

/**
 * Build an error from a failed response. The API puts the reason in "detail":
 * a string (401, 403, 404, 409, 429), or a list of validation issues for a 422.
 */
async function errorFromResponse(res: Response, fallback: string): Promise<DropsApiError> {
  let detail: unknown;
  try {
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null) {
      detail = (body as { detail?: unknown }).detail;
    }
  } catch {
    // Not a JSON body (a proxy's error page, say): use the fallback message.
  }

  if (typeof detail === 'string' && detail.trim() !== '') {
    return new DropsApiError(res.status, detail);
  }
  if (Array.isArray(detail)) {
    const issues = detail.filter(isValidationIssue).map(describeIssue);
    if (issues.length > 0) return new DropsApiError(res.status, issues.join('; '));
  }
  return new DropsApiError(res.status, `${fallback} (HTTP ${res.status})`);
}

/** apiFetch, with a readable error when the API cannot be reached, refuses the request or answers nonsense. */
async function request<T>(path: string, fallback: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch {
    // fetch() itself failed; its own message ("Failed to fetch") says nothing to the user.
    throw new DropsApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  if (!res.ok) throw await errorFromResponse(res, fallback);
  try {
    return (await res.json()) as T;
  } catch {
    throw new DropsApiError(res.status, `${fallback}: the server's answer could not be read`);
  }
}

/** "?a=1&b=2" from the values that are set; an empty string when none is. */
function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(name, String(value));
  }
  const search = query.toString();
  return search ? `?${search}` : '';
}

export const DropsAPI = {
  list(params: ListDropsParams = {}): Promise<DropsPage> {
    // The trailing slash is the route's own path: without it the API answers with a redirect.
    return request<DropsPage>(`/v1/drops/${queryString({ ...params })}`, 'Could not load the drops');
  },

  /** Rejects with "Drop not found" (404) for an id that does not exist. */
  get(dropId: string): Promise<Drop> {
    return request<Drop>(`/v1/drops/${encodeURIComponent(dropId)}`, 'Could not load the drop');
  },

  /** The signed-in user's followed drops, soonest release first. */
  following(params: FollowingParams = {}): Promise<DropsPage> {
    return request<DropsPage>(
      `/v1/drops/following${queryString({ ...params })}`,
      'Could not load the drops you follow',
    );
  },

  /** Follow a drop. Following a drop that is already followed changes nothing. */
  follow(dropId: string): Promise<DropFollowState> {
    return request<DropFollowState>(
      `/v1/drops/${encodeURIComponent(dropId)}/interest`,
      'Could not follow the drop',
      { method: 'POST' },
    );
  },

  /** Stop following a drop. Unfollowing a drop that is not followed changes nothing. */
  unfollow(dropId: string): Promise<DropFollowState> {
    return request<DropFollowState>(
      `/v1/drops/${encodeURIComponent(dropId)}/interest`,
      'Could not unfollow the drop',
      { method: 'DELETE' },
    );
  },

  stats(): Promise<DropsStats> {
    return request<DropsStats>('/v1/drops/stats/overview', 'Could not load the drop statistics');
  },
};
