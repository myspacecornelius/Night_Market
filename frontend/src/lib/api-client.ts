import axios from 'axios';
import type { AxiosInstance, AxiosResponse } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface AuthTokens {
  access_token: string;
  token_type: string;
}

export interface User {
  user_id: string;
  username: string;
  display_name: string;
  email: string;
  avatar_url?: string;
  bio?: string;
  location?: string;
  laces_balance: number;
  is_verified: boolean;
  created_at: string;
}

export interface Post {
  post_id: string;
  user_id: string;
  content_text?: string;
  media_url?: string;
  tags?: string[];
  boost_score: number;
  timestamp: string;
  visibility: 'public' | 'local' | 'friends' | 'private';
  post_type: 'SPOTTED' | 'STOCK_CHECK' | 'LINE_UPDATE' | 'GENERAL' | 'HEAT_CHECK' | 'INTEL_REPORT';
}

export interface CreatePostData {
  post_type: Post['post_type'];
  content_text?: string;
  media_url?: string;
  tags?: string[];
  geo_tag_lat?: number;
  geo_tag_long?: number;
  visibility?: Post['visibility'];
}

export interface HyperlocalSignal {
  latitude: number;
  longitude: number;
  radius?: number;
}

export interface LacesTransaction {
  id: string;
  user_id: string;
  amount: number;
  transaction_type: string;
  description?: string;
  related_post_id?: string;
  created_at: string;
}

class ApiClient {
  private client: AxiosInstance;
  private authToken: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for auth
    this.client.interceptors.request.use((config) => {
      const token = this.getAuthToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          this.clearAuthToken();
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth methods
  async login(username: string, password: string): Promise<AuthTokens> {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);

    const response = await this.client.post<AuthTokens>('/auth/token', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    this.setAuthToken(response.data.access_token);
    return response.data;
  }

  async getCurrentUser(): Promise<User> {
    const response = await this.client.get<User>('/auth/me');
    return response.data;
  }

  // Post methods
  async createPost(data: CreatePostData): Promise<Post> {
    const response = await this.client.post<Post>('/posts/', data);
    return response.data;
  }

  async getUserFeed(skip: number = 0, limit: number = 20): Promise<Post[]> {
    const response = await this.client.get<Post[]>('/posts/feed', {
      params: { skip, limit },
    });
    return response.data;
  }

  async getGlobalFeed(skip: number = 0, limit: number = 10): Promise<Post[]> {
    const response = await this.client.get<Post[]>('/posts/global', {
      params: { skip, limit },
    });
    return response.data;
  }

  async getUserPosts(userId: string): Promise<Post[]> {
    const response = await this.client.get<Post[]>(`/posts/user/${userId}`);
    return response.data;
  }

  async deletePost(postId: string): Promise<void> {
    await this.client.delete(`/posts/${postId}`);
  }

  // Signal methods (hyperlocal)
  async createHyperlocalSignal(data: CreatePostData): Promise<Post> {
    const response = await this.client.post<Post>('/v1/signals', data);
    return response.data;
  }

  async getHyperlocalFeed(signal: HyperlocalSignal): Promise<Post[]> {
    const response = await this.client.get<Post[]>('/v1/feed/scan', {
      params: {
        latitude: signal.latitude,
        longitude: signal.longitude,
        radius: signal.radius || 1.0,
      },
    });
    return response.data;
  }

  async boostPost(postId: string): Promise<User> {
    const response = await this.client.post<User>(`/v1/signals/${postId}/boost`);
    return response.data;
  }

  // User methods
  async getUsers(skip: number = 0, limit: number = 50): Promise<User[]> {
    const response = await this.client.get<User[]>('/users/', {
      params: { skip, limit },
    });
    return response.data;
  }

  async updateUser(userId: string, data: Partial<User>): Promise<User> {
    const response = await this.client.put<User>(`/users/${userId}`, data);
    return response.data;
  }

  // LACES methods
  async getLacesBalance(): Promise<number> {
    const user = await this.getCurrentUser();
    return user.laces_balance;
  }

  async getLacesTransactions(skip: number = 0, limit: number = 50): Promise<LacesTransaction[]> {
    // This endpoint would need to be implemented in the backend
    try {
      const response = await this.client.get<LacesTransaction[]>('/laces/transactions', {
        params: { skip, limit },
      });
      return response.data;
    } catch {
      // Return empty array if endpoint doesn't exist yet
      return [];
    }
  }

  // Release methods
  async getReleases(skip: number = 0, limit: number = 50) {
    const response = await this.client.get('/releases/', {
      params: { skip, limit },
    });
    return response.data;
  }

  async createRelease(data: any) {
    const response = await this.client.post('/releases/', data);
    return response.data;
  }

  // Health check
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return { healthy: true, data: response.data };
    } catch (error) {
      return { healthy: false, error };
    }
  }

  // Token management
  private setAuthToken(token: string) {
    this.authToken = token;
    localStorage.setItem('auth_token', token);
  }

  private getAuthToken(): string | null {
    if (!this.authToken) {
      this.authToken = localStorage.getItem('auth_token');
    }
    return this.authToken;
  }

  private clearAuthToken() {
    this.authToken = null;
    localStorage.removeItem('auth_token');
  }

  logout() {
    this.clearAuthToken();
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
export default apiClient;
