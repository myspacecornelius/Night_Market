import { useEffect, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData, QueryClient, UseInfiniteQueryResult } from '@tanstack/react-query';
import {
  AlertCircle,
  BadgeCheck,
  CalendarDays,
  Check,
  Clock,
  ExternalLink,
  Flame,
  ImageOff,
  Plus,
  RefreshCw,
  Star,
  Store,
  Users,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropsAPI } from '@/lib/api/drops';
import type { Drop, DropFollowState, DropStatus, DropsPage, ListDropsParams } from '@/lib/api/drops';

const DROPS_KEY = ['drops'] as const;
const LIST_KEY = [...DROPS_KEY, 'list'] as const;
const FOLLOWING_KEY = [...DROPS_KEY, 'following'] as const;
const DETAIL_KEY = [...DROPS_KEY, 'detail'] as const;
const STATS_KEY = [...DROPS_KEY, 'stats'] as const;
const FOLLOW_MUTATION_KEY = [...DROPS_KEY, 'follow'] as const;

/** Query keys of other pages that count follows: the weekly "Collector" quest (Quests.tsx). */
const FOLLOW_DEPENDENT_KEYS = [['quests']] as const;

const PAGE_SIZE = 20;
/** How often the lists and the statistics are read again while the page stays open. */
const REFRESH_MS = 60_000;
/** How long typing in a filter has to pause before the list is asked for again. */
const FILTER_DELAY_MS = 300;

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type TabName = 'upcoming' | 'following';

const STATUSES: { value: DropStatus; label: string; color: string }[] = [
  { value: 'upcoming', label: 'Upcoming', color: 'bg-blue-500' },
  { value: 'live', label: 'Live', color: 'bg-green-500' },
  { value: 'delayed', label: 'Delayed', color: 'bg-amber-500' },
  { value: 'sold_out', label: 'Sold out', color: 'bg-gray-500' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-500' },
  { value: 'ended', label: 'Ended', color: 'bg-gray-500' },
];

/** In these states nothing is going to release (any more), whatever the release date says. */
const NOT_RELEASING: Partial<Record<DropStatus, string>> = {
  sold_out: 'No longer available',
  cancelled: 'Will not release',
  ended: 'Release is over',
};

/**
 * A drop is live, sold out or ended only once its release time has come. Without dates the
 * API lists what is still to come, where such a drop cannot be: asked for one of these
 * statuses alone, it would never find anything. The list is then asked for the releases of
 * the last four weeks as well (from_date), as far back as it looks ahead by itself.
 */
const RELEASED_STATUSES: readonly DropStatus[] = ['live', 'sold_out', 'ended'];
const LOOK_BACK_MS = 4 * 7 * DAY;

interface Filters {
  brand: string;
  city: string;
  status: DropStatus | null;
  featuredOnly: boolean;
}

const NO_FILTERS: Filters = { brand: '', city: '', status: null, featuredOnly: false };

type FilterParams = Pick<ListDropsParams, 'brand' | 'city' | 'status' | 'featured_only' | 'from_date'>;

// The API does not say which currency a price is in; the catalogue is priced in US dollars.
const priceFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const dayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

function formatPrice(price: number | null): string {
  return price === null ? 'Price to be announced' : priceFormat.format(price);
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** The time left, in its two largest units: "2d 3h", "4h 12m", "12m 30s", "45s". */
function formatCountdown(remainingMs: number): string {
  const days = Math.floor(remainingMs / DAY);
  const hours = Math.floor((remainingMs % DAY) / HOUR);
  const minutes = Math.floor((remainingMs % HOUR) / MINUTE);
  const seconds = Math.floor((remainingMs % MINUTE) / SECOND);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** The address if it is an http or https URL, otherwise null: nothing else becomes a link or an image. */
function httpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

interface LinkEntry {
  label: string;
  value: string;
}

/**
 * A drop's links as label and value pairs. The API stores whatever it was given, usually
 * {"name": "https://..."}, but a value may be a list or a nested object: those are flattened.
 */
function linkEntries(links: Drop['links']): LinkEntry[] {
  const entries: LinkEntry[] = [];
  const visit = (label: string, value: unknown, depth: number) => {
    if (value === null || value === undefined || value === '') return;
    if (typeof value !== 'object') {
      entries.push({ label, value: String(value) });
    } else if (depth < 3) {
      if (Array.isArray(value)) value.forEach((item) => visit(label, item, depth + 1));
      else for (const [key, nested] of Object.entries(value)) visit(`${label} ${key}`, nested, depth + 1);
    }
  };
  for (const [key, value] of Object.entries(links ?? {})) visit(key, value, 0);
  return entries.map((entry) => ({ ...entry, label: entry.label.replace(/_/g, ' ') }));
}

/** The current time in milliseconds, read again every `intervalMs` so countdowns keep moving. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** `value`, once it has stopped changing for `delayMs`. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

/**
 * A text filter as it is applied: after a pause in typing (every letter would otherwise be
 * its own request), but at once when the field is emptied.
 */
function useSettledText(text: string): string {
  const typed = text.trim();
  const settled = useDebounced(typed, FILTER_DELAY_MS);
  return typed === '' ? '' : settled;
}

/* ------------------------------------------------------------------ */
/* Following                                                           */
/* ------------------------------------------------------------------ */

type FollowFields = Pick<Drop, 'is_following' | 'interest_count' | 'hype_score'>;

interface FollowRequest {
  /** The drop as it was shown when the button was pressed: what a failure goes back to. */
  drop: Drop;
  follow: boolean;
}

interface FollowFailure extends FollowRequest {
  message: string;
}

interface FollowControls {
  toggle: (drop: Drop) => void;
  pendingIds: readonly string[];
  failure: FollowFailure | null;
  dismissFailure: () => void;
}

/** Change one drop wherever it is cached: both lists (every loaded page) and its detail. */
function patchDrop(queryClient: QueryClient, dropId: string, change: (drop: Drop) => FollowFields) {
  const apply = (drop: Drop): Drop => (drop.id === dropId ? { ...drop, ...change(drop) } : drop);
  for (const queryKey of [LIST_KEY, FOLLOWING_KEY]) {
    queryClient.setQueriesData<InfiniteData<DropsPage>>(
      { queryKey },
      (data) => data && { ...data, pages: data.pages.map((page) => ({ ...page, drops: page.drops.map(apply) })) },
    );
  }
  queryClient.setQueryData<Drop>([...DETAIL_KEY, dropId], (data) => data && apply(data));
}

/**
 * Follow and unfollow with the result on screen at once. The button and the counters change
 * when it is pressed; the API's answer then replaces the guess, and a failure puts back what
 * the drop showed before and is reported with the API's message.
 */
function useFollowToggle(): FollowControls {
  const queryClient = useQueryClient();
  const [pendingIds, setPendingIds] = useState<readonly string[]>([]);
  const [failure, setFailure] = useState<FollowFailure | null>(null);

  const mutation = useMutation<DropFollowState, Error, FollowRequest>({
    mutationKey: FOLLOW_MUTATION_KEY,
    mutationFn: ({ drop, follow }) => (follow ? DropsAPI.follow(drop.id) : DropsAPI.unfollow(drop.id)),
    onMutate: async ({ drop, follow }) => {
      setFailure(null);
      setPendingIds((ids) => [...ids, drop.id]);
      // A list being read right now was put together before this press: its answer must not undo it.
      await Promise.all(
        [LIST_KEY, FOLLOWING_KEY, [...DETAIL_KEY, drop.id]].map((queryKey) => queryClient.cancelQueries({ queryKey })),
      );
      const step = follow ? 1 : -1;
      patchDrop(queryClient, drop.id, (current) => ({
        is_following: follow,
        interest_count: Math.max(0, current.interest_count + step),
        hype_score: Math.max(0, current.hype_score + step),
      }));
    },
    onSuccess: (state, { drop }) => {
      patchDrop(queryClient, drop.id, () => ({
        is_following: state.following,
        interest_count: state.interest_count,
        hype_score: state.hype_score,
      }));
    },
    onError: (error, request) => {
      const { drop } = request;
      patchDrop(queryClient, drop.id, () => ({
        is_following: drop.is_following,
        interest_count: drop.interest_count,
        hype_score: drop.hype_score,
      }));
      setFailure({ ...request, message: error.message });
    },
    onSettled: (_state, _error, { drop }) => {
      setPendingIds((ids) => ids.filter((id) => id !== drop.id));
      // While another follow is still on its way, reading the lists again would show that drop
      // as it was before its own press; the last one to finish does the reading.
      if (queryClient.isMutating({ mutationKey: FOLLOW_MUTATION_KEY }) > 1) return;
      // The Following tab gains or loses the drop; the rest catches up with other people's follows.
      for (const queryKey of [LIST_KEY, FOLLOWING_KEY, DETAIL_KEY, ...FOLLOW_DEPENDENT_KEYS]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
  const { mutate } = mutation;

  return {
    toggle: (drop) => {
      if (!pendingIds.includes(drop.id)) mutate({ drop, follow: !drop.is_following });
    },
    pendingIds,
    failure,
    dismissFailure: () => setFailure(null),
  };
}

function FollowButton({ drop, controls }: { drop: Drop; controls: FollowControls }) {
  return (
    <Button
      size="sm"
      variant={drop.is_following ? 'secondary' : 'default'}
      aria-pressed={drop.is_following}
      aria-label={`${drop.is_following ? 'Following' : 'Follow'} ${drop.name}`}
      disabled={controls.pendingIds.includes(drop.id)}
      onClick={() => controls.toggle(drop)}
    >
      {drop.is_following ? (
        <Check className="mr-1 h-4 w-4" aria-hidden="true" />
      ) : (
        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
      )}
      {drop.is_following ? 'Following' : 'Follow'}
    </Button>
  );
}

function FollowFailureNotice({ failure, onDismiss }: { failure: FollowFailure; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
    >
      <span>
        Could not {failure.follow ? 'follow' : 'unfollow'} {failure.drop.name}: {failure.message}
      </span>
      <Button size="icon-sm" variant="ghost" aria-label="Dismiss message" onClick={onDismiss}>
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

function ErrorNotice({
  title,
  error,
  onRetry,
  retrying,
}: {
  title: string;
  error: Error;
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
      <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
        {retrying ? 'Retrying…' : 'Retry'}
      </Button>
    </div>
  );
}

function Stat({ label, value, className = '' }: { label: string; value: number; className?: string }) {
  return (
    <div role="group" aria-label={label} className="rounded-lg border bg-card p-3">
      <div className={`text-2xl font-bold ${className}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: DropStatus }) {
  const known = STATUSES.find((option) => option.value === status);
  return <Badge className={`${known?.color ?? 'bg-gray-500'} text-white text-xs`}>{known?.label ?? status}</Badge>;
}

function DropImage({ drop, className }: { drop: Pick<Drop, 'brand' | 'name' | 'image_url'>; className: string }) {
  const src = drop.image_url ? httpUrl(drop.image_url) : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return (
      <div
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground ${className}`}
      >
        <ImageOff className="h-6 w-6" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={`${drop.brand} ${drop.name}`}
      loading="lazy"
      onError={() => setFailedSrc(src)}
      className={`shrink-0 rounded-md bg-muted object-cover ${className}`}
    />
  );
}

/**
 * How long until the drop releases, counted from release_at against the clock here (the
 * API's own time_until_drop is as old as the response). Seconds are shown in the last hour.
 */
function Countdown({ drop }: { drop: Pick<Drop, 'release_at' | 'status'> }) {
  const releaseTime = drop.release_at ? new Date(drop.release_at).getTime() : null;
  const notReleasing = NOT_RELEASING[drop.status];
  // Every second from just before the last hour, when the seconds are shown. Once the time
  // has come, or when nothing is going to release, there is nothing left to count: such a
  // card must not wake up every second for as long as the page is open.
  const remaining = releaseTime === null || notReleasing ? null : releaseTime - Date.now();
  const counting = remaining !== null && remaining > 0;
  const now = useNow(!counting ? MINUTE : remaining < HOUR + 30 * SECOND ? SECOND : 30 * SECOND);

  let text: string;
  if (notReleasing) text = notReleasing;
  else if (releaseTime === null) text = 'Release date to be announced';
  else if (releaseTime > now) text = `Releases in ${formatCountdown(releaseTime - now)}`;
  else text = drop.status === 'live' ? 'Live now' : 'Release time has passed';

  return <span>{text}</span>;
}

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

function CountList({ label, items }: { label: string; items: { name: string; count: number }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <ul aria-label={label} className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.name}>
            <Badge variant="outline">
              {item.name} <span className="ml-1 text-muted-foreground">{item.count}</span>
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatsStrip() {
  const statsQuery = useQuery({
    queryKey: STATS_KEY,
    queryFn: () => DropsAPI.stats(),
    refetchInterval: REFRESH_MS,
  });
  const stats = statsQuery.data;

  return (
    <section aria-label="Drop statistics" className="space-y-3">
      {statsQuery.isPending && (
        <div role="status" aria-label="Loading drop statistics" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[70px] w-full" />
          ))}
        </div>
      )}

      {statsQuery.isError && (
        <ErrorNotice
          title={stats ? 'Could not refresh drop statistics' : 'Could not load drop statistics'}
          error={statsQuery.error}
          onRetry={() => void statsQuery.refetch()}
          retrying={statsQuery.isFetching}
        />
      )}

      {stats && stats.total_drops === 0 && (
        <p className="text-sm text-muted-foreground">No drops have been announced yet.</p>
      )}

      {stats && stats.total_drops > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total drops" value={stats.total_drops} />
            <Stat label="Upcoming" value={stats.upcoming_drops} className="text-blue-600" />
            <Stat label="Live now" value={stats.live_drops} className="text-green-600" />
            <Stat label="This week" value={stats.this_week_drops} className="text-orange-600" />
          </div>
          {stats.top_brands.length > 0 && (
            <CountList
              label="Top brands"
              items={stats.top_brands.map((entry) => ({ name: entry.brand, count: entry.count }))}
            />
          )}
          {stats.release_types.length > 0 && (
            <CountList
              label="Release types"
              items={stats.release_types.map((entry) => ({ name: entry.type, count: entry.count }))}
            />
          )}
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Agenda                                                              */
/* ------------------------------------------------------------------ */

interface DayGroup {
  /** Local date as YYYY-MM-DD, or null for drops without a release date. */
  day: string | null;
  label: string;
  drops: Drop[];
}

function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The drops by release day, in the reader's time zone: today and later first, soonest day
 * first; then the drops without a date; then the days that are over, most recent first.
 * Within a day the drops keep the order the API gave them.
 */
function groupByDay(drops: Drop[], now: number): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const drop of drops) {
    const release = drop.release_at ? new Date(drop.release_at) : null;
    const day = release ? localDay(release) : null;
    const key = day ?? 'undated';
    let group = groups.get(key);
    if (!group) {
      group = { day, label: release ? dayFormat.format(release) : 'Date to be announced', drops: [] };
      groups.set(key, group);
    }
    group.drops.push(drop);
  }

  const today = localDay(new Date(now));
  const rank = (group: DayGroup) => (group.day === null ? 1 : group.day >= today ? 0 : 2);
  return [...groups.values()].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.day === null || b.day === null) return 0;
    return rank(a) === 0 ? a.day.localeCompare(b.day) : b.day.localeCompare(a.day);
  });
}

function DropCard({
  drop,
  follow,
  onShowDetails,
}: {
  drop: Drop;
  follow: FollowControls;
  onShowDetails: (drop: Drop) => void;
}) {
  const release = drop.release_at ? new Date(drop.release_at) : null;

  return (
    <Card size="sm" className="hover:shadow-lg transition-shadow">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <DropImage drop={drop} className="h-20 w-20" />

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{drop.brand}</span>
            <StatusBadge status={drop.status} />
            {drop.is_featured && (
              <Badge variant="secondary">
                <Star className="mr-1 h-3 w-3" aria-hidden="true" />
                Featured
              </Badge>
            )}
            {drop.release_type && <Badge variant="outline">{drop.release_type}</Badge>}
          </div>

          <h3 className="font-semibold leading-tight">{drop.name}</h3>

          <p className="flex flex-wrap items-center gap-x-2 text-sm">
            <Clock className="h-4 w-4" aria-hidden="true" />
            {release && <time dateTime={release.toISOString()}>{timeFormat.format(release)}</time>}
            <Countdown drop={drop} />
          </p>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{formatPrice(drop.retail_price)}</span>
            <span className="flex items-center gap-1">
              <Store className="h-4 w-4" aria-hidden="true" />
              <span>{plural(drop.store_count, 'store')}</span>
            </span>
            <span className="flex items-center gap-1">
              <Flame className="h-4 w-4" aria-hidden="true" />
              <span>Hype {drop.hype_score}</span>
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" aria-hidden="true" />
              <span>{plural(drop.interest_count, 'follower')}</span>
            </span>
          </div>
        </div>

        <div className="flex gap-2 sm:flex-col">
          <FollowButton drop={drop} controls={follow} />
          <Button
            size="sm"
            variant="outline"
            aria-label={`View details for ${drop.name}`}
            onClick={() => onShowDetails(drop)}
          >
            Details
          </Button>
        </div>
      </div>
    </Card>
  );
}

function EmptyState({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <Card className="py-12">
      <CardContent className="text-center">
        <CalendarDays className="mx-auto mb-4 h-12 w-12 text-muted-foreground" aria-hidden="true" />
        <h2 className="mb-2 text-lg font-semibold">{title}</h2>
        <p className={`text-sm text-muted-foreground ${action ? 'mb-4' : ''}`}>{hint}</p>
        {action}
      </CardContent>
    </Card>
  );
}

/** One of the two lists as an agenda, with its loading, empty, error and "load more" states. */
function DropAgenda({
  query,
  what,
  empty,
  follow,
  onShowDetails,
}: {
  query: UseInfiniteQueryResult<InfiniteData<DropsPage>, Error>;
  /** What is being listed, for the status and error messages: "drops", "the drops you follow". */
  what: string;
  empty: ReactNode;
  follow: FollowControls;
  onShowDetails: (drop: Drop) => void;
}) {
  // The day groups depend on what "today" is; a minute is fine enough for midnight to arrive.
  const now = useNow(MINUTE);

  const drops = useMemo(() => {
    // Pages shift when drops are added between page loads; never show a drop twice.
    const byId = new Map<string, Drop>();
    for (const drop of query.data?.pages.flatMap((page) => page.drops) ?? []) {
      if (!byId.has(drop.id)) byId.set(drop.id, drop);
    }
    return [...byId.values()];
  }, [query.data]);
  const groups = useMemo(() => groupByDay(drops, now), [drops, now]);
  const total = query.data?.pages[query.data.pages.length - 1]?.total ?? 0;

  if (query.isPending) {
    return (
      <div role="status" aria-label={`Loading ${what}`} className="space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  // A failed "Load more" leaves the loaded drops in place; it is reported next to that button.
  const loadMoreFailed = query.isFetchNextPageError;

  return (
    <div className="space-y-4">
      {query.isError && !loadMoreFailed && (
        <ErrorNotice
          title={query.data ? `Could not refresh ${what}` : `Could not load ${what}`}
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )}

      {query.data && drops.length === 0 && empty}

      {drops.length > 0 && (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            Showing {drops.length} of {plural(Math.max(total, drops.length), 'drop')}
          </p>
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.day ?? 'undated'} aria-label={group.label} className="space-y-3">
                <h2 className="flex items-center gap-2 border-b pb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  {group.label}
                </h2>
                <ul className="space-y-3">
                  {group.drops.map((drop) => (
                    <li key={drop.id}>
                      <DropCard drop={drop} follow={follow} onShowDetails={onShowDetails} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      {query.isError && loadMoreFailed && (
        <ErrorNotice
          title="Could not load more drops"
          error={query.error}
          onRetry={() => void query.fetchNextPage()}
          retrying={query.isFetchingNextPage}
        />
      )}

      {query.hasNextPage && !loadMoreFailed && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Loading more…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Upcoming                                                            */
/* ------------------------------------------------------------------ */

function hasFilters(filters: Filters): boolean {
  return (
    filters.brand.trim() !== '' || filters.city.trim() !== '' || filters.status !== null || filters.featuredOnly
  );
}

function FilterBar({ filters, onChange }: { filters: Filters; onChange: (filters: Filters) => void }) {
  const brandId = useId();
  const cityId = useId();
  const featuredId = useId();

  return (
    <form
      role="search"
      aria-label="Filter drops"
      className="space-y-3"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1">
          <Label htmlFor={brandId}>Brand</Label>
          <Input
            id={brandId}
            value={filters.brand}
            onChange={(event) => onChange({ ...filters, brand: event.target.value })}
            placeholder="Nike, Adidas…"
            maxLength={100}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={cityId}>City</Label>
          <Input
            id={cityId}
            value={filters.city}
            onChange={(event) => onChange({ ...filters, city: event.target.value })}
            placeholder="Where a store carries it"
            maxLength={100}
          />
        </div>
        <div className="flex items-center gap-2 lg:self-end lg:pb-2">
          <Switch
            id={featuredId}
            checked={filters.featuredOnly}
            onCheckedChange={(checked) => onChange({ ...filters, featuredOnly: checked })}
          />
          <Label htmlFor={featuredId}>Featured only</Label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Status" className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={filters.status === null ? 'default' : 'outline'}
            aria-pressed={filters.status === null}
            onClick={() => onChange({ ...filters, status: null })}
          >
            All
          </Button>
          {STATUSES.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={filters.status === option.value ? 'default' : 'outline'}
              aria-pressed={filters.status === option.value}
              onClick={() => onChange({ ...filters, status: option.value })}
            >
              {option.label}
            </Button>
          ))}
        </div>
        {hasFilters(filters) && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(NO_FILTERS)}>
            <X className="mr-1 h-4 w-4" aria-hidden="true" />
            Clear filters
          </Button>
        )}
      </div>
    </form>
  );
}

function UpcomingDrops({
  filters,
  onFiltersChange,
  follow,
  onShowDetails,
}: {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  follow: FollowControls;
  onShowDetails: (drop: Drop) => void;
}) {
  const brand = useSettledText(filters.brand);
  const city = useSettledText(filters.city);
  const { status, featuredOnly } = filters;

  const looksBack = status !== null && RELEASED_STATUSES.includes(status);
  // Worked out when the status is chosen and to the hour, not on every render: it is part
  // of the query key, and a key that moved with the clock would ask the API without end.
  const releasedSince = useMemo(
    () => (looksBack ? new Date(Math.floor(Date.now() / HOUR) * HOUR - LOOK_BACK_MS).toISOString() : undefined),
    [looksBack],
  );

  const params = useMemo(() => {
    const set: FilterParams = {};
    if (brand) set.brand = brand;
    if (city) set.city = city;
    if (status) set.status = status;
    if (featuredOnly) set.featured_only = true;
    if (releasedSince) set.from_date = releasedSince;
    return set;
  }, [brand, city, status, featuredOnly, releasedSince]);

  // Without dates the API lists the next four weeks and the drops that have no date yet.
  const dropsQuery = useInfiniteQuery({
    queryKey: [...LIST_KEY, params],
    queryFn: ({ pageParam }) => DropsAPI.list({ ...params, page: pageParam, per_page: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.has_next ? lastPage.page + 1 : undefined),
    refetchInterval: REFRESH_MS,
  });

  const filtered = Object.keys(params).length > 0;

  return (
    <div className="space-y-4">
      <FilterBar filters={filters} onChange={onFiltersChange} />
      <DropAgenda
        query={dropsQuery}
        what="drops"
        follow={follow}
        onShowDetails={onShowDetails}
        empty={
          filtered ? (
            <EmptyState
              title="No drops match these filters"
              hint={
                looksBack
                  ? 'Nothing released in the last four weeks, or still to come, fits them.'
                  : 'Nothing releasing in the next four weeks, or still without a date, fits them.'
              }
              action={
                <Button variant="outline" onClick={() => onFiltersChange(NO_FILTERS)}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No upcoming drops"
              hint="Nothing is set to release in the next four weeks."
            />
          )
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Following                                                           */
/* ------------------------------------------------------------------ */

function FollowingDrops({
  includePast,
  onIncludePastChange,
  follow,
  onShowDetails,
  onBrowse,
}: {
  includePast: boolean;
  onIncludePastChange: (includePast: boolean) => void;
  follow: FollowControls;
  onShowDetails: (drop: Drop) => void;
  onBrowse: () => void;
}) {
  const includePastId = useId();

  const followingQuery = useInfiniteQuery({
    queryKey: [...FOLLOWING_KEY, { includePast }],
    queryFn: ({ pageParam }) =>
      DropsAPI.following({ upcoming_only: !includePast, page: pageParam, per_page: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.has_next ? lastPage.page + 1 : undefined),
    refetchInterval: REFRESH_MS,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Switch id={includePastId} checked={includePast} onCheckedChange={onIncludePastChange} />
        <Label htmlFor={includePastId}>Include past releases</Label>
      </div>
      <DropAgenda
        query={followingQuery}
        what="the drops you follow"
        follow={follow}
        onShowDetails={onShowDetails}
        empty={
          <EmptyState
            title={includePast ? 'You are not following any drops' : 'You are not following any upcoming drops'}
            hint="Follow a drop on the Upcoming tab and it is listed here."
            action={<Button onClick={onBrowse}>Browse upcoming drops</Button>}
          />
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Details                                                             */
/* ------------------------------------------------------------------ */

function DropDetailsDialog({
  drop,
  follow,
  onClose,
}: {
  /** The drop as the list had it: enough for the title while the details are read. */
  drop: Drop;
  follow: FollowControls;
  onClose: () => void;
}) {
  const detailsQuery = useQuery({
    queryKey: [...DETAIL_KEY, drop.id],
    queryFn: () => DropsAPI.get(drop.id),
  });
  const details = detailsQuery.data;
  const shown = details ?? drop;
  const release = shown.release_at ? new Date(shown.release_at) : null;
  const links = details ? linkEntries(details.links) : [];
  const failure = follow.failure?.drop.id === drop.id ? follow.failure : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{shown.name}</DialogTitle>
          <DialogDescription>{shown.brand}</DialogDescription>
        </DialogHeader>

        {!details && detailsQuery.isPending && (
          <div role="status" aria-label="Loading drop details" className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {detailsQuery.isError && (
          <ErrorNotice
            title={details ? 'Could not refresh this drop' : 'Could not load this drop'}
            error={detailsQuery.error}
            onRetry={() => void detailsQuery.refetch()}
            retrying={detailsQuery.isFetching}
          />
        )}

        {details && (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row">
              <DropImage drop={details} className="h-40 w-full sm:w-40" />
              <div className="flex-1 space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={details.status} />
                  {details.is_featured && (
                    <Badge variant="secondary">
                      <Star className="mr-1 h-3 w-3" aria-hidden="true" />
                      Featured
                    </Badge>
                  )}
                  {details.is_verified && (
                    <Badge variant="outline">
                      <BadgeCheck className="mr-1 h-3 w-3" aria-hidden="true" />
                      Verified
                    </Badge>
                  )}
                  {details.release_type && <Badge variant="outline">{details.release_type}</Badge>}
                </div>
                <div>
                  <strong>Release:</strong>{' '}
                  {release ? (
                    <time dateTime={release.toISOString()}>
                      {dayFormat.format(release)} at {timeFormat.format(release)}
                    </time>
                  ) : (
                    'No date yet'
                  )}
                </div>
                <div>
                  <Countdown drop={details} />
                </div>
                <div>
                  <strong>Price:</strong> <span>{formatPrice(details.retail_price)}</span>
                </div>
                {details.sku && (
                  <div>
                    <strong>SKU:</strong> <span>{details.sku}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
              <Stat label="Followers" value={details.interest_count} className="text-blue-600" />
              <Stat label="Hype" value={details.hype_score} className="text-orange-600" />
              <Stat label="Stores" value={details.store_count} className="text-green-600" />
              <Stat label="Signals" value={details.signal_count} />
            </div>

            <div>
              <h4 className="mb-2 font-semibold">Description</h4>
              {details.description ? (
                <p className="whitespace-pre-line text-sm">{details.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No description yet.</p>
              )}
            </div>

            <div>
              <h4 className="mb-2 font-semibold">Regions</h4>
              {details.regions && details.regions.length > 0 ? (
                <ul aria-label="Regions" className="flex flex-wrap gap-2">
                  {details.regions.map((region, index) => (
                    <li key={`${region}-${index}`}>
                      <Badge variant="outline">{region}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No regions announced.</p>
              )}
            </div>

            <div>
              <h4 className="mb-2 font-semibold">Links</h4>
              {links.length > 0 ? (
                <ul aria-label="Links" className="space-y-1 text-sm">
                  {links.map((link, index) => {
                    const href = httpUrl(link.value);
                    return (
                      <li key={index} className="flex flex-wrap gap-x-2">
                        <span className="font-medium capitalize">{link.label}:</span>
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 break-all text-primary underline-offset-4 hover:underline"
                          >
                            {link.value}
                            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                          </a>
                        ) : (
                          // Not an http(s) address: shown, never made clickable.
                          <span className="break-all text-muted-foreground">{link.value}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No links yet.</p>
              )}
            </div>
          </div>
        )}

        {failure && <FollowFailureNotice failure={failure} onDismiss={follow.dismissFailure} />}

        {details && (
          <DialogFooter>
            <FollowButton drop={details} controls={follow} />
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const Drops = () => {
  const [tab, setTab] = useState<TabName>('upcoming');
  // Kept here, not in the tabs, which forget everything when they are left: the filters and
  // "Include past releases" are still set after a look at the other tab.
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [includePast, setIncludePast] = useState(false);
  const [selectedDrop, setSelectedDrop] = useState<Drop | null>(null);
  const follow = useFollowToggle();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-6 w-6" aria-hidden="true" />
          <h1 className="text-2xl font-bold">Drops</h1>
        </div>
        <p className="text-sm text-muted-foreground">The release calendar. Follow a drop to keep it on your list.</p>
      </div>

      <StatsStrip />

      {/*
        Stays in view however far down the pressed card is. Behind an open dialog nobody
        would see it: the dialog shows its own drop's failure.
      */}
      {follow.failure && !selectedDrop && (
        <div className="sticky top-2 z-10 rounded-md bg-background">
          <FollowFailureNotice failure={follow.failure} onDismiss={follow.dismissFailure} />
        </div>
      )}

      <Tabs value={tab} onValueChange={(value) => setTab(value === 'following' ? 'following' : 'upcoming')}>
        <TabsList aria-label="Drop lists" className="mb-4">
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="following">Following</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming" className="mt-0">
          <UpcomingDrops
            filters={filters}
            onFiltersChange={setFilters}
            follow={follow}
            onShowDetails={setSelectedDrop}
          />
        </TabsContent>
        <TabsContent value="following" className="mt-0">
          <FollowingDrops
            includePast={includePast}
            onIncludePastChange={setIncludePast}
            follow={follow}
            onShowDetails={setSelectedDrop}
            onBrowse={() => setTab('upcoming')}
          />
        </TabsContent>
      </Tabs>

      {selectedDrop && (
        <DropDetailsDialog
          key={selectedDrop.id}
          drop={selectedDrop}
          follow={follow}
          onClose={() => setSelectedDrop(null)}
        />
      )}
    </div>
  );
};

export default Drops;
