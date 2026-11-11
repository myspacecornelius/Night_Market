import { apiFetch } from './http';

/*
 * Typed client for the leaderboard endpoint in services/routers/dashboard.py.
 * It requires the signed-in user's bearer token (apiFetch adds it): without one
 * the API answers 401 {"detail": "Not authenticated"}, and 403 {"detail": "Inactive user"}
 * for a deactivated account.
 */

/** The boards the API knows: LACES balance, public signals posted, drop-zone check-ins. */
export type LeaderboardType = 'laces' | 'posts' | 'checkins';

/** One row of a board. */
export interface LeaderboardEntry {
  /**
   * 1-based rank. Rows are ordered by value, highest first, then by username;
   * members with equal values share a rank (1, 2, 2, 4), the same way the
   * dashboard's communityRank counts.
   */
  rank: number;
  /** UUID of the member; null for an anonymous member (the caller always sees their own id). */
  userId: string | null;
  /** The member's username; "anonymous" for an anonymous member other than the caller. */
  username: string;
  /** Avatar URL; null when the member has none or is anonymous. */
  avatar: string | null;
  /** The figure the board ranks by, in the board's unit. A whole number. */
  value: number;
  /** True on the row of the signed-in user. At most one row has it. */
  isCurrentUser: boolean;
}

/** GET /v1/dashboard/leaderboard */
export interface Leaderboard {
  type: LeaderboardType;
  /** Display name of the board, e.g. "LACES Leaderboard". */
  title: string;
  /** One-line description of the board, e.g. "Top LACES holders in the community". */
  subtitle: string;
  /** What the values count: "LACES", "signals" or "check-ins". */
  unit: string;
  /**
   * The top members, best first; at most `limit` rows. Only active members are ranked.
   * The "posts" and "checkins" boards list only members with at least one public signal
   * or check-in, so they can be empty, and the signed-in user may not be on the board.
   */
  items: LeaderboardEntry[];
}

export interface LeaderboardParams {
  /** The API defaults to "laces". */
  type?: LeaderboardType;
  /** How many rows to return, 1 to 50; the API defaults to 10. */
  limit?: number;
}

/** A failed leaderboard request. `message` is the API's "detail"; `status` is 0 when the API was unreachable. */
export class LeaderboardApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'LeaderboardApiError';
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
  // loc is e.g. ["query", "limit"]; its first entry only says where the value was sent.
  const field = issue.loc.slice(1).join('.');
  return field ? `${field}: ${issue.msg}` : issue.msg;
}

/**
 * Build an error from a failed response. The API puts the reason in "detail":
 * a string (401, 403, 429), or a list of validation issues for a 422.
 */
async function errorFromResponse(res: Response, fallback: string): Promise<LeaderboardApiError> {
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
    return new LeaderboardApiError(res.status, detail);
  }
  if (Array.isArray(detail)) {
    const issues = detail.filter(isValidationIssue).map(describeIssue);
    if (issues.length > 0) return new LeaderboardApiError(res.status, issues.join('; '));
  }
  return new LeaderboardApiError(res.status, `${fallback} (HTTP ${res.status})`);
}

const LOAD_FAILED = 'Could not load the leaderboard';

export const LeaderboardAPI = {
  /**
   * Rejects with a LeaderboardApiError: the API's "detail" message when it refuses the
   * request, or a plain explanation when it cannot be reached or its answer cannot be read.
   */
  async getLeaderboard(params: LeaderboardParams = {}): Promise<Leaderboard> {
    const query = new URLSearchParams();
    if (params.type !== undefined) query.set('type', params.type);
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    const search = query.toString();

    let res: Response;
    try {
      res = await apiFetch(`/v1/dashboard/leaderboard${search ? `?${search}` : ''}`);
    } catch {
      // fetch() itself failed; its own message ("Failed to fetch") says nothing to the user.
      throw new LeaderboardApiError(0, 'Could not reach the server. Check your connection and try again.');
    }
    if (!res.ok) throw await errorFromResponse(res, LOAD_FAILED);
    try {
      return (await res.json()) as Leaderboard;
    } catch {
      throw new LeaderboardApiError(res.status, `${LOAD_FAILED}: the server's answer could not be read`);
    }
  },
};
