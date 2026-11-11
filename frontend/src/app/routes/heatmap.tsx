import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Map as LeafletMap } from 'leaflet';
import {
  AlertCircle,
  Clock,
  Crosshair,
  Globe,
  Layers,
  Map as MapIcon,
  MapPin,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  TrendingUp,
} from 'lucide-react';

import { HeatMap } from '@/components/dharma/HeatMap';
import type { MapFocus } from '@/components/map/BaseMap';
import { HEAT_COLORS, heatLevel } from '@/components/map/HeatMapOverlay';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/ui/switch';
import {
  HEATMAP_DEFAULT_ZOOM,
  HEATMAP_MAX_POSTS,
  HEATMAP_MAX_ZOOM,
  HEATMAP_MIN_ZOOM,
  HEATMAP_WINDOWS,
  HeatmapAPI,
  bboxFromBounds,
} from '@/lib/api/heatmap';
import type { HeatmapBBox, HeatmapBin, HeatmapSamplePost, HeatmapWindow } from '@/lib/api/heatmap';

const HEATMAP_KEY = ['heatmap'] as const;
/** Areas listed at first, and added by each "Show more". */
const LIST_STEP = 10;
/** The most zones GET /v1/dropzones returns in one page. */
const DROP_ZONE_LIMIT = 100;

const WINDOW_LABELS: Record<HeatmapWindow, { button: string; phrase: string }> = {
  '1h': { button: 'Last hour', phrase: 'the last hour' },
  '24h': { button: 'Last 24 hours', phrase: 'the last 24 hours' },
  '7d': { button: 'Last 7 days', phrase: 'the last 7 days' },
};

/** What one area covers at each geohash precision the API accepts (sizes at the equator). */
const PRECISION_INFO: Record<number, { name: string; size: string }> = {
  4: { name: 'Metro area', size: 'about 39 × 20 km' },
  5: { name: 'District', size: 'about 5 × 5 km' },
  6: { name: 'Neighborhood', size: 'about 1.2 km × 600 m' },
  7: { name: 'Block', size: 'about 150 × 150 m' },
  8: { name: 'Building', size: 'about 38 × 19 m' },
  9: { name: 'Storefront', size: 'about 5 × 5 m' },
  10: { name: 'Spot', size: 'about 1.2 m × 60 cm' },
};

/** A map zoom at which one area of the given precision is a comfortably visible tile. */
const MAP_ZOOM_FOR_PRECISION: Record<number, number> = { 4: 8, 5: 11, 6: 13, 7: 15, 8: 18, 9: 20, 10: 20 };

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString();
}

/** Busiest first; ties go to the higher boost score, then to the geohash so the order is stable. */
function byHottest(a: HeatmapBin, b: HeatmapBin): number {
  return b.post_count - a.post_count || b.boost_score - a.boost_score || a.geohash.localeCompare(b.geohash);
}

/** media_url is whatever the author sent; only link to it when it is a plain web address. */
function webUrl(value: string | null): string | null {
  return value && /^https?:\/\//i.test(value) ? value : null;
}

function focusOn(bin: HeatmapBin, previous: MapFocus | null): MapFocus {
  return {
    lat: bin.lat,
    lng: bin.lng,
    zoom: MAP_ZOOM_FOR_PRECISION[bin.geohash.length] ?? 13,
    key: (previous?.key ?? 0) + 1,
  };
}

function ErrorNotice({
  title,
  error,
  retryLabel,
  onRetry,
  retrying,
}: {
  title: string;
  error: Error;
  retryLabel: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying} aria-label={retryLabel}>
        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
        {retrying ? 'Retrying…' : 'Retry'}
      </Button>
    </div>
  );
}

function StatCard({ title, value, caption }: { title: string; value: number; caption: string }) {
  return (
    <Card role="group" aria-label={title}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
      </CardContent>
    </Card>
  );
}

function SamplePost({ post }: { post: HeatmapSamplePost }) {
  const mediaHref = webUrl(post.media_url);

  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {post.content_text ? (
            <p className="mb-1 break-words text-sm">{post.content_text}</p>
          ) : (
            <p className="mb-1 text-sm italic text-muted-foreground">
              {post.media_url ? 'Media post without text' : 'Post without text'}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <time dateTime={post.timestamp}>{formatTime(post.timestamp)}</time>
            {mediaHref && (
              <a href={mediaHref} target="_blank" rel="noopener noreferrer" className="underline">
                View media
              </a>
            )}
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0 text-xs">
          Boost {post.boost_score}
        </Badge>
      </div>
    </li>
  );
}

function AreaCard({
  bin,
  rank,
  maxPostCount,
  selected,
  onShowOnMap,
}: {
  bin: HeatmapBin;
  rank: number;
  maxPostCount: number;
  selected: boolean;
  onShowOnMap: (bin: HeatmapBin) => void;
}) {
  return (
    <article
      aria-label={`Area ${bin.geohash}`}
      aria-current={selected ? 'true' : undefined}
      className={`space-y-3 rounded-lg border p-4 ${selected ? 'border-primary ring-1 ring-primary' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className="mt-1 h-4 w-4 shrink-0 rounded-sm"
            style={{ backgroundColor: HEAT_COLORS[heatLevel(bin.post_count, maxPostCount)] }}
            aria-hidden="true"
          />
          <div>
            <h3 className="font-semibold">
              #{rank} · {plural(bin.post_count, 'post')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {bin.lat.toFixed(4)}, {bin.lng.toFixed(4)} · <span className="font-mono">{bin.geohash}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Boost score {bin.boost_score}</Badge>
          <Button
            size="sm"
            variant={selected ? 'default' : 'outline'}
            aria-pressed={selected}
            onClick={() => onShowOnMap(bin)}
          >
            <MapPin className="mr-2 h-4 w-4" aria-hidden="true" />
            Show on map
          </Button>
        </div>
      </div>

      {bin.top_tags.length > 0 && (
        <ul aria-label="Popular tags" className="flex flex-wrap gap-2">
          {bin.top_tags.map((tag) => (
            <li key={tag}>
              <Badge variant="secondary">#{tag}</Badge>
            </li>
          ))}
        </ul>
      )}

      {bin.sample_posts.length > 0 && (
        <ul aria-label="Sample posts" className="space-y-2">
          {bin.sample_posts.map((post) => (
            <SamplePost key={post.post_id} post={post} />
          ))}
        </ul>
      )}
    </article>
  );
}

export default function HeatmapPage() {
  const queryClient = useQueryClient();
  const minPostsId = useId();
  const dropZonesId = useId();
  const detailLabelId = useId();

  const [timeWindow, setTimeWindow] = useState<HeatmapWindow>('24h');
  const [precision, setPrecision] = useState(HEATMAP_DEFAULT_ZOOM);
  const [searchArea, setSearchArea] = useState<HeatmapBBox | null>(null);
  const [areaNotice, setAreaNotice] = useState<string | null>(null);
  const [minPostsText, setMinPostsText] = useState('1');
  const [showDropZones, setShowDropZones] = useState(true);
  const [selectedGeohash, setSelectedGeohash] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(LIST_STEP);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const mapRef = useRef<LeafletMap | null>(null);
  const openedOnActivity = useRef(false);

  const heatmapQuery = useQuery({
    queryKey: [...HEATMAP_KEY, 'bins', { window: timeWindow, zoom: precision, bbox: searchArea }],
    queryFn: () => HeatmapAPI.getHeatmap({ window: timeWindow, zoom: precision, bbox: searchArea ?? undefined }),
    // Keep the previous answer on screen while the next window, detail level or area loads
    placeholderData: keepPreviousData,
    refetchInterval: 5 * 60 * 1000,
  });

  const dropZonesQuery = useQuery({
    queryKey: [...HEATMAP_KEY, 'dropzones'],
    queryFn: () => HeatmapAPI.listDropZones({ active: true, limit: DROP_ZONE_LIMIT }),
    enabled: showDropZones,
    // Zones are created, joined and checked into on the drop zones page, which does not know
    // about this copy of the list: re-read it whenever this page is opened.
    refetchOnMount: 'always',
  });

  // The API caches its answers, so a plain re-read would return the same counts.
  // Refreshing drops that cache first, then re-reads everything on the page.
  const refresh = useMutation({
    mutationFn: () => HeatmapAPI.refreshCache(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HEATMAP_KEY }),
  });

  const data = heatmapQuery.data;
  // The labels describe the answer on screen, which lags the controls while a new one loads
  const shownWindow = WINDOW_LABELS[data?.time_window ?? timeWindow] ?? WINDOW_LABELS[timeWindow];

  const rankedBins = useMemo(() => (data ? [...data.bins].sort(byHottest) : []), [data]);
  const maxPostCount = rankedBins[0]?.post_count ?? 0;

  const minPosts = Math.max(1, Number.parseInt(minPostsText, 10) || 1);
  const shownBins = useMemo(() => rankedBins.filter((bin) => bin.post_count >= minPosts), [rankedBins, minPosts]);
  const listedBins = shownBins.slice(0, visibleCount);

  // The selected area can sit anywhere in the ranking (a tile picked on the map, or one that
  // was listed before the list was cut back). Past the end of the list it is shown above it,
  // on its own: a result can hold thousands of areas, far too many to list down to that one.
  const selectedIndex = useMemo(
    () => (selectedGeohash === null ? -1 : shownBins.findIndex((bin) => bin.geohash === selectedGeohash)),
    [shownBins, selectedGeohash],
  );
  const pinnedBin = selectedIndex >= visibleCount ? shownBins[selectedIndex] : undefined;

  const dropZones = showDropZones ? dropZonesQuery.data : undefined;

  // Open the map on the busiest area once, the first time there is one. After that the
  // map only moves when the user asks it to.
  const isPlaceholder = heatmapQuery.isPlaceholderData;
  useEffect(() => {
    if (openedOnActivity.current || !data || isPlaceholder) return;
    if (data.bbox) {
      // The user picked the area themselves, so the results are already in view
      openedOnActivity.current = true;
      return;
    }
    const hottest = rankedBins[0];
    if (!hottest) return;
    openedOnActivity.current = true;
    setFocus((previous) => focusOn(hottest, previous));
  }, [data, isPlaceholder, rankedBins]);

  const handleMapReady = useCallback((map: LeafletMap) => {
    mapRef.current = map;
  }, []);

  // What the last refresh reported belongs to the view it was pressed on
  const clearRefreshReport = () => {
    if (!refresh.isPending) refresh.reset();
  };

  const changeWindow = (next: HeatmapWindow) => {
    setTimeWindow(next);
    setVisibleCount(LIST_STEP);
    clearRefreshReport();
  };

  const changePrecision = (requested: number) => {
    const next = Math.min(HEATMAP_MAX_ZOOM, Math.max(HEATMAP_MIN_ZOOM, requested));
    setPrecision(next);
    // Areas of another size have other geohashes
    setSelectedGeohash(null);
    setVisibleCount(LIST_STEP);
    clearRefreshReport();

    // Zoom the map to suit the new area size, around whatever it is showing now;
    // otherwise small areas would shrink to dots and large ones would fill the view.
    const center = mapRef.current?.getCenter();
    if (center) {
      setFocus((previous) => ({
        lat: center.lat,
        lng: center.lng,
        zoom: MAP_ZOOM_FOR_PRECISION[next] ?? 13,
        key: (previous?.key ?? 0) + 1,
      }));
    }
  };

  const searchThisArea = () => {
    const bounds = mapRef.current?.getBounds();
    const bbox = bounds
      ? bboxFromBounds({
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        })
      : null;

    if (!bbox) {
      setAreaNotice('The map has no visible area to search yet. Move or zoom the map and try again.');
      return;
    }
    setAreaNotice(null);
    setSearchArea(bbox);
    setVisibleCount(LIST_STEP);
    clearRefreshReport();
  };

  const searchEverywhere = () => {
    setAreaNotice(null);
    setSearchArea(null);
    setVisibleCount(LIST_STEP);
    clearRefreshReport();
  };

  const showOnMap = (bin: HeatmapBin) => {
    setSelectedGeohash(bin.geohash);
    setFocus((previous) => focusOn(bin, previous));
  };

  // A tile was clicked: mark the area. The list highlights it, or shows it on top when it is further down.
  const selectFromMap = useCallback((bin: HeatmapBin) => {
    setSelectedGeohash(bin.geohash);
  }, []);

  const precisionInfo = PRECISION_INFO[precision];
  const areaPhrase = data?.bbox ? ' in the searched map area' : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapIcon className="h-6 w-6" aria-hidden="true" />
          <h1 className="text-2xl font-bold">Activity Heat Map</h1>
        </div>
        <Button onClick={() => refresh.mutate()} disabled={refresh.isPending} size="sm" variant="outline">
          <RotateCcw className={`mr-2 h-4 w-4 ${refresh.isPending ? 'animate-spin' : ''}`} aria-hidden="true" />
          {refresh.isPending ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {refresh.isError && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <span className="font-semibold">Could not refresh the heat map.</span> {refresh.error.message}
        </div>
      )}
      {/* Not while the re-read after it has failed: the results on screen are then the old ones */}
      {refresh.isSuccess && !heatmapQuery.isError && (
        <p role="status" className="text-sm text-muted-foreground">
          {refresh.data.throttled
            ? 'The heat map was already recounted in the last few seconds. Showing those results.'
            : `Heat map recounted. ${plural(refresh.data.cache_keys_cleared, 'cached result')} cleared.`}
        </p>
      )}

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" aria-hidden="true" />
            View Controls
          </CardTitle>
          <CardDescription>Choose the time window, how fine the areas are, and what the map shows</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Time Window */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4" aria-hidden="true" />
                Time window
              </div>
              <div role="group" aria-label="Time window" className="flex flex-wrap gap-2">
                {HEATMAP_WINDOWS.map((option) => (
                  <Button
                    key={option}
                    size="sm"
                    variant={option === timeWindow ? 'default' : 'outline'}
                    aria-pressed={option === timeWindow}
                    onClick={() => changeWindow(option)}
                  >
                    {WINDOW_LABELS[option].button}
                  </Button>
                ))}
              </div>
            </div>

            {/* Detail level: the geohash precision the API calls "zoom" */}
            <div className="space-y-2">
              <div id={detailLabelId} className="flex items-center gap-2 text-sm font-medium">
                <MapIcon className="h-4 w-4" aria-hidden="true" />
                Detail level
              </div>
              <div role="group" aria-labelledby={detailLabelId} className="flex items-center gap-2">
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label="Larger areas"
                  disabled={precision <= HEATMAP_MIN_ZOOM}
                  onClick={() => changePrecision(precision - 1)}
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </Button>
                <span role="status" className="min-w-16 text-center text-sm font-medium">
                  Level {precision}
                </span>
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label="Smaller areas"
                  disabled={precision >= HEATMAP_MAX_ZOOM}
                  onClick={() => changePrecision(precision + 1)}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {precisionInfo ? `${precisionInfo.name}: each area is ${precisionInfo.size}. ` : ''}
                Levels run from {HEATMAP_MIN_ZOOM} (largest areas) to {HEATMAP_MAX_ZOOM} (smallest).
              </p>
            </div>

            {/* Minimum activity */}
            <div className="space-y-2">
              <Label htmlFor={minPostsId} className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
                Minimum posts per area
              </Label>
              <Input
                id={minPostsId}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={minPostsText}
                onChange={(event) => {
                  setMinPostsText(event.target.value);
                  setVisibleCount(LIST_STEP);
                }}
                className="max-w-32"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch id={dropZonesId} checked={showDropZones} onCheckedChange={setShowDropZones} />
                <Label htmlFor={dropZonesId}>Show drop zones</Label>
              </div>
              <Button size="sm" variant="outline" onClick={searchThisArea}>
                <Crosshair className="mr-2 h-4 w-4" aria-hidden="true" />
                Search this map area
              </Button>
              {searchArea && (
                <Button size="sm" variant="ghost" onClick={searchEverywhere}>
                  <Globe className="mr-2 h-4 w-4" aria-hidden="true" />
                  Search everywhere
                </Button>
              )}
            </div>
            {data && (
              <div className="text-sm text-muted-foreground">
                Showing {shownBins.length} of {plural(data.bins.length, 'area')}
              </div>
            )}
          </div>

          {areaNotice && (
            <p role="status" className="text-sm text-muted-foreground">
              {areaNotice}
            </p>
          )}
        </CardContent>
      </Card>

      {heatmapQuery.isError && (
        <ErrorNotice
          title={data ? 'Could not update the heat map. Showing the last loaded results.' : 'Could not load the heat map'}
          error={heatmapQuery.error}
          retryLabel="Retry loading the heat map"
          onRetry={() => heatmapQuery.refetch()}
          retrying={heatmapQuery.isFetching}
        />
      )}

      {/* Heat Map */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Hotspots</CardTitle>
          <CardDescription>
            {data
              ? `${plural(data.total_posts, 'public post')} in ${plural(data.bins.length, 'area')} over ${shownWindow.phrase}${areaPhrase}`
              : 'Where public, geo-tagged posts cluster'}
            {data && data.total_posts >= HEATMAP_MAX_POSTS && (
              <span className="block">Only the newest {HEATMAP_MAX_POSTS} posts are counted.</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <HeatMap
            bins={shownBins}
            maxPostCount={maxPostCount}
            dropZones={dropZones}
            searchArea={data?.bbox}
            selectedGeohash={selectedGeohash}
            focus={focus}
            isLoading={heatmapQuery.isFetching}
            onMapReady={handleMapReady}
            onBinSelect={selectFromMap}
            className="h-[28rem]"
          />

          {/* Drop zones on the map */}
          {showDropZones &&
            (dropZonesQuery.isError ? (
              <ErrorNotice
                title="Could not load drop zones"
                error={dropZonesQuery.error}
                retryLabel="Retry loading drop zones"
                onRetry={() => dropZonesQuery.refetch()}
                retrying={dropZonesQuery.isFetching}
              />
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                {dropZonesQuery.data === undefined
                  ? 'Loading drop zones…'
                  : dropZonesQuery.data.length === 0
                    ? 'No active drop zones right now.'
                    : dropZonesQuery.data.length >= DROP_ZONE_LIMIT
                      ? `The ${DROP_ZONE_LIMIT} newest active drop zones are on the map.`
                      : `${plural(dropZonesQuery.data.length, 'active drop zone')} on the map.`}
              </p>
            ))}
        </CardContent>
      </Card>

      {!data && heatmapQuery.isPending && (
        <div role="status" aria-label="Loading heat map" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {data && (
        <>
          {/* Statistics */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard title="Total Activity" value={data.total_posts} caption={`public posts in ${shownWindow.phrase}`} />
            <StatCard title="Active Areas" value={data.bins.length} caption="areas with at least one post" />
            <StatCard title="Peak Activity" value={maxPostCount} caption="posts in the busiest area" />
          </div>

          {/* Hottest areas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" aria-hidden="true" />
                Hottest Areas
              </CardTitle>
              <CardDescription>
                Busiest first, with up to three recent posts from each area
                {isPlaceholder ? ' · updating…' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.bins.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MapPin className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden="true" />
                  <h3 className="mb-2 text-lg font-semibold">No activity here yet</h3>
                  <p className="mb-4 text-sm text-muted-foreground">
                    No public posts with a location in {shownWindow.phrase}
                    {areaPhrase}.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {data.time_window !== '7d' && (
                      <Button variant="outline" onClick={() => changeWindow('7d')}>
                        Show the last 7 days
                      </Button>
                    )}
                    {data.bbox && (
                      <Button variant="outline" onClick={searchEverywhere}>
                        Search everywhere
                      </Button>
                    )}
                  </div>
                </div>
              ) : shownBins.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MapPin className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden="true" />
                  <h3 className="mb-2 text-lg font-semibold">No area has {minPosts} or more posts</h3>
                  <p className="mb-4 text-sm text-muted-foreground">
                    The busiest area has {plural(maxPostCount, 'post')}.
                  </p>
                  <Button variant="outline" onClick={() => setMinPostsText('1')}>
                    Reset filter
                  </Button>
                </div>
              ) : (
                <>
                  {pinnedBin && (
                    <section aria-label="Selected area" className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">
                        Selected area, ranked lower than the areas listed below
                      </p>
                      <AreaCard
                        bin={pinnedBin}
                        rank={selectedIndex + 1}
                        maxPostCount={maxPostCount}
                        selected
                        onShowOnMap={showOnMap}
                      />
                    </section>
                  )}
                  <ol aria-label="Hottest areas" className="space-y-3">
                    {listedBins.map((bin, index) => (
                      <li key={bin.geohash}>
                        <AreaCard
                          bin={bin}
                          rank={index + 1}
                          maxPostCount={maxPostCount}
                          selected={bin.geohash === selectedGeohash}
                          onShowOnMap={showOnMap}
                        />
                      </li>
                    ))}
                  </ol>
                  {shownBins.length > listedBins.length && (
                    <Button variant="outline" className="w-full" onClick={() => setVisibleCount((count) => count + LIST_STEP)}>
                      Show more ({shownBins.length - listedBins.length} more)
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
