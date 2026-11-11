import { apiFetch } from './http';

/*
 * Typed client for the signed-in user's profile page:
 *   GET   /auth/me                 services/routers/auth.py       (schema: services/schemas/user.py, User)
 *   PATCH /users/me                services/routers/users.py      (body: UserUpdate, answer: User)
 *   GET   /v1/dashboard/metrics    services/routers/dashboard.py
 *   GET   /posts/user/{user_id}    services/routers/posts.py      (schema: services/schemas/post.py, Post)
 * The shapes below were read from those files and confirmed against the running API.
 * Ids are UUID strings, timestamps are ISO 8601 strings in UTC.
 *
 * Every call sends the signed-in user's bearer token (apiFetch adds it). The first three
 * answer 401 without one; GET /posts/user/{user_id} is public but only shows the author
 * their own non-public posts when the token is theirs.
 */

/** The signed-in user as GET /auth/me and PATCH /users/me return them. */
export interface UserProfile {
  user_id: string;
  username: string;
  /** Only the user themselves is ever sent their e-mail address. */
  email: string;
  display_name: string;
  avatar_url: string | null;
  /** When true, other members see "anonymous" instead of the username and avatar. */
  is_anonymous: boolean;
  bio: string | null;
  location: string | null;
  website_url: string | null;
  laces_balance: number;
  is_verified: boolean;
  created_at: string | null;
}

/**
 * Body of PATCH /users/me. Send only the fields to change.
 * The API trims text. null or blank clears bio, location, website_url and avatar_url;
 * display_name and is_anonymous cannot be null. Any other field (username, email,
 * laces_balance, ...) is refused with 422.
 */
export interface UpdateProfileRequest {
  /** 1 to 100 characters. */
  display_name?: string;
  /** Up to 500 characters. */
  bio?: string | null;
  /** Up to 100 characters. */
  location?: string | null;
  /** Up to 500 characters; must be an http:// or https:// URL. */
  website_url?: string | null;
  /** Up to 500 characters; must be an http:// or https:// URL. */
  avatar_url?: string | null;
  is_anonymous?: boolean;
}

export type ProfileField = keyof UpdateProfileRequest;

/** The longest value PATCH /users/me accepts for each text field, in characters. */
export const PROFILE_LIMITS = {
  display_name: 100,
  bio: 500,
  location: 100,
  website_url: 500,
  avatar_url: 500,
} as const satisfies Partial<Record<ProfileField, number>>;

/** GET /v1/dashboard/metrics: figures about the signed-in user, computed when asked. */
export interface ProfileStats {
  lacesBalance: number;
  lacesEarnedToday: number;
  /** LACES credited in the last 7 days. */
  lacesEarnedThisWeek: number;
  lacesEarnedLastWeek: number;
  /** Percent change of this week's earnings over last week's; null when last week's were 0. */
  weeklyGrowth: number | null;
  /** Public posts by anyone in the last 24 hours. */
  activeSignals: number;
  /** Only computed when lat and lng are sent, which this client does not do. */
  nearbyActivity: number | null;
  /** 1 + the number of active members holding more LACES. */
  communityRank: number;
  /** Active members. */
  totalUsers: number;
  /** Views across all of the user's posts. */
  totalViews: number;
  /** Every post the user has made, whatever its visibility. */
  signalsPosted: number;
  /** Drop-zone check-ins by the user. */
  checkIns: number;
  updatedAt: string;
}

export type UserPostType =
  | 'SPOTTED'
  | 'STOCK_CHECK'
  | 'LINE_UPDATE'
  | 'GENERAL'
  | 'HEAT_CHECK'
  | 'INTEL_REPORT';

export type UserPostVisibility = 'public' | 'local' | 'friends' | 'private';

/** One entry of GET /posts/user/{user_id}. */
export interface UserPost {
  post_id: string;
  user_id: string;
  post_type: UserPostType;
  /** A post can be made without text. */
  content_text: string | null;
  /** Whatever string the author sent; the API does not check that it is a URL. */
  media_url: string | null;
  tags: string[] | null;
  visibility: UserPostVisibility;
  timestamp: string;
  /** Total LACES other members spent boosting the post. */
  boost_score: number;
  /** Both set when the post is pinned to a place, both null otherwise. */
  geo_tag_lat: number | null;
  geo_tag_long: number | null;
}

export interface UserPostsParams {
  /** Number of posts to skip; the API defaults to 0. */
  skip?: number;
  /** 1 to 100; the API defaults to 50. */
  limit?: number;
}

/**
 * A failed request. `message` is the API's "detail" (for a 422, its validation messages);
 * `status` is the HTTP status, or 0 when the API could not be reached.
 */
export class UsersApiError extends Error {
  readonly status: number;
  /** For a 422: the message for each rejected body field, keyed by field name. */
  readonly fieldErrors: Readonly<Record<string, string>>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'UsersApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
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

/** "detail" is a string for 401/403/404 and a list of validation issues for 422. */
async function errorFromResponse(res: Response, fallback: string): Promise<UsersApiError> {
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
    return new UsersApiError(res.status, detail);
  }
  if (Array.isArray(detail)) {
    const issues = detail.filter(isValidationIssue);
    if (issues.length > 0) {
      const fieldErrors: Record<string, string> = {};
      const messages = issues.map((issue) => {
        // loc is e.g. ["body", "website_url"]; its first entry only says where the value was sent.
        const field = issue.loc.slice(1).join('.');
        if (issue.loc[0] === 'body' && field && !(field in fieldErrors)) fieldErrors[field] = issue.msg;
        return field ? `${field}: ${issue.msg}` : issue.msg;
      });
      return new UsersApiError(res.status, messages.join('; '), fieldErrors);
    }
  }
  return new UsersApiError(res.status, `${fallback} (HTTP ${res.status})`);
}

async function request<T>(path: string, fallback: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch {
    throw new UsersApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  if (!res.ok) throw await errorFromResponse(res, fallback);
  try {
    return (await res.json()) as T;
  } catch {
    // A 2xx that is not JSON (a proxy's HTML page, a cut-off body): not something to show as data.
    throw new UsersApiError(res.status, `${fallback}: the server sent an answer that could not be read`);
  }
}

export const UsersAPI = {
  /** GET /auth/me: the signed-in user's own account. */
  getMe(): Promise<UserProfile> {
    return request<UserProfile>('/auth/me', 'Could not load your profile');
  },

  /**
   * PATCH /users/me: change the signed-in user's profile and get the updated account back.
   * Rejects with a UsersApiError whose fieldErrors name the fields a 422 refused.
   */
  updateMe(changes: UpdateProfileRequest): Promise<UserProfile> {
    return request<UserProfile>('/users/me', 'Could not save your profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
  },

  /** GET /v1/dashboard/metrics: the signed-in user's balance, rank and activity counts. */
  getStats(): Promise<ProfileStats> {
    return request<ProfileStats>('/v1/dashboard/metrics', 'Could not load your stats');
  },

  /**
   * GET /posts/user/{user_id}: a user's posts, newest first. Asked for the signed-in
   * user's own id, the list includes their non-public posts.
   */
  getPosts(userId: string, params: UserPostsParams = {}): Promise<UserPost[]> {
    const query = new URLSearchParams();
    if (params.skip !== undefined) query.set('skip', String(params.skip));
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    const search = query.toString();
    return request<UserPost[]>(
      `/posts/user/${encodeURIComponent(userId)}${search ? `?${search}` : ''}`,
      'Could not load your posts',
    );
  },
};
