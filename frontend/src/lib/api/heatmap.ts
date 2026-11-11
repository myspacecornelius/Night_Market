import { apiFetch } from './http';

/*
 * Typed client for services/routers/heatmap.py, plus the one read of
 * services/routers/dropzones_ext.py that the heat map page overlays on its map.
 * The shapes below were read from the routers and confirmed against the running API.
 *
 * GET /v1/heatmap is public and only counts posts that are public, not archived and geo-tagged.
 * The API caches each answer for a while (about a minute for 1h, five minutes for 24h, an hour
 * for 7d); POST /v1/heatmap/refresh (signed in) drops that cache so the next read is recounted.
 * That flush is shared by everybody and runs at most once every 30 seconds.
 */

export type HeatmapWindow = '1h' | '24h' | '7d';

export const HEATMAP_WINDOWS: readonly HeatmapWindow[] = ['1h', '24h', '7d'];

/**
 * The API calls this "zoom", but it is the geohash precision of the bins (characters per
 * geohash), not a map zoom level. Anything outside 4-10 is a 400.
 */
export const HEATMAP_MIN_ZOOM = 4;
export const HEATMAP_MAX_ZOOM = 10;
/** What the API uses when zoom is left out. */
export const HEATMAP_DEFAULT_ZOOM = 7;

/** The API counts at most this many posts per answer, newest first (MAX_HEATMAP_POSTS in the router). */
export const HEATMAP_MAX_POSTS = 5000;

/** [min_lng, min_lat, max_lng, max_lat], the order the API takes and echoes. */
export type HeatmapBBox = [minLng: number, minLat: number, maxLng: number, maxLat: number];

/** One of the up to three newest posts the API attaches to a bin. */
export interface HeatmapSamplePost {
  post_id: string;
  /** At most the first 100 characters; null for a post without text. */
  content_text: string | null;
  media_url: string | null;
  /** ISO 8601 with a UTC offset. */
  timestamp: string;
  boost_score: number;
}

export interface HeatmapBin {
  /** Cell id; its length equals the requested zoom. */
  geohash: string;
  /** Center of the geohash cell, not of the posts in it. */
  lat: number;
  lng: number;
  post_count: number;
  /** Sum of the boost scores of the posts in the cell. */
  boost_score: number;
  /** The three most used tags, most used first. */
  top_tags: string[];
  /** At most three, newest first. */
  sample_posts: HeatmapSamplePost[];
}

/** GET /v1/heatmap. */
export interface HeatmapResponse {
  /** In no particular order. */
  bins: HeatmapBin[];
  /** Posts counted across all bins; never more than HEATMAP_MAX_POSTS. */
  total_posts: number;
  time_window: HeatmapWindow;
  /** The box that was searched, or null when the whole world was. */
  bbox: HeatmapBBox | null;
}

export interface HeatmapParams {
  /** Left out: the whole world. */
  bbox?: HeatmapBBox;
  /** Geohash precision 4-10; the API defaults to 7. */
  zoom?: number;
  /** The API defaults to 24h. */
  window?: HeatmapWindow;
}

/** POST /v1/heatmap/refresh. */
export interface HeatmapRefreshResponse {
  /** Cached answers dropped, for every window, precision and area. 0 when throttled. */
  cache_keys_cleared: number;
  /** true: the cache was already flushed within the last 30 seconds, so nothing was dropped this time. */
  throttled: boolean;
}

export type HeatmapDropZoneStatus = 'scheduled' | 'active' | 'ended' | 'cancelled';

/** One entry of GET /v1/dropzones. */
export interface HeatmapDropZone {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  status: HeatmapDropZoneStatus;
  starts_at: string | null;
  ends_at: string | null;
  member_count: number;
  check_in_count: number;
  created_at: string;
}

export interface HeatmapDropZoneParams {
  bbox?: HeatmapBBox;
  /** true: active and inside its time window; false: any status other than active; left out: everything. */
  active?: boolean;
  /** 1-100; the API defaults to 50. */
  limit?: number;
  offset?: number;
}

/** A failed request. `message` is the API's "detail"; `status` is 0 when the API was unreachable. */
export class HeatmapApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HeatmapApiError';
    this.status = status;
  }
}

/** Map edges in degrees, as Leaflet reports them (they run past +-180 when the world repeats). */
export interface HeatmapViewBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * The API keys its cache on the box rounded to three decimals (about 110 m) but searches the box
 * as sent, so two boxes that round alike get whichever answer was cached first. A box that is
 * already on that grid always gets its own answer.
 */
const BBOX_GRID = 1000;
/** Keeps 40.6 from becoming 40.601 through floating point noise. */
const GRID_SLACK = 1e-6;

// "+ 0" turns a negative zero into a plain one
const gridFloor = (value: number) => Math.floor(value * BBOX_GRID + GRID_SLACK) / BBOX_GRID + 0;
const gridCeil = (value: number) => Math.ceil(value * BBOX_GRID - GRID_SLACK) / BBOX_GRID + 0;

/**
 * The bbox the API accepts for a map view: clamped to the valid longitude/latitude ranges and
 * widened to the three-decimal grid the API caches on, so the box always covers the whole view.
 * Returns null when the view has no area, which the API would reject with "Invalid bbox format".
 */
export function bboxFromBounds(bounds: HeatmapViewBounds): HeatmapBBox | null {
  const { north, south, east, west } = bounds;
  if (![north, south, east, west].every(Number.isFinite)) return null;

  const clampedWest = Math.max(-180, west);
  const clampedEast = Math.min(180, east);
  const clampedSouth = Math.max(-90, south);
  const clampedNorth = Math.min(90, north);
  if (clampedWest >= clampedEast || clampedSouth >= clampedNorth) return null;

  return [
    Math.max(-180, gridFloor(clampedWest)),
    Math.max(-90, gridFloor(clampedSouth)),
    Math.min(180, gridCeil(clampedEast)),
    Math.min(90, gridCeil(clampedNorth)),
  ];
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

/**
 * The message to show for a failed request, from the "detail" of the API's error body: a string
 * for 400, 401, 405, 429 and 500, a list of validation issues for 422. Anything else gives the fallback.
 */
export function heatmapErrorMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail)) {
    // loc is e.g. ["query", "window"]; its first entry only says where the value was sent.
    const issues = detail.filter(isValidationIssue).map((issue) => {
      const field = issue.loc.slice(1).join('.');
      return field ? `${field}: ${issue.msg}` : issue.msg;
    });
    if (issues.length > 0) return issues.join('; ');
  }
  return fallback;
}

async function errorFromResponse(res: Response, fallback: string): Promise<HeatmapApiError> {
  let detail: unknown;
  try {
    detail = ((await res.json()) as { detail?: unknown } | null)?.detail;
  } catch {
    detail = undefined;
  }
  return new HeatmapApiError(res.status, heatmapErrorMessage(detail, fallback));
}

async function request<T>(path: string, fallback: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch {
    throw new HeatmapApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  if (!res.ok) throw await errorFromResponse(res, fallback);
  try {
    return (await res.json()) as T;
  } catch {
    // A 200 that is not JSON did not come from the API (a proxy or captive portal page, say)
    throw new HeatmapApiError(res.status, fallback);
  }
}

function withQuery(path: string, query: URLSearchParams): string {
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

/** Path and query string of GET /v1/heatmap; parameters left out fall to the API's defaults. */
export function heatmapPath(params: HeatmapParams = {}): string {
  const query = new URLSearchParams();
  if (params.bbox) query.set('bbox', params.bbox.join(','));
  if (params.zoom !== undefined) query.set('zoom', String(params.zoom));
  if (params.window) query.set('window', params.window);
  return withQuery('/v1/heatmap', query);
}

/** Path and query string of GET /v1/dropzones as the heat map reads it. */
export function heatmapDropZonesPath(params: HeatmapDropZoneParams = {}): string {
  const query = new URLSearchParams();
  if (params.bbox) query.set('bbox', params.bbox.join(','));
  if (params.active !== undefined) query.set('active', String(params.active));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  return withQuery('/v1/dropzones', query);
}

export const HeatmapAPI = {
  /** GET /v1/heatmap. 400 for a zoom outside 4-10 or a malformed bbox, 422 for an unknown window. */
  getHeatmap(params: HeatmapParams = {}): Promise<HeatmapResponse> {
    return request<HeatmapResponse>(heatmapPath(params), 'Failed to load the heat map');
  },

  /** POST /v1/heatmap/refresh (signed in, 401 otherwise). Drops every cached heat map answer. */
  refreshCache(): Promise<HeatmapRefreshResponse> {
    return request<HeatmapRefreshResponse>('/v1/heatmap/refresh', 'Failed to refresh the heat map', {
      method: 'POST',
    });
  },

  /** GET /v1/dropzones. Newest first: public zones plus the private ones the caller belongs to. */
  listDropZones(params: HeatmapDropZoneParams = {}): Promise<HeatmapDropZone[]> {
    return request<HeatmapDropZone[]>(heatmapDropZonesPath(params), 'Failed to load drop zones');
  },
};
