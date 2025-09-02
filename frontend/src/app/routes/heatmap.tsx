import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Map, Layers, Clock, TrendingUp, MapPin, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { Heatmap } from '@/lib/api-experiments';

interface HeatmapBin {
  geohash: string;
  lat: number;
  lng: number;
  post_count: number;
  boost_score: number;
  top_tags: string[];
  sample_posts: Array<{
    post_id: string;
    content_text?: string;
    media_url?: string;
    timestamp: string;
    boost_score: number;
  }>;
}

interface HeatmapData {
  bins: HeatmapBin[];
  total_posts: number;
  time_window: string;
  bbox?: number[];
}

export default function HeatmapPage() {
  const [timeWindow, setTimeWindow] = useState('24h');
  const [zoomLevel, setZoomLevel] = useState(7);
  const [intensityFilter, setIntensityFilter] = useState([0]);
  const [showTags, setShowTags] = useState(true);
  const [selectedBin, setSelectedBin] = useState<HeatmapBin | null>(null);

  // Fetch heatmap data
  const { data: heatmapData, isLoading, refetch, isFetching } = useQuery<HeatmapData>({
    queryKey: ['heatmap', timeWindow, zoomLevel],
    queryFn: () => Heatmap.get({ 
      zoom: zoomLevel, 
      window: timeWindow 
    }),
    refetchInterval: 300000, // Refetch every 5 minutes
  });

  const handleRefresh = useCallback(() => {
    refetch();
    toast.success('Heat map refreshed!');
  }, [refetch]);

  const getIntensityColor = (count: number, maxCount: number) => {
    const intensity = count / maxCount;
    if (intensity > 0.8) return 'rgba(220, 38, 127, 0.8)';
    if (intensity > 0.6) return 'rgba(251, 146, 60, 0.7)';
    if (intensity > 0.4) return 'rgba(251, 191, 36, 0.6)';
    if (intensity > 0.2) return 'rgba(34, 197, 94, 0.5)';
    return 'rgba(59, 130, 246, 0.4)';
  };

  const filteredBins = heatmapData?.bins.filter(bin => 
    bin.post_count >= intensityFilter[0]
  ) || [];

  const maxCount = Math.max(...(heatmapData?.bins.map(bin => bin.post_count) || [1]));
  const maxIntensity = Math.max(...(heatmapData?.bins.map(bin => bin.post_count) || [10]));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Map className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Activity Heat Map</h1>
        </div>
        <Skeleton className="h-96 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Map className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Activity Heat Map</h1>
        </div>
        <Button 
          onClick={handleRefresh} 
          disabled={isFetching}
          size="sm"
          variant="outline"
        >
          <RotateCcw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            View Controls
          </CardTitle>
          <CardDescription>
            Adjust time window, zoom level, and intensity filters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Time Window */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Time Window
              </label>
              <Select value={timeWindow} onValueChange={setTimeWindow}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Last Hour</SelectItem>
                  <SelectItem value="24h">Last 24 Hours</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Zoom Level */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Map className="h-4 w-4" />
                Detail Level: {zoomLevel}
              </label>
              <Slider
                value={[zoomLevel]}
                onValueChange={(value) => setZoomLevel(value[0])}
                min={4}
                max={10}
                step={1}
                className="w-full"
              />
            </div>

            {/* Intensity Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Min Activity: {intensityFilter[0]}
              </label>
              <Slider
                value={intensityFilter}
                onValueChange={setIntensityFilter}
                min={0}
                max={maxIntensity}
                step={1}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant={showTags ? "default" : "outline"}
                size="sm"
                onClick={() => setShowTags(!showTags)}
              >
                {showTags ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
                Popular Tags
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              Showing {filteredBins.length} of {heatmapData?.bins.length || 0} hotspots
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Heat Map Visualization */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Hotspots - {timeWindow.toUpperCase()}</CardTitle>
          <CardDescription>
            {heatmapData?.total_posts || 0} total posts across all locations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden" style={{ height: '400px' }}>
            {/* Simple Grid-based Heatmap Visualization */}
            <div className="absolute inset-0 grid grid-cols-12 grid-rows-8 gap-1 p-2">
              {filteredBins.map((bin, index) => {
                const size = Math.max(20, (bin.post_count / maxCount) * 80);
                const intensity = bin.post_count / maxCount;
                
                return (
                  <div
                    key={bin.geohash}
                    className="relative flex items-center justify-center cursor-pointer rounded-lg transition-all hover:scale-110 hover:z-10"
                    style={{
                      backgroundColor: getIntensityColor(bin.post_count, maxCount),
                      width: `${size}px`,
                      height: `${size}px`,
                      gridColumn: (index % 12) + 1,
                      gridRow: Math.floor(index / 12) % 8 + 1,
                    }}
                    onClick={() => setSelectedBin(bin)}
                    title={`${bin.post_count} posts • ${bin.boost_score} boost score`}
                  >
                    <div className="text-xs font-bold text-white drop-shadow">
                      {bin.post_count}
                    </div>
                    {showTags && bin.top_tags.length > 0 && (
                      <div className="absolute -top-6 left-1/2 transform -translate-x-1/2">
                        <Badge variant="secondary" className="text-xs px-1 py-0">
                          {bin.top_tags[0]}
                        </Badge>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="absolute bottom-4 right-4 bg-white dark:bg-slate-900 p-3 rounded-lg shadow-lg">
              <div className="text-xs font-medium mb-2">Activity Level</div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(59, 130, 246, 0.4)' }}></div>
                <span>Low</span>
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(251, 191, 36, 0.6)' }}></div>
                <span>Med</span>
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(220, 38, 127, 0.8)' }}></div>
                <span>High</span>
              </div>
            </div>
          </div>

          {/* No data state */}
          {filteredBins.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No activity in this area</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Try adjusting the time window or reducing the intensity filter
              </p>
              <Button variant="outline" onClick={() => setIntensityFilter([0])}>
                Reset Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hotspot Details */}
      {selectedBin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Hotspot Details
            </CardTitle>
            <CardDescription>
              Location: {selectedBin.lat.toFixed(4)}, {selectedBin.lng.toFixed(4)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">{selectedBin.post_count}</div>
                <div className="text-sm text-muted-foreground">Posts</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{selectedBin.boost_score}</div>
                <div className="text-sm text-muted-foreground">Boost Score</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">{selectedBin.top_tags.length}</div>
                <div className="text-sm text-muted-foreground">Unique Tags</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">{selectedBin.sample_posts.length}</div>
                <div className="text-sm text-muted-foreground">Sample Posts</div>
              </div>
            </div>

            {/* Popular Tags */}
            {selectedBin.top_tags.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Popular Tags</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedBin.top_tags.map((tag, index) => (
                    <Badge key={index} variant="outline">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Sample Posts */}
            {selectedBin.sample_posts.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Recent Posts</h4>
                <div className="space-y-2">
                  {selectedBin.sample_posts.map((post, index) => (
                    <div key={post.post_id} className="p-3 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {post.content_text && (
                            <p className="text-sm mb-1">{post.content_text}</p>
                          )}
                          <div className="text-xs text-muted-foreground">
                            {new Date(post.timestamp).toLocaleString()}
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          +{post.boost_score}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setSelectedBin(null)}
              className="w-full"
            >
              Close Details
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Total Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{heatmapData?.total_posts || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">posts in {timeWindow}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Active Zones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredBins.length}</div>
            <p className="text-xs text-muted-foreground mt-1">hotspots found</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Peak Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{maxCount}</div>
            <p className="text-xs text-muted-foreground mt-1">posts in busiest zone</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
