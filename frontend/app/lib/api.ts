import axios from 'axios';
import geohash from 'geohash';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add request interceptor for auth token if available
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// API adapter functions to work with existing backend

// Health check - adapt to use existing endpoint
export const getHealth = async () => {
  try {
    // Since there's no dedicated health endpoint, we'll check if the API is responsive
    await apiClient.get('/posts/global?limit=1');
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
};

// Get feed - adapt existing global feed to support cell-based filtering
export const getFeed = async (cell_id: string, radius_km: number = 5, after?: string) => {
  try {
    // For now, we'll use the global feed endpoint
    // In a real implementation, we'd filter by geolocation on the backend
    const skip = after ? parseInt(after) : 0;
    const limit = 20;
    
    const response = await apiClient.get('/posts/global', {
      params: { skip, limit }
    });
    
    // Transform the response to match our expected format
    const items = response.data.map((post: any) => ({
      id: post.post_id,
      body: post.content_text || '',
      created_at: post.timestamp,
      score: 0, // Not implemented in backend yet
      user: {
        id: post.user_id,
        username: 'Anonymous' // Backend doesn't return user info yet
      },
      // Add mock cell_id based on coordinates if available
      cell_id: post.geo_tag_lat && post.geo_tag_long 
        ? geohash.encode(post.geo_tag_lat, post.geo_tag_long, 6)
        : cell_id
    }));
    
    return {
      items,
      next: items.length === limit ? String(skip + limit) : undefined
    };
  } catch (error) {
    console.error('Error fetching feed:', error);
    throw error;
  }
};

// Create post - adapt to existing endpoint
export const createPost = async (data: { body: string; cell_id: string; media_ids?: string[] }) => {
  try {
    // Decode cell_id to get coordinates
    const coords = geohash.decode(data.cell_id);
    
    const postData = {
      content_type: 'text',
      content_text: data.body,
      geo_tag_lat: coords.latitude,
      geo_tag_long: coords.longitude,
      tags: ['dharma', 'sneakers'], // Default tags
      visibility: 'public'
    };
    
    const response = await apiClient.post('/posts/', postData);
    
    // Transform response to match expected format
    return {
      id: response.data.post_id,
      body: response.data.content_text,
      created_at: response.data.timestamp,
      cell_id: data.cell_id,
      user: {
        id: response.data.user_id,
        username: 'You'
      }
    };
  } catch (error) {
    console.error('Error creating post:', error);
    throw error;
  }
};

export default apiClient;
