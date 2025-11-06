const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface HeatmapCell {
  geohash: string;
  lat: number;
  lng: number;
  post_count: number;
  boost_score: number;
  top_tags: string[];
  sample_posts: any[];
}

export interface HeatmapData {
  bins: HeatmapCell[];
  total_posts: number;
  time_window: string;
  bbox?: number[];
}

export const HeatmapAPI = {
  async getHeatmap(params: {
    bbox?: string;
    zoom?: number;
    window?: '1h' | '24h' | '7d';
  }): Promise<HeatmapData> {
    const query = new URLSearchParams();
    if (params.bbox) query.append('bbox', params.bbox);
    if (params.zoom) query.append('zoom', params.zoom.toString());
    if (params.window) query.append('window', params.window);

    const res = await fetch(`${API_BASE_URL}/v1/heatmap?${query}`);
    if (!res.ok) throw new Error('Failed to fetch heatmap data');
    return res.json();
  },

  async refreshCache(): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/v1/heatmap/refresh`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to refresh heatmap cache');
    return res.json();
  },
};
