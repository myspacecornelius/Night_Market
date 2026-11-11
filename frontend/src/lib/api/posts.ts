import { apiFetch } from './http';

/*
 * Typed client for the community feed:
 *   services/routers/posts.py       mounted at /posts
 *   services/routers/hyperlocal.py  mounted at /v1
 *   POST /v1/laces/boost-post/{post_id} in services/routers/laces.py (a boost with a chosen amount)
 * The shapes below were read from the routers and services/schemas/post.py and confirmed
 * against the running API. Ids are UUID strings, timestamps are ISO 8601 strings in UTC.
 *
 * Every call needs the signed-in user's bearer token (apiFetch adds it) except
 * GET /posts/global and GET /posts/user/{user_id}, which are public.
 */

export type PostType =
  | 'SPOTTED'
  | 'STOCK_CHECK'
  | 'LINE_UPDATE'
  | 'GENERAL'
  | 'HEAT_CHECK'
  | 'INTEL_REPORT';

/** Every value of post_type, in the order the API declares them. */
export const POST_TYPES: readonly PostType[] = [
  'SPOTTED',
  'STOCK_CHECK',
  'LINE_UPDATE',
  'GENERAL',
  'HEAT_CHECK',
  'INTEL_REPORT',
];

/** How each post_type is named on screen. */
export const POST_TYPE_LABELS: Record<PostType, string> = {
  SPOTTED: 'Spotted',
  STOCK_CHECK: 'Stock check',
  LINE_UPDATE: 'Line update',
  GENERAL: 'General',
  HEAT_CHECK: 'Heat check',
  INTEL_REPORT: 'Intel report',
};

export type PostVisibility = 'public' | 'local' | 'friends' | 'private';

/** Limits the API enforces (a request outside them is answered with 422). */
export const POST_TEXT_MAX_LENGTH = 5000;
export const POST_MEDIA_URL_MAX_LENGTH = 500;
export const POST_MAX_TAGS = 20;
/** Each tag is 1 to 50 characters long. */
export const POST_TAG_MAX_LENGTH = 50;
export const BOOST_MIN_AMOUNT = 1;
export const BOOST_MAX_AMOUNT = 100;
/** What a boost costs when no amount is given. */
export const BOOST_DEFAULT_AMOUNT = 10;
export const SCAN_MAX_RADIUS_KM = 100;

/**
 * A post as every endpoint here returns it.
 * The author's name is not part of it: only user_id.
 */
export interface Post {
  post_id: string;
  user_id: string;
  post_type: PostType;
  /** The API accepts a post without text, so this can be null. */
  content_text: string | null;
  /** Whatever string the author sent; the API does not check that it is a URL. */
  media_url: string | null;
  tags: string[] | null;
  visibility: PostVisibility;
  timestamp: string;
  /** Total LACES spent boosting the post. Never negative, only ever grows. */
  boost_score: number;
  /** Both set for a hyperlocal signal, both null for a plain post. */
  geo_tag_lat: number | null;
  geo_tag_long: number | null;
}

/** Body of POST /posts/. Every field is optional; geo tags sent here are ignored. */
export interface CreatePostRequest {
  /** The API defaults to GENERAL. */
  post_type?: PostType;
  /** Up to 5000 characters. The API also accepts none or blank text, so check before sending. */
  content_text?: string | null;
  /** Up to 500 characters. */
  media_url?: string | null;
  /** Up to 20 tags, each 1 to 50 characters long. */
  tags?: string[] | null;
  /** The API defaults to public; the feeds only list public posts. */
  visibility?: PostVisibility;
}

/** Body of POST /v1/hyperlocal/signals: a post pinned to a place, so the coordinates are required. */
export interface CreateSignalRequest extends CreatePostRequest {
  /** -90 to 90. */
  geo_tag_lat: number;
  /** -180 to 180. */
  geo_tag_long: number;
}

export interface PageParams {
  /** Number of posts to skip; the API defaults to 0. */
  skip?: number;
  /** 1 to 100. The API defaults to 20 for the feed, 10 for the global feed and 50 for a user's posts. */
  limit?: number;
}

/** Query of GET /v1/feed/scan. */
export interface ScanParams {
  /** -90 to 90. */
  latitude: number;
  /** -180 to 180. */
  longitude: number;
  /** Kilometers, above 0 and up to 100; the API defaults to 1. */
  radius?: number;
}

/** POST /v1/laces/boost-post/{post_id} */
export interface PostBoostResult {
  success: true;
  /** LACES taken from the booster. */
  boost_amount: number;
  /** The share credited to the post's author (half, rounded down). */
  author_reward: number;
  /** The post's boost_score after this boost. */
  new_boost_score: number;
  /** The booster's balance after paying. */
  remaining_balance: number;
}

/** POST /v1/hyperlocal/signals/{post_id}/boost answers with the signed-in user after the debit. */
export interface SignalBoostResult {
  user_id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  is_anonymous: boolean;
  bio: string | null;
  location: string | null;
  website_url: string | null;
  laces_balance: number;
  is_verified: boolean;
  created_at: string | null;
}

export interface Coordinates {
  /** Degrees, -90 to 90. */
  latitude: number;
  /** Degrees, -180 to 180. */
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two points, in kilometers: how far a pinned post is from the
 * viewer, in the unit of the scan radius. The API measures on an ellipsoid, so right at the edge
 * of a radius the two can disagree by a fraction of a percent.
 */
export function distanceKm(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** A failed request. `message` is the API's "detail"; `status` is 0 when the API was unreachable. */
export class PostsApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'PostsApiError';
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
  // loc is e.g. ["body", "content_text"]; its first entry only says where the value was sent.
  const field = issue.loc.slice(1).join('.');
  return field ? `${field}: ${issue.msg}` : issue.msg;
}

/** "detail" is a string for 400/401/403/404 and a list of validation issues for 422. */
async function errorFromResponse(res: Response, fallback: string): Promise<PostsApiError> {
  let detail: unknown;
  try {
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null) {
      detail = (body as { detail?: unknown }).detail;
    }
  } catch {
    // Not a JSON body: use the fallback message.
  }

  if (typeof detail === 'string' && detail.trim() !== '') {
    return new PostsApiError(res.status, detail);
  }
  if (Array.isArray(detail)) {
    const issues = detail.filter(isValidationIssue).map(describeIssue);
    if (issues.length > 0) return new PostsApiError(res.status, issues.join('; '));
  }
  return new PostsApiError(res.status, `${fallback} (HTTP ${res.status})`);
}

/** apiFetch, with a readable error when the API cannot be reached or refuses the request. */
async function send(path: string, fallback: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch {
    throw new PostsApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  if (!res.ok) throw await errorFromResponse(res, fallback);
  return res;
}

/** The JSON body of a successful answer. Something else answered if it is not JSON (a proxy's error page, say). */
async function readJson(res: Response, fallback: string): Promise<unknown> {
  try {
    return (await res.json()) as unknown;
  } catch {
    throw new PostsApiError(res.status, `${fallback}: the server sent an answer that could not be read.`);
  }
}

async function request<T>(path: string, fallback: string, init?: RequestInit): Promise<T> {
  const res = await send(path, fallback, init);
  return (await readJson(res, fallback)) as T;
}

/** A request whose answer is a list of posts; anything but a list is refused instead of handed to the page. */
async function requestPosts(path: string, fallback: string): Promise<Post[]> {
  const res = await send(path, fallback);
  const body = await readJson(res, fallback);
  if (!Array.isArray(body)) {
    throw new PostsApiError(res.status, `${fallback}: the server sent an answer that could not be read.`);
  }
  return body as Post[];
}

function postJson(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function withQuery(path: string, params: Record<string, number | undefined>): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) query.set(name, String(value));
  }
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

export const PostsAPI = {
  /**
   * GET /posts/feed (signed in). Public posts, most boosted first, then newest first.
   * Cached by the API for up to 60 seconds. POST /posts/ and DELETE /posts/{id} clear that cache;
   * a boost and POST /v1/hyperlocal/signals do not, so boost_score can lag behind a boost and a
   * pinned post can be missing from this list (and from the global one) until the cache expires.
   */
  getFeed(params: PageParams = {}): Promise<Post[]> {
    return requestPosts(
      withQuery('/posts/feed', { skip: params.skip, limit: params.limit }),
      'Could not load the feed',
    );
  },

  /** GET /posts/global (public). Public posts, newest first. Cached like the feed, for up to 30 seconds. */
  getGlobalFeed(params: PageParams = {}): Promise<Post[]> {
    return requestPosts(
      withQuery('/posts/global', { skip: params.skip, limit: params.limit }),
      'Could not load the latest posts',
    );
  },

  /**
   * GET /posts/user/{user_id} (public). Newest first.
   * Only the author, signed in, also gets their own non-public posts.
   */
  getUserPosts(userId: string, params: PageParams = {}): Promise<Post[]> {
    return requestPosts(
      withQuery(`/posts/user/${encodeURIComponent(userId)}`, { skip: params.skip, limit: params.limit }),
      "Could not load this user's posts",
    );
  },

  /**
   * GET /v1/feed/scan (signed in). Posts pinned within `radius` km of the point, most boosted
   * first, then newest first; at most 100. Lists public and local posts.
   */
  scanNearby(params: ScanParams): Promise<Post[]> {
    return requestPosts(
      withQuery('/v1/feed/scan', {
        latitude: params.latitude,
        longitude: params.longitude,
        radius: params.radius,
      }),
      'Could not load posts near you',
    );
  },

  /** POST /posts/ (signed in). A plain post: it has no location. */
  createPost(data: CreatePostRequest): Promise<Post> {
    return request<Post>('/posts/', 'Could not publish the post', postJson(data));
  },

  /** POST /v1/hyperlocal/signals (signed in). A post pinned to the given coordinates. */
  createSignal(data: CreateSignalRequest): Promise<Post> {
    return request<Post>('/v1/hyperlocal/signals', 'Could not publish the signal', postJson(data));
  },

  /** DELETE /posts/{post_id} (signed in). 403 unless the caller is the author, 404 when it is gone. */
  async deletePost(postId: string): Promise<void> {
    // 204: there is no body to read.
    await send(`/posts/${encodeURIComponent(postId)}`, 'Could not delete the post', { method: 'DELETE' });
  },

  /**
   * POST /v1/laces/boost-post/{post_id}?boost_amount=N (signed in), N from 1 to 100.
   * 400 "Cannot boost your own post" or "Insufficient LACES balance", 404 when the post is gone.
   */
  boostPost(postId: string, amount: number): Promise<PostBoostResult> {
    return request<PostBoostResult>(
      withQuery(`/v1/laces/boost-post/${encodeURIComponent(postId)}`, { boost_amount: amount }),
      'Could not boost the post',
      { method: 'POST' },
    );
  },

  /**
   * POST /v1/hyperlocal/signals/{post_id}/boost (signed in). A boost of the default 10 LACES;
   * same refusals as boostPost. Answers with the caller's account, not the post.
   */
  boostSignal(postId: string): Promise<SignalBoostResult> {
    return request<SignalBoostResult>(
      `/v1/hyperlocal/signals/${encodeURIComponent(postId)}/boost`,
      'Could not boost the signal',
      { method: 'POST' },
    );
  },
};
