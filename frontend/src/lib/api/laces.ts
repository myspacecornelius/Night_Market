const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface LacesBalance {
  balance: number;
  user_id: string;
  last_stipend?: string;
  total_earned: number;
  total_spent: number;
}

export interface LacesTransaction {
  id: string;
  amount: number;
  transaction_type: string;
  related_post_id?: string;
  created_at: string;
  description?: string;
}

export interface LacesLedger {
  transactions: LacesTransaction[];
  total_count: number;
  page: number;
  limit: number;
}

export interface EarningOpportunity {
  type: string;
  reward: string | number;
  description: string;
}

export interface Opportunities {
  opportunities: EarningOpportunity[];
  daily_stipend_claimed: boolean;
  posts_today: number;
  checkins_today: number;
}

export const LacesAPI = {
  async getBalance(): Promise<LacesBalance> {
    const res = await fetch(`${API_BASE_URL}/v1/laces/balance`);
    if (!res.ok) throw new Error('Failed to fetch balance');
    return res.json();
  },

  async getLedger(params?: { page?: number; limit?: number; transaction_type?: string }): Promise<LacesLedger> {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', params.page.toString());
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.transaction_type) query.append('transaction_type', params.transaction_type);

    const res = await fetch(`${API_BASE_URL}/v1/laces/ledger?${query}`);
    if (!res.ok) throw new Error('Failed to fetch ledger');
    return res.json();
  },

  async getOpportunities(): Promise<Opportunities> {
    const res = await fetch(`${API_BASE_URL}/v1/laces/opportunities`);
    if (!res.ok) throw new Error('Failed to fetch opportunities');
    return res.json();
  },

  async claimStipend(): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/v1/laces/daily-stipend`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Failed to claim stipend');
    }
    return res.json();
  },

  async boostPost(postId: string, amount: number): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/v1/laces/boost-post/${postId}?boost_amount=${amount}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Failed to boost post');
    }
    return res.json();
  },
};
