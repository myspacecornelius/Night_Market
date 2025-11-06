const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface DropZone {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  status: string;
  starts_at?: string;
  ends_at?: string;
  member_count: number;
  check_in_count: number;
  created_at: string;
}

export interface CreateDropZoneRequest {
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
}

export interface CheckInRequest {
  lat: number;
  lng: number;
  message?: string;
  photo_url?: string;
}

export interface CheckInResponse {
  success: boolean;
  check_in_id: string;
  distance_from_center: number;
  streak_count: number;
  points_earned: number;
  message: string;
}

export const DropZonesAPI = {
  async list(params?: {
    bbox?: string;
    active?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<DropZone[]> {
    const query = new URLSearchParams();
    if (params?.bbox) query.append('bbox', params.bbox);
    if (params?.active !== undefined) query.append('active', params.active.toString());
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.offset) query.append('offset', params.offset.toString());

    const res = await fetch(`${API_BASE_URL}/v1/dropzones?${query}`);
    if (!res.ok) throw new Error('Failed to fetch dropzones');
    return res.json();
  },

  async get(id: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/v1/dropzones/${id}`);
    if (!res.ok) throw new Error('Failed to fetch dropzone');
    return res.json();
  },

  async create(data: CreateDropZoneRequest): Promise<DropZone> {
    const res = await fetch(`${API_BASE_URL}/v1/dropzones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Failed to create dropzone');
    }
    return res.json();
  },

  async checkIn(dropzoneId: string, data: CheckInRequest): Promise<CheckInResponse> {
    const res = await fetch(`${API_BASE_URL}/v1/dropzones/${dropzoneId}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Failed to check in');
    }
    return res.json();
  },

  async join(dropzoneId: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/v1/dropzones/${dropzoneId}/join`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Failed to join dropzone');
    }
    return res.json();
  },
};
