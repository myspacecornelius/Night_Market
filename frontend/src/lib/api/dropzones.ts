import { apiFetch } from './http';

/*
 * Typed client for services/routers/dropzones_ext.py.
 * The shapes below were read from the router and confirmed against the running API.
 *
 * Reading needs no sign-in, but a private zone (is_public = false) only exists for its
 * members: everyone else gets it left out of the list and a 404 from every other call.
 */

/**
 * Set once, when the zone is created ("scheduled" if it starts in the future, otherwise "active");
 * no endpoint changes it afterwards. The list's `active` filter and the check-in endpoint also
 * compare starts_at / ends_at with the current time, so an "active" zone whose end has passed
 * is treated as over even though its status still says "active".
 */
export type DropZoneStatus = 'scheduled' | 'active' | 'ended' | 'cancelled';

/** One entry of GET /v1/dropzones, and the body of a successful POST /v1/dropzones. */
export interface DropZone {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  status: DropZoneStatus;
  starts_at: string | null;
  ends_at: string | null;
  member_count: number;
  check_in_count: number;
  created_at: string;
}

export interface DropZoneStats {
  member_count: number;
  total_checkins: number;
  /** Check-ins since the start of the current UTC day. */
  today_checkins: number;
}

export interface DropZoneRecentCheckIn {
  id: string;
  user_id: string;
  message: string | null;
  streak_count: number;
  points_earned: number;
  checked_in_at: string;
}

/**
 * GET /v1/dropzones/{id}.
 * Unlike the list entry it has no top-level member_count / check_in_count: the counts live in `stats`.
 */
export interface DropZoneDetails {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  check_in_radius: number;
  status: DropZoneStatus;
  starts_at: string | null;
  ends_at: string | null;
  rules: string | null;
  tags: string[] | null;
  is_public: boolean;
  created_at: string;
  stats: DropZoneStats;
  /** Newest first, at most 10. */
  recent_checkins: DropZoneRecentCheckIn[];
}

export interface ListDropZonesParams {
  /** "min_lng,min_lat,max_lng,max_lat" */
  bbox?: string;
  /**
   * true: status "active" and inside its time window; false: any status other than "active";
   * omitted: everything. An "active" zone outside its window is only listed when this is omitted.
   */
  active?: boolean;
  /** 1-100, the API defaults to 50. */
  limit?: number;
  offset?: number;
}

/** Body of POST /v1/dropzones. Optional fields must be left out (or null), never sent as "". */
export interface CreateDropZoneRequest {
  /** 1-100 characters. */
  name: string;
  /** Up to 2000 characters. */
  description?: string | null;
  /** -90 to 90. */
  center_lat: number;
  /** -180 to 180. */
  center_lng: number;
  /** Above 0, up to 50000. The API defaults to 100. */
  radius_meters?: number;
  /** Above 0, up to 500. The API defaults to 50. */
  check_in_radius?: number;
  /** ISO 8601. A start in the future makes the zone "scheduled". */
  starts_at?: string | null;
  /** ISO 8601, must be after starts_at. */
  ends_at?: string | null;
  /** At least 1. */
  max_capacity?: number | null;
  /** Up to 5000 characters. */
  rules?: string | null;
  /** Up to 20 tags of 1-50 characters each. */
  tags?: string[] | null;
  /** The API defaults to true. */
  is_public?: boolean;
}

/** Body of POST /v1/dropzones/{id}/checkin. */
export interface CheckInRequest {
  lat: number;
  lng: number;
  /** Up to 1000 characters. */
  message?: string | null;
  /** Up to 500 characters. */
  photo_url?: string | null;
}

export interface CheckInResponse {
  success: boolean;
  check_in_id: string;
  /** Meters between the reported position and the zone center. */
  distance_from_center: number;
  streak_count: number;
  /**
   * 10 plus a streak bonus, or 0 when the check-in pays nothing: at the caller's own zone, or
   * after the third rewarded check-in of the UTC day. `message` says which.
   */
  points_earned: number;
  /** The caller's LACES balance after the check-in reward. */
  laces_balance: number;
  /** For example "Successfully checked in! Streak: 1. No LACES for checking in at your own dropzone." */
  message: string;
}

export interface JoinDropZoneResponse {
  success: boolean;
  message: string;
}

/** A failed drop zone request. `message` is the API's "detail"; `status` is 0 when the API was unreachable. */
export class DropZonesApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'DropZonesApiError';
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
  // loc is e.g. ["body", "center_lat"]; its first entry only says where the value was sent.
  const field = issue.loc.slice(1).join('.');
  const message = issue.msg.replace(/^Value error, /, '');
  return field ? `${field}: ${message}` : message;
}

/** "detail" is a string for 400/401/404/409/429 and a list of validation issues for 422. */
async function errorFromResponse(res: Response, fallback: string): Promise<DropZonesApiError> {
  let detail: unknown;
  try {
    detail = ((await res.json()) as { detail?: unknown }).detail;
  } catch {
    detail = undefined;
  }

  let message = fallback;
  if (typeof detail === 'string' && detail) {
    message = detail;
  } else if (Array.isArray(detail)) {
    const issues = detail.filter(isValidationIssue).map(describeIssue);
    if (issues.length > 0) message = issues.join('; ');
  }
  return new DropZonesApiError(res.status, message);
}

async function request<T>(path: string, fallback: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch {
    throw new DropZonesApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  if (!res.ok) throw await errorFromResponse(res, fallback);
  try {
    return (await res.json()) as T;
  } catch {
    // A 2xx that is not JSON did not come from the API (a proxy's HTML page, for instance).
    throw new DropZonesApiError(res.status, fallback);
  }
}

function postJson(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const DropZonesAPI = {
  /** GET /v1/dropzones. Newest first: public zones plus the caller's own private ones. */
  list(params: ListDropZonesParams = {}): Promise<DropZone[]> {
    const query = new URLSearchParams();
    if (params.bbox) query.set('bbox', params.bbox);
    if (params.active !== undefined) query.set('active', String(params.active));
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));
    const search = query.toString();

    return request<DropZone[]>(`/v1/dropzones${search ? `?${search}` : ''}`, 'Failed to load drop zones');
  },

  /** GET /v1/dropzones/{id}. 404 when the zone does not exist or is private to others. */
  get(id: string): Promise<DropZoneDetails> {
    return request<DropZoneDetails>(`/v1/dropzones/${encodeURIComponent(id)}`, 'Failed to load drop zone');
  },

  /**
   * POST /v1/dropzones (signed in). The creator becomes the owner and first member.
   * 422 invalid input, 429 after five zones in one UTC day.
   */
  create(data: CreateDropZoneRequest): Promise<DropZone> {
    return request<DropZone>('/v1/dropzones', 'Failed to create drop zone', postJson(data));
  },

  /**
   * POST /v1/dropzones/{id}/join (signed in).
   * 400 already a member, 409 at capacity, 404 unknown zone or a private one (those cannot be joined).
   */
  join(dropzoneId: string): Promise<JoinDropZoneResponse> {
    return request<JoinDropZoneResponse>(
      `/v1/dropzones/${encodeURIComponent(dropzoneId)}/join`,
      'Failed to join drop zone',
      { method: 'POST' },
    );
  },

  /**
   * POST /v1/dropzones/{id}/checkin (signed in; membership is not required).
   * 400 too far / already checked in today / not active / not started yet / has ended,
   * 409 at capacity, 404 unknown or private zone, 422 invalid coordinates or message.
   */
  checkIn(dropzoneId: string, data: CheckInRequest): Promise<CheckInResponse> {
    return request<CheckInResponse>(
      `/v1/dropzones/${encodeURIComponent(dropzoneId)}/checkin`,
      'Failed to check in',
      postJson(data),
    );
  },
};
