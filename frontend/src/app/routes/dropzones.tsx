import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  MapPin,
  Navigation,
  Plus,
  RefreshCw,
  Target,
  Trophy,
  Users,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { DropZonesAPI, DropZonesApiError } from '@/lib/api/dropzones';
import type {
  CheckInRequest,
  CreateDropZoneRequest,
  DropZone,
  DropZoneDetails,
  DropZoneStatus,
} from '@/lib/api/dropzones';

const ZONES_KEY = ['dropzones'] as const;
const PAGE_SIZE = 24;

/**
 * Query keys of the other pages whose numbers a check-in changes: the LACES balance and ledger
 * (laces.tsx), the signed-in user (useAuth), the dashboard metrics (dashboard.tsx), the profile
 * stats with their check-in count (profile.tsx) and the LACES and check-in boards (leaderboard.tsx).
 */
const CHECK_IN_DEPENDENT_KEYS = [['laces'], ['currentUser'], ['dashboard'], ['profile'], ['leaderboard']] as const;

type ZoneFilter = 'active' | 'inactive' | 'all';

const FILTERS: { value: ZoneFilter; label: string; active: boolean | undefined; emptyTitle: string }[] = [
  { value: 'active', label: 'Active', active: true, emptyTitle: 'No active drop zones' },
  { value: 'inactive', label: 'Not active', active: false, emptyTitle: 'No scheduled, ended or cancelled drop zones' },
  { value: 'all', label: 'All', active: undefined, emptyTitle: 'No drop zones yet' },
];

const STATUS_COLORS: Record<DropZoneStatus, string> = {
  active: 'bg-green-500',
  scheduled: 'bg-blue-500',
  ended: 'bg-gray-500',
  cancelled: 'bg-red-500',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Great-circle distance in meters, the same formula the API uses to verify a check-in. */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

function isNotFound(error: unknown): boolean {
  return error instanceof DropZonesApiError && error.status === 404;
}

/** POST /v1/dropzones/{id}/join answers 400 "Already a member" to someone who has joined before. */
function isAlreadyMember(error: unknown): boolean {
  return error instanceof DropZonesApiError && error.status === 400 && /already a member/i.test(error.message);
}

type ZoneWindow = Pick<DropZone, 'status' | 'starts_at' | 'ends_at'>;

/**
 * The status a zone has at `now`.
 * The API sets `status` when the zone is created and nothing moves it afterwards, but its
 * "active" filter and its check-in endpoint both apply the time window as well: an active zone
 * whose end has passed is over ("Dropzone has ended") and one whose start is still ahead has
 * not begun ("Dropzone has not started yet"). The same rule is applied here.
 */
function currentStatus(zone: ZoneWindow, now: number): DropZoneStatus {
  if (zone.status !== 'active') return zone.status;
  if (zone.starts_at && new Date(zone.starts_at).getTime() > now) return 'scheduled';
  if (zone.ends_at && new Date(zone.ends_at).getTime() < now) return 'ended';
  return 'active';
}

/** Why the API would refuse a check-in at `now`, or null while check-ins are open. */
function checkInClosedReason(zone: ZoneWindow, now: number): string | null {
  if (zone.status !== 'active') {
    return `Check-ins are only open while a zone is active; this one is ${zone.status}.`;
  }
  if (zone.starts_at && new Date(zone.starts_at).getTime() > now) {
    return `Check-ins open when this zone starts on ${formatDate(zone.starts_at)}.`;
  }
  if (zone.ends_at && new Date(zone.ends_at).getTime() < now) {
    return `Check-ins closed when this zone ended on ${formatDate(zone.ends_at)}.`;
  }
  return null;
}

/** The current time, refreshed often enough for a zone's window to open or close on screen. */
function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Ask the browser for the current position; the user may be prompted for permission.
 * `fresh` refuses a cached fix, for when the user asks again after moving.
 */
function requestPosition(
  onSuccess: (coordinates: Coordinates) => void,
  onError: (message: string) => void,
  fresh: boolean,
) {
  if (!navigator.geolocation) {
    onError('This browser cannot share its location.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => onSuccess({ lat: position.coords.latitude, lng: position.coords.longitude }),
    (error) => {
      if (error.code === 1) {
        onError('Location permission was denied. Allow location access for this site and try again.');
      } else if (error.code === 3) {
        onError('Finding your location took too long. Try again.');
      } else {
        onError('Your location is not available right now. Try again.');
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: fresh ? 0 : 60000 },
  );
}

type LocationState =
  | { phase: 'idle' }
  | { phase: 'locating' }
  | ({ phase: 'ready' } & Coordinates)
  | { phase: 'error'; message: string };

/**
 * The browser's position as state. Only the newest request counts: an answer to an earlier
 * request, or one that arrives after the component is gone, is dropped.
 */
function useLocator(initial: LocationState) {
  const [location, setLocation] = useState<LocationState>(initial);
  const newestRequest = useRef(0);

  useEffect(
    () => () => {
      newestRequest.current += 1;
    },
    [],
  );

  const locate = useCallback((options: { fresh?: boolean; onFound?: (coordinates: Coordinates) => void } = {}) => {
    newestRequest.current += 1;
    const request = newestRequest.current;
    setLocation({ phase: 'locating' });
    requestPosition(
      (coordinates) => {
        if (newestRequest.current !== request) return;
        setLocation({ phase: 'ready', ...coordinates });
        options.onFound?.(coordinates);
      },
      (message) => {
        if (newestRequest.current !== request) return;
        setLocation({ phase: 'error', message });
      },
      options.fresh ?? false,
    );
  }, []);

  const reset = useCallback(() => {
    newestRequest.current += 1;
    setLocation({ phase: 'idle' });
  }, []);

  return { location, locate, reset };
}

function StatusBadge({ status }: { status: DropZoneStatus }) {
  return <Badge className={`${STATUS_COLORS[status] ?? 'bg-gray-500'} text-white text-xs capitalize`}>{status}</Badge>;
}

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

function Stat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div role="group" aria-label={label}>
      <div className={`text-2xl font-bold ${className}`}>{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Check-in                                                            */
/* ------------------------------------------------------------------ */

function CheckInPanel({ zone, onClose }: { zone: DropZoneDetails; onClose: () => void }) {
  const queryClient = useQueryClient();
  const messageId = useId();
  const { location, locate } = useLocator({ phase: 'locating' });
  const [message, setMessage] = useState('');

  // The panel opens from the "Check In" button, so the permission prompt follows a click.
  useEffect(() => {
    locate();
  }, [locate]);

  const checkIn = useMutation({
    mutationFn: (body: CheckInRequest) => DropZonesAPI.checkIn(zone.id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ZONES_KEY });
      // The reward is paid out in LACES and the check-in is counted elsewhere too.
      for (const queryKey of CHECK_IN_DEPENDENT_KEYS) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (error) => {
      if (isNotFound(error)) void queryClient.invalidateQueries({ queryKey: ZONES_KEY });
    },
  });

  if (checkIn.isSuccess) {
    const result = checkIn.data;
    return (
      <div className="space-y-3">
        <div role="status" className="rounded-md border border-green-600/40 bg-green-500/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle className="h-4 w-4 text-green-600" aria-hidden="true" />
            Checked in to {zone.name}
          </p>
          <p className="mt-1">
            {result.points_earned > 0 ? `+${result.points_earned} LACES earned` : 'No LACES earned'} · Streak:{' '}
            {plural(result.streak_count, 'day')} · Balance: {result.laces_balance} LACES
          </p>
          {/* The API's own summary: it is the only place that says why a check-in paid nothing. */}
          <p className="mt-1 text-muted-foreground">{result.message}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Recorded {formatDistance(result.distance_from_center)} from the zone center.
          </p>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (location.phase !== 'ready') return;
    const text = message.trim();
    checkIn.mutate({ lat: location.lat, lng: location.lng, ...(text ? { message: text } : {}) });
  };

  const distance =
    location.phase === 'ready' ? distanceMeters(location.lat, location.lng, zone.center_lat, zone.center_lng) : null;

  return (
    <form onSubmit={handleSubmit} aria-label={`Check in to ${zone.name}`} className="space-y-4 rounded-md border p-4">
      <div>
        <h4 className="font-semibold">Check in</h4>
        <p className="text-sm text-muted-foreground">
          Your location is sent to verify you are within {formatDistance(zone.check_in_radius)} of the zone center.
        </p>
      </div>

      <div className="flex items-start gap-2 text-sm">
        <Navigation className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="space-y-2">
          {location.phase === 'locating' && (
            <p role="status" className="text-muted-foreground">
              Getting your location…
            </p>
          )}
          {location.phase === 'error' && (
            <>
              <p role="alert" className="text-destructive">
                {location.message}
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => locate({ fresh: true })}>
                Try again
              </Button>
            </>
          )}
          {location.phase === 'ready' && distance !== null && (
            <>
              <p role="status">
                Location found ({location.lat.toFixed(5)}, {location.lng.toFixed(5)}).{' '}
                {distance <= zone.check_in_radius ? (
                  <span className="text-green-600">
                    You are about {formatDistance(distance)} from the zone center, inside the check-in radius.
                  </span>
                ) : (
                  <span className="text-orange-600">
                    You appear to be about {formatDistance(distance)} from the zone center, outside the{' '}
                    {formatDistance(zone.check_in_radius)} check-in radius.
                  </span>
                )}
              </p>
              <Button type="button" size="sm" variant="ghost" onClick={() => locate({ fresh: true })}>
                Update location
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={messageId}>Message (optional)</Label>
        <Textarea
          id={messageId}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Share what you're up to..."
          maxLength={1000}
        />
      </div>

      {checkIn.isError && (
        <p role="alert" className="text-sm text-destructive">
          Check-in failed: {checkIn.error.message}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={location.phase !== 'ready' || checkIn.isPending}>
          {checkIn.isPending ? 'Checking in…' : 'Confirm check-in'}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Zone details                                                        */
/* ------------------------------------------------------------------ */

function ZoneDetailsDialog({
  zone,
  currentUserId,
  joined,
  now,
  onJoined,
  onClose,
}: {
  zone: DropZone;
  currentUserId: string | undefined;
  joined: boolean;
  now: number;
  onJoined: (zoneId: string) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const checkInHintId = useId();
  const [checkInOpen, setCheckInOpen] = useState(false);

  const detailsQuery = useQuery({
    queryKey: [...ZONES_KEY, 'detail', zone.id],
    queryFn: () => DropZonesAPI.get(zone.id),
    // Other people join and check in while the dialog is open; keep pace with the list.
    refetchInterval: 60000,
  });
  const details = detailsQuery.data;

  const join = useMutation({
    mutationFn: () => DropZonesAPI.join(zone.id),
    onSuccess: () => {
      onJoined(zone.id);
      void queryClient.invalidateQueries({ queryKey: ZONES_KEY });
    },
    onError: (error) => {
      // Neither GET says whether the caller is a member; this refusal does, so stop offering to join.
      if (isAlreadyMember(error)) onJoined(zone.id);
      if (isNotFound(error)) void queryClient.invalidateQueries({ queryKey: ZONES_KEY });
    },
  });
  const alreadyMember = isAlreadyMember(join.error);

  const status = currentStatus(details ?? zone, now);
  const closedReason = checkInClosedReason(details ?? zone, now);
  const description = details ? details.description : zone.description;
  const isOwner = currentUserId !== undefined && (details?.owner_id ?? zone.owner_id) === currentUserId;
  // A private zone is only visible to its members, so whoever can read it is one already.
  const isPrivateMember = !isOwner && details?.is_public === false;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {details?.name ?? zone.name}
            <StatusBadge status={status} />
          </DialogTitle>
          <DialogDescription>{description || 'This zone has no description.'}</DialogDescription>
        </DialogHeader>

        {!details && detailsQuery.isPending && (
          <div role="status" aria-label="Loading drop zone details" className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {detailsQuery.isError && (
          <ErrorNotice
            title={details ? 'Could not refresh this drop zone' : 'Could not load this drop zone'}
            error={detailsQuery.error}
            onRetry={() => void detailsQuery.refetch()}
            retrying={detailsQuery.isFetching}
          />
        )}

        {details && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <Stat label="Members" value={details.stats.member_count} className="text-blue-600" />
              <Stat label="Total Check-ins" value={details.stats.total_checkins} className="text-green-600" />
              <Stat label="Today (UTC)" value={details.stats.today_checkins} className="text-orange-600" />
            </div>

            <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <strong>Location:</strong> {details.center_lat.toFixed(5)}, {details.center_lng.toFixed(5)}
              </div>
              <div>
                <strong>Visibility:</strong> {details.is_public ? 'Public' : 'Private'}
              </div>
              <div>
                <strong>Zone Radius:</strong> {formatDistance(details.radius_meters)}
              </div>
              <div>
                <strong>Check-in Radius:</strong> {formatDistance(details.check_in_radius)}
              </div>
              {details.starts_at && (
                <div>
                  <strong>Starts:</strong> {formatDate(details.starts_at)}
                </div>
              )}
              {details.ends_at && (
                <div>
                  <strong>Ends:</strong> {formatDate(details.ends_at)}
                </div>
              )}
              <div>
                <strong>Created:</strong> {formatDate(details.created_at)}
              </div>
            </div>

            {details.rules && (
              <div>
                <h4 className="font-semibold mb-2">Rules &amp; Guidelines</h4>
                <p className="text-sm bg-muted p-3 rounded whitespace-pre-line">{details.rules}</p>
              </div>
            )}

            {details.tags && details.tags.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Tags</h4>
                <ul className="flex flex-wrap gap-2" aria-label="Tags">
                  {details.tags.map((tag, index) => (
                    <li key={`${tag}-${index}`}>
                      <Badge variant="outline">{tag}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h4 className="font-semibold mb-2">Recent Check-ins</h4>
              {details.recent_checkins.length === 0 ? (
                <p className="text-sm text-muted-foreground">No check-ins yet.</p>
              ) : (
                <ul className="space-y-2 max-h-48 overflow-y-auto" aria-label="Recent check-ins">
                  {details.recent_checkins.map((checkin) => (
                    <li key={checkin.id} className="flex items-center justify-between gap-2 p-2 border rounded">
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {checkin.user_id === currentUserId ? 'You' : `Member ${checkin.user_id.slice(0, 8)}`}
                        </p>
                        {checkin.message && <p className="text-sm">{checkin.message}</p>}
                        <div className="text-xs text-muted-foreground">{formatDate(checkin.checked_in_at)}</div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="secondary">
                          <Trophy className="h-3 w-3 mr-1" aria-hidden="true" />
                          Streak {checkin.streak_count}
                        </Badge>
                        <Badge variant="outline">+{checkin.points_earned} LACES</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3 border-t pt-4">
              {isOwner && <p className="text-sm text-muted-foreground">You own this zone and are already a member.</p>}
              {isPrivateMember && (
                <p className="text-sm text-muted-foreground">
                  You are a member of this private zone; only its members can see it.
                </p>
              )}
              {join.isSuccess && (
                <p role="status" className="text-sm text-green-600">
                  {join.data.message}
                </p>
              )}
              {join.isError &&
                (alreadyMember ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    You are already a member of this zone.
                  </p>
                ) : (
                  <p role="alert" className="text-sm text-destructive">
                    Could not join: {join.error.message}
                  </p>
                ))}

              {checkInOpen ? (
                <CheckInPanel zone={details} onClose={() => setCheckInOpen(false)} />
              ) : (
                <>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    {!isOwner && !isPrivateMember && (
                      <Button variant="outline" onClick={() => join.mutate()} disabled={joined || join.isPending}>
                        <Users className="h-4 w-4 mr-2" aria-hidden="true" />
                        {joined ? 'Joined' : join.isPending ? 'Joining…' : 'Join Zone'}
                      </Button>
                    )}
                    <Button
                      onClick={() => setCheckInOpen(true)}
                      disabled={closedReason !== null}
                      aria-describedby={closedReason !== null ? checkInHintId : undefined}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" aria-hidden="true" />
                      Check In
                    </Button>
                  </div>
                  {closedReason !== null && (
                    <p id={checkInHintId} className="text-sm text-muted-foreground sm:text-right">
                      {closedReason}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Create zone                                                         */
/* ------------------------------------------------------------------ */

interface CreateForm {
  name: string;
  description: string;
  centerLat: string;
  centerLng: string;
  radiusMeters: string;
  checkInRadius: string;
  startsAt: string;
  endsAt: string;
  maxCapacity: string;
  rules: string;
  tags: string;
  isPublic: boolean;
}

type CreateField = Exclude<keyof CreateForm, 'isPublic'>;
type CreateErrors = Partial<Record<CreateField, string>>;

/** The fields in the order they appear, so the first one with a problem can take the focus. */
const CREATE_FIELDS: readonly CreateField[] = [
  'name',
  'description',
  'centerLat',
  'centerLng',
  'radiusMeters',
  'checkInRadius',
  'startsAt',
  'endsAt',
  'maxCapacity',
  'rules',
  'tags',
];

// The limits of the API's DropZoneCreate model (services/routers/dropzones_ext.py).
const MAX_RADIUS_METERS = 50000;
const MAX_CHECK_IN_RADIUS_METERS = 500;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;

const EMPTY_FORM: CreateForm = {
  name: '',
  description: '',
  centerLat: '',
  centerLng: '',
  radiusMeters: '100',
  checkInRadius: '50',
  startsAt: '',
  endsAt: '',
  maxCapacity: '',
  rules: '',
  tags: '',
  isPublic: true,
};

function toNumber(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A datetime-local value as a Date; undefined when left empty, null when unreadable. */
function toDate(value: string): Date | null | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Mirrors the limits of the API's DropZoneCreate model so most mistakes are caught before sending. */
function parseCreateForm(form: CreateForm): { request: CreateDropZoneRequest | null; errors: CreateErrors } {
  const errors: CreateErrors = {};

  const name = form.name.trim();
  if (!name) errors.name = 'Give the zone a name.';
  else if (name.length > 100) errors.name = 'The name can be at most 100 characters.';

  const description = form.description.trim();
  if (description.length > 2000) errors.description = 'The description can be at most 2000 characters.';

  const lat = toNumber(form.centerLat);
  if (lat === null || lat < -90 || lat > 90) errors.centerLat = 'Latitude must be a number between -90 and 90.';

  const lng = toNumber(form.centerLng);
  if (lng === null || lng < -180 || lng > 180) errors.centerLng = 'Longitude must be a number between -180 and 180.';

  const radius = toNumber(form.radiusMeters);
  if (radius === null || radius <= 0 || radius > MAX_RADIUS_METERS) {
    errors.radiusMeters = `Zone radius must be above 0 and at most ${MAX_RADIUS_METERS} meters.`;
  }

  const checkInRadius = toNumber(form.checkInRadius);
  if (checkInRadius === null || checkInRadius <= 0 || checkInRadius > MAX_CHECK_IN_RADIUS_METERS) {
    errors.checkInRadius = `Check-in radius must be above 0 and at most ${MAX_CHECK_IN_RADIUS_METERS} meters.`;
  }

  const startsAt = toDate(form.startsAt);
  if (startsAt === null) errors.startsAt = 'Enter a valid start date and time.';

  const endsAt = toDate(form.endsAt);
  if (endsAt === null) errors.endsAt = 'Enter a valid end date and time.';
  else if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    errors.endsAt = 'The end must be after the start.';
  }

  const maxCapacity = form.maxCapacity.trim() ? toNumber(form.maxCapacity) : undefined;
  if (maxCapacity === null || (maxCapacity !== undefined && (!Number.isInteger(maxCapacity) || maxCapacity < 1))) {
    errors.maxCapacity = 'Capacity must be a whole number of at least 1.';
  }

  const rules = form.rules.trim();
  if (rules.length > 5000) errors.rules = 'The rules can be at most 5000 characters.';

  const tags = form.tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (tags.length > MAX_TAGS) errors.tags = `Use at most ${MAX_TAGS} tags.`;
  else if (tags.some((tag) => tag.length > MAX_TAG_LENGTH)) {
    errors.tags = `Each tag can be at most ${MAX_TAG_LENGTH} characters.`;
  }

  if (Object.keys(errors).length > 0 || lat === null || lng === null || radius === null || checkInRadius === null) {
    return { request: null, errors };
  }

  // Optional fields that were left empty are omitted: the API rejects "" for dates.
  const request: CreateDropZoneRequest = {
    name,
    center_lat: lat,
    center_lng: lng,
    radius_meters: radius,
    check_in_radius: checkInRadius,
    is_public: form.isPublic,
  };
  if (description) request.description = description;
  if (startsAt) request.starts_at = startsAt.toISOString();
  if (endsAt) request.ends_at = endsAt.toISOString();
  if (typeof maxCapacity === 'number') request.max_capacity = maxCapacity;
  if (rules) request.rules = rules;
  if (tags.length > 0) request.tags = tags;
  return { request, errors };
}

function FormField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function CreateZoneDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (zone: DropZone) => void;
}) {
  const queryClient = useQueryClient();
  const formId = useId();
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<CreateErrors>({});
  const { location, locate, reset: resetLocation } = useLocator({ phase: 'idle' });

  const create = useMutation({
    mutationFn: (request: CreateDropZoneRequest) => DropZonesAPI.create(request),
    onSuccess: (zone) => {
      void queryClient.invalidateQueries({ queryKey: ZONES_KEY });
      setForm(EMPTY_FORM);
      setErrors({});
      resetLocation();
      onCreated(zone);
    },
  });

  const set = <K extends keyof CreateForm>(key: K, value: CreateForm[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const field = (name: CreateField) => ({
    id: `${formId}-${name}`,
    value: form[name],
    'aria-invalid': errors[name] ? (true as const) : undefined,
    'aria-describedby': errors[name] ? `${formId}-${name}-error` : undefined,
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseCreateForm(form);
    setErrors(parsed.errors);
    if (parsed.request) {
      create.mutate(parsed.request);
      return;
    }
    // Take the user to the first problem instead of leaving them to hunt for it.
    const firstInvalid = CREATE_FIELDS.find((name) => parsed.errors[name]);
    if (firstInvalid) document.getElementById(`${formId}-${firstInvalid}`)?.focus();
  };

  const fillCurrentLocation = () =>
    locate({
      fresh: true,
      onFound: (coordinates) => {
        setForm((previous) => ({
          ...previous,
          centerLat: coordinates.lat.toFixed(6),
          centerLng: coordinates.lng.toFixed(6),
        }));
        // What an earlier submit said about the coordinates no longer applies.
        setErrors((previous) => ({ ...previous, centerLat: undefined, centerLng: undefined }));
      },
    });
  const locating = location.phase === 'locating';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) create.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Drop Zone</DialogTitle>
          <DialogDescription>Set up a new location-based gathering spot</DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={handleSubmit} className="space-y-4">
          <FormField id={`${formId}-name`} label="Zone Name" error={errors.name}>
            <Input
              {...field('name')}
              onChange={(event) => set('name', event.target.value)}
              placeholder="Coffee meetup, Park hangout..."
              maxLength={100}
              required
            />
          </FormField>

          <FormField id={`${formId}-description`} label="Description (optional)" error={errors.description}>
            <Textarea
              {...field('description')}
              onChange={(event) => set('description', event.target.value)}
              placeholder="What's this zone about?"
              maxLength={2000}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-2">
            <FormField id={`${formId}-centerLat`} label="Latitude" error={errors.centerLat}>
              <Input
                {...field('centerLat')}
                onChange={(event) => set('centerLat', event.target.value)}
                inputMode="decimal"
                placeholder="42.360100"
                required
              />
            </FormField>
            <FormField id={`${formId}-centerLng`} label="Longitude" error={errors.centerLng}>
              <Input
                {...field('centerLng')}
                onChange={(event) => set('centerLng', event.target.value)}
                inputMode="decimal"
                placeholder="-71.058900"
                required
              />
            </FormField>
          </div>
          <div className="space-y-1">
            <Button type="button" size="sm" variant="outline" onClick={fillCurrentLocation} disabled={locating}>
              <Navigation className="h-4 w-4 mr-2" aria-hidden="true" />
              {locating ? 'Getting your location…' : 'Use my current location'}
            </Button>
            {location.phase === 'error' && (
              <p role="alert" className="text-xs text-destructive">
                {location.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <FormField id={`${formId}-radiusMeters`} label="Zone Radius (m)" error={errors.radiusMeters}>
              <Input
                {...field('radiusMeters')}
                onChange={(event) => set('radiusMeters', event.target.value)}
                type="number"
                min={1}
                max={MAX_RADIUS_METERS}
              />
            </FormField>
            <FormField id={`${formId}-checkInRadius`} label="Check-in Radius (m)" error={errors.checkInRadius}>
              <Input
                {...field('checkInRadius')}
                onChange={(event) => set('checkInRadius', event.target.value)}
                type="number"
                min={1}
                max={MAX_CHECK_IN_RADIUS_METERS}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <FormField id={`${formId}-startsAt`} label="Starts (optional)" error={errors.startsAt}>
              <Input
                {...field('startsAt')}
                onChange={(event) => set('startsAt', event.target.value)}
                type="datetime-local"
              />
            </FormField>
            <FormField id={`${formId}-endsAt`} label="Ends (optional)" error={errors.endsAt}>
              <Input
                {...field('endsAt')}
                onChange={(event) => set('endsAt', event.target.value)}
                type="datetime-local"
              />
            </FormField>
          </div>

          <FormField id={`${formId}-maxCapacity`} label="Capacity (optional)" error={errors.maxCapacity}>
            <Input
              {...field('maxCapacity')}
              onChange={(event) => set('maxCapacity', event.target.value)}
              type="number"
              min={1}
              step={1}
              placeholder="No limit"
            />
          </FormField>

          <FormField id={`${formId}-rules`} label="Rules (optional)" error={errors.rules}>
            <Textarea {...field('rules')} onChange={(event) => set('rules', event.target.value)} maxLength={5000} />
          </FormField>

          <FormField id={`${formId}-tags`} label="Tags (optional, comma separated)" error={errors.tags}>
            <Input
              {...field('tags')}
              onChange={(event) => set('tags', event.target.value)}
              placeholder="jordan, queue"
            />
          </FormField>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Switch
                id={`${formId}-isPublic`}
                checked={form.isPublic}
                onCheckedChange={(checked) => set('isPublic', checked)}
                aria-describedby={`${formId}-isPublic-hint`}
              />
              <Label htmlFor={`${formId}-isPublic`}>Public zone</Label>
            </div>
            <p id={`${formId}-isPublic-hint`} className="text-xs text-muted-foreground">
              A private zone is hidden from everyone but its members, and nobody else can join it.
            </p>
          </div>

          {create.isError && (
            <p role="alert" className="text-sm text-destructive">
              Could not create the drop zone: {create.error.message}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create Zone'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function DropzonesPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<ZoneFilter>('active');
  const [selectedZone, setSelectedZone] = useState<DropZone | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The API does not say whether the caller is a member, so only what was learned here is remembered:
  // a join that succeeded, or one the API refused with "Already a member".
  const [joinedIds, setJoinedIds] = useState<readonly string[]>([]);
  const now = useNow();

  const activeFilter = FILTERS.find((option) => option.value === filter) ?? FILTERS[0];

  const zonesQuery = useInfiniteQuery({
    queryKey: [...ZONES_KEY, 'list', filter],
    queryFn: ({ pageParam }) =>
      DropZonesAPI.list({ active: activeFilter.active, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    // The API returns a bare array, so a full page is the only sign that more may follow.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined,
    refetchInterval: 60000,
  });

  const zones = useMemo(() => {
    // Offsets shift when zones are created between page loads; never show a zone twice.
    const byId = new Map<string, DropZone>();
    for (const zone of zonesQuery.data?.pages.flat() ?? []) {
      if (!byId.has(zone.id)) byId.set(zone.id, zone);
    }
    return [...byId.values()];
  }, [zonesQuery.data]);

  const handleCreated = (zone: DropZone) => {
    const status = currentStatus(zone, Date.now());
    setCreateOpen(false);
    setNotice(`Drop zone "${zone.name}" was created and is ${status}.`);
    // Keep the new zone on screen. "Active" lists zones that are active and inside their time
    // window, "Not active" lists every status other than active, and a zone created with a
    // window that is already over is in neither. (An updater, so a late answer sees the filter
    // chosen by then.)
    setFilter((current) => {
      if (current === 'active') return status === 'active' ? current : 'all';
      if (current === 'inactive') return zone.status !== 'active' ? current : 'all';
      return current;
    });
  };

  // A failed "Load more" leaves the loaded zones in place; it is reported next to that button.
  const loadMoreFailed = zonesQuery.isFetchNextPageError;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-6 w-6" aria-hidden="true" />
          <h1 className="text-2xl font-bold">Drop Zones</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
          Create Zone
        </Button>
      </div>

      {notice && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-md border border-green-600/40 bg-green-500/10 p-3 text-sm"
        >
          <span>{notice}</span>
          <Button size="icon-sm" variant="ghost" aria-label="Dismiss message" onClick={() => setNotice(null)}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      <div role="group" aria-label="Filter drop zones" className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={filter === option.value ? 'default' : 'outline'}
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {/* Zone List */}
      {zonesQuery.isPending ? (
        <div role="status" aria-label="Loading drop zones" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-48 w-full" />
          ))}
        </div>
      ) : (
        <>
          {zonesQuery.isError && !loadMoreFailed && (
            <ErrorNotice
              title={zonesQuery.data ? 'Could not refresh drop zones' : 'Could not load drop zones'}
              error={zonesQuery.error}
              onRetry={() => void zonesQuery.refetch()}
              retrying={zonesQuery.isFetching}
            />
          )}

          {zonesQuery.data && zones.length === 0 && (
            <Card className="py-12">
              <CardContent className="text-center">
                <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-lg font-semibold mb-2">{activeFilter.emptyTitle}</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Create a drop zone to get people gathering.
                </p>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                  Create a Zone
                </Button>
              </CardContent>
            </Card>
          )}

          {zones.length > 0 && (
            <ul aria-label="Drop zones" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {zones.map((zone) => (
                <li key={zone.id}>
                  <Card className="h-full hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg">{zone.name}</CardTitle>
                        <StatusBadge status={currentStatus(zone, now)} />
                      </div>
                      {zone.description && <CardDescription>{zone.description}</CardDescription>}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4" aria-hidden="true" />
                          <span>{plural(zone.member_count, 'member')}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Target className="h-4 w-4" aria-hidden="true" />
                          <span>{plural(zone.check_in_count, 'check-in')}</span>
                        </div>
                      </div>

                      {zone.starts_at && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" aria-hidden="true" />
                          <span>Starts: {formatDate(zone.starts_at)}</span>
                        </div>
                      )}
                      {zone.ends_at && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" aria-hidden="true" />
                          <span>Ends: {formatDate(zone.ends_at)}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2">
                        <div className="text-xs text-muted-foreground">
                          {formatDistance(zone.radius_meters)} radius
                          {zone.owner_id === user?.user_id ? ' · Your zone' : ''}
                        </div>
                        <Button
                          size="sm"
                          aria-label={`View details for ${zone.name}`}
                          onClick={() => setSelectedZone(zone)}
                        >
                          View Details
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          {zonesQuery.isError && loadMoreFailed && (
            <ErrorNotice
              title="Could not load more drop zones"
              error={zonesQuery.error}
              onRetry={() => void zonesQuery.fetchNextPage()}
              retrying={zonesQuery.isFetchingNextPage}
            />
          )}

          {zonesQuery.hasNextPage && !loadMoreFailed && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => void zonesQuery.fetchNextPage()}
                disabled={zonesQuery.isFetchingNextPage}
              >
                {zonesQuery.isFetchingNextPage ? 'Loading more…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}

      <CreateZoneDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={handleCreated} />

      {selectedZone && (
        <ZoneDetailsDialog
          key={selectedZone.id}
          zone={selectedZone}
          currentUserId={user?.user_id}
          joined={joinedIds.includes(selectedZone.id)}
          now={now}
          onJoined={(zoneId) => setJoinedIds((previous) => (previous.includes(zoneId) ? previous : [...previous, zoneId]))}
          onClose={() => setSelectedZone(null)}
        />
      )}
    </div>
  );
}
