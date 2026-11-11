import { apiFetch } from './http';

/*
 * Typed client for the LACES endpoints in services/routers/laces.py.
 * Every endpoint requires the signed-in user's bearer token (apiFetch adds it).
 * Timestamps are ISO 8601 strings in UTC; ids are UUID strings.
 */

/** The values of the ledger's transaction_type (also the allowed values of the ledger filter). */
export type LacesTransactionType =
  | 'DAILY_STIPEND'
  | 'BOOST_SENT'
  | 'BOOST_RECEIVED'
  | 'SIGNAL_REWARD'
  | 'ADMIN_ADD'
  | 'ADMIN_REMOVE'
  | 'PURCHASE'
  | 'REFUND'
  | 'CONTEST_REWARD'
  | 'CHECKOUT_TASK_PURCHASE'
  | 'CHECKOUT_TASK_REFUND'
  | 'POST_REWARD'
  | 'CHECKIN_REWARD'
  | 'QUEST_REWARD';

/** GET /v1/laces/balance */
export interface LacesBalance {
  balance: number;
  user_id: string;
  /** When the daily stipend was last claimed; null if it never was. */
  last_stipend: string | null;
  /** Sum of every credit. */
  total_earned: number;
  /** Sum of every debit, as a positive number. */
  total_spent: number;
}

export interface LacesTransaction {
  id: string;
  /** Positive for a credit, negative for a debit, never zero. */
  amount: number;
  transaction_type: LacesTransactionType;
  related_post_id: string | null;
  created_at: string;
  description: string | null;
  /** The user's balance right after this transaction. */
  balance_after: number | null;
}

/** GET /v1/laces/ledger: newest first. */
export interface LacesLedger {
  transactions: LacesTransaction[];
  /** Number of transactions matching the filter, across all pages. */
  total_count: number;
  page: number;
  limit: number;
}

export interface LacesLedgerParams {
  /** 1-based; the API defaults to 1. */
  page?: number;
  /** 1 to 100; the API defaults to 20. */
  limit?: number;
  transaction_type?: LacesTransactionType;
}

/**
 * One way to earn LACES. "daily_stipend" is only listed while today's stipend is
 * unclaimed and "dropzone_checkin" only before today's first check-in.
 */
export type EarningOpportunity =
  | {
      type: 'daily_stipend';
      /** The LACES amount the claim grants. */
      reward: number;
      description: string;
    }
  | {
      type: 'post_boosts' | 'dropzone_checkin';
      /** A description of the reward, e.g. "50% of each boost" or "10-30". */
      reward: string;
      description: string;
    };

export type EarningOpportunityType = EarningOpportunity['type'];

/** GET /v1/laces/opportunities */
export interface Opportunities {
  opportunities: EarningOpportunity[];
  /** True once the stipend has been claimed in the current UTC day. */
  daily_stipend_claimed: boolean;
  posts_today: number;
  checkins_today: number;
}

/** POST /v1/laces/daily-stipend */
export interface ClaimStipendResult {
  transaction_id: string;
  new_balance: number;
  amount: number;
  transaction_type: 'DAILY_STIPEND';
  message: string;
}

/** POST /v1/laces/boost-post/{post_id} */
export interface BoostPostResult {
  success: true;
  boost_amount: number;
  /** The share of the boost credited to the post's author. */
  author_reward: number;
  new_boost_score: number;
  /** The booster's balance after paying for the boost. */
  remaining_balance: number;
}

/** A failed LACES request. `message` is the API's "detail"; `status` is 0 when the API was unreachable. */
export class LacesApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'LacesApiError';
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
  // loc is e.g. ["query", "page"]; its first entry only says where the value was sent.
  const field = issue.loc.slice(1).join('.');
  return field ? `${field}: ${issue.msg}` : issue.msg;
}

/**
 * Build an error from a failed response. The API puts the reason in "detail":
 * a string (400, 401, 403, 404, 429), or a list of validation issues for a 422.
 */
async function errorFromResponse(res: Response, fallback: string): Promise<LacesApiError> {
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
    return new LacesApiError(res.status, detail);
  }
  if (Array.isArray(detail)) {
    const issues = detail.filter(isValidationIssue).map(describeIssue);
    if (issues.length > 0) return new LacesApiError(res.status, issues.join('; '));
  }
  return new LacesApiError(res.status, `${fallback} (HTTP ${res.status})`);
}

/** apiFetch, with a readable error when the API cannot be reached, refuses the request or answers nonsense. */
async function request<T>(path: string, fallback: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch {
    // fetch() itself failed; its own message ("Failed to fetch") says nothing to the user.
    throw new LacesApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  if (!res.ok) throw await errorFromResponse(res, fallback);
  try {
    return (await res.json()) as T;
  } catch {
    throw new LacesApiError(res.status, `${fallback}: the server's answer could not be read`);
  }
}

export const LacesAPI = {
  getBalance(): Promise<LacesBalance> {
    return request<LacesBalance>('/v1/laces/balance', 'Could not load your LACES balance');
  },

  getLedger(params: LacesLedgerParams = {}): Promise<LacesLedger> {
    const query = new URLSearchParams();
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.transaction_type) query.set('transaction_type', params.transaction_type);

    const search = query.toString();
    return request<LacesLedger>(
      `/v1/laces/ledger${search ? `?${search}` : ''}`,
      'Could not load your transactions',
    );
  },

  getOpportunities(): Promise<Opportunities> {
    return request<Opportunities>(
      '/v1/laces/opportunities',
      'Could not load earning opportunities',
    );
  },

  /** Claim today's stipend. Rejects with "Daily stipend already claimed" on a second claim. */
  claimStipend(): Promise<ClaimStipendResult> {
    return request<ClaimStipendResult>(
      '/v1/laces/daily-stipend',
      'Could not claim the daily stipend',
      { method: 'POST' },
    );
  },

  /**
   * Boost someone else's post with 1 to 100 LACES; the API uses 10 when no amount is given.
   * Rejects when the balance is too low, the post is the caller's own, or it does not exist.
   */
  boostPost(postId: string, amount?: number): Promise<BoostPostResult> {
    const search = amount === undefined ? '' : `?boost_amount=${encodeURIComponent(amount)}`;
    return request<BoostPostResult>(
      `/v1/laces/boost-post/${encodeURIComponent(postId)}${search}`,
      'Could not boost the post',
      { method: 'POST' },
    );
  },
};
