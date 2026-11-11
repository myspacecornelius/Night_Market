import { StrictMode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import DropzonesPage from '../app/routes/dropzones';
import { DropZonesAPI, DropZonesApiError } from '@/lib/api/dropzones';
import type { CheckInResponse, DropZone, DropZoneDetails, ListDropZonesParams } from '@/lib/api/dropzones';
import { clearTokens, storeTokens } from '@/lib/auth-tokens';
import { renderWithProviders } from './test-utils';

// Only the network calls are replaced; the error class and the types stay the real ones.
vi.mock('@/lib/api/dropzones', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/dropzones')>();
  return {
    ...actual,
    DropZonesAPI: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      join: vi.fn(),
      checkIn: vi.fn(),
    },
  };
});

const api = vi.mocked(DropZonesAPI);

/** The signed-in user that renderWithProviders supplies. */
const ME = '00000000-0000-0000-0000-000000000000';
const SOMEONE_ELSE = '851aa5bf-d38a-453d-85b1-ab940d26ebcd';
const ZONE_ID = 'f1237878-3ded-4b98-a462-9a9c036f54ed';

function zone(overrides: Partial<DropZone> = {}): DropZone {
  return {
    id: ZONE_ID,
    name: 'Newbury Queue',
    description: 'Line-up for the Saturday release',
    owner_id: SOMEONE_ELSE,
    center_lat: 42.3601,
    center_lng: -71.0589,
    radius_meters: 120,
    status: 'active',
    starts_at: null,
    ends_at: null,
    member_count: 7,
    check_in_count: 23,
    created_at: '2026-11-11T01:11:11.571745Z',
    ...overrides,
  };
}

function details(overrides: Partial<DropZoneDetails> = {}): DropZoneDetails {
  return {
    id: ZONE_ID,
    name: 'Newbury Queue',
    description: 'Line-up for the Saturday release',
    owner_id: SOMEONE_ELSE,
    center_lat: 42.3601,
    center_lng: -71.0589,
    radius_meters: 120,
    check_in_radius: 45,
    status: 'active',
    starts_at: null,
    ends_at: null,
    rules: 'Be kind. No line cutting.',
    tags: ['jordan', 'queue'],
    is_public: true,
    created_at: '2026-11-11T01:11:11.571745+00:00',
    // Deliberately not the list's 7 members / 23 check-ins: the dialog must show these.
    stats: { member_count: 9, total_checkins: 31, today_checkins: 4 },
    recent_checkins: [
      {
        id: '06690578-eb36-42c5-b270-e86f5645b091',
        user_id: SOMEONE_ELSE,
        message: 'made it before the rain',
        streak_count: 3,
        points_earned: 14,
        checked_in_at: '2026-11-11T01:11:11.766116+00:00',
      },
      {
        id: 'df20b75e-3bc9-4a14-afa5-ccd26450bb70',
        user_id: ME,
        message: null,
        streak_count: 1,
        points_earned: 10,
        checked_in_at: '2026-11-10T09:00:00+00:00',
      },
    ],
    ...overrides,
  };
}

const checkInResult: CheckInResponse = {
  success: true,
  check_in_id: '9a0f5c1e-4a53-4b7e-8f5e-0d9f6c7f2b11',
  distance_from_center: 3.4,
  streak_count: 3,
  points_earned: 14,
  laces_balance: 124,
  message: 'Successfully checked in! Streak: 3. Points: 14',
};

/** A window that closed long ago, and one that has not opened yet. */
const OVER = { starts_at: '2020-01-01T10:00:00Z', ends_at: '2020-01-02T10:00:00Z' };
const AHEAD = { starts_at: '2099-01-01T10:00:00Z', ends_at: '2099-01-02T10:00:00Z' };

type Locator = (
  onSuccess: PositionCallback,
  onError?: PositionErrorCallback | null,
  options?: PositionOptions,
) => void;

const locatedAt =
  (latitude: number, longitude: number): Locator =>
  (onSuccess) =>
    onSuccess({ coords: { latitude, longitude, accuracy: 5 } } as GeolocationPosition);

const locationFailure =
  (code: number): Locator =>
  (_onSuccess, onError) =>
    onError?.({ code, message: '' } as GeolocationPositionError);

/** jsdom has no navigator.geolocation; give it one that answers the way a browser would. */
function stubGeolocation(locator: Locator) {
  const getCurrentPosition = vi.fn(locator);
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
  return getCurrentPosition;
}

/** Stands in for another page that has data cached under `queryKey` while this one is open. */
function CachedElsewhere({ queryKey, read }: { queryKey: readonly unknown[]; read: () => Promise<number> }) {
  useQuery({ queryKey, queryFn: read });
  return null;
}

function card(name: string) {
  const items = within(screen.getByRole('list', { name: 'Drop zones' })).getAllByRole('listitem');
  const match = items.find((item) => within(item).queryByRole('heading', { name }));
  if (!match) throw new Error(`No drop zone card named ${name}`);
  return within(match);
}

async function openDetails(name = 'Newbury Queue') {
  fireEvent.click(await screen.findByRole('button', { name: `View details for ${name}` }));
  return within(await screen.findByRole('dialog', { name: new RegExp(name) }));
}

async function openCheckIn() {
  const dialog = await openDetails();
  fireEvent.click(await dialog.findByRole('button', { name: 'Check In' }));
  return dialog;
}

async function openCreateDialog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Create Zone' }));
  return within(await screen.findByRole('dialog', { name: 'Create Drop Zone' }));
}

function fill(scope: ReturnType<typeof within>, label: string, value: string) {
  fireEvent.change(scope.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
});

describe('Dropzones page: list', () => {
  it('lists the zones the API returns with their own counts', async () => {
    api.list.mockResolvedValue([
      zone(),
      zone({
        id: 'b2a1c7de-0000-4000-8000-000000000002',
        name: 'Seaport Popup',
        description: null,
        owner_id: ME,
        radius_meters: 2500,
        status: 'scheduled',
        starts_at: '2099-11-12T15:00:00Z',
        member_count: 1,
        check_in_count: 0,
      }),
    ]);

    renderWithProviders(<DropzonesPage />);
    expect(screen.getByRole('status', { name: 'Loading drop zones' })).toBeInTheDocument();

    await screen.findByRole('heading', { name: 'Newbury Queue' });
    expect(screen.queryByRole('status', { name: 'Loading drop zones' })).not.toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith({ active: true, limit: 24, offset: 0 });

    const newbury = card('Newbury Queue');
    expect(newbury.getByText('Line-up for the Saturday release')).toBeInTheDocument();
    expect(newbury.getByText('7 members')).toBeInTheDocument();
    expect(newbury.getByText('23 check-ins')).toBeInTheDocument();
    expect(newbury.getByText('120 m radius')).toBeInTheDocument();
    expect(newbury.getByText('active')).toBeInTheDocument();

    const seaport = card('Seaport Popup');
    expect(seaport.getByText('1 member')).toBeInTheDocument();
    expect(seaport.getByText('0 check-ins')).toBeInTheDocument();
    expect(seaport.getByText('2.5 km radius · Your zone')).toBeInTheDocument();
    expect(seaport.getByText('scheduled')).toBeInTheDocument();
    expect(
      seaport.getByText(`Starts: ${new Date('2099-11-12T15:00:00Z').toLocaleString()}`),
    ).toBeInTheDocument();

    // A page shorter than the page size means there is nothing more to load.
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('shows an empty state when the API has no zones', async () => {
    api.list.mockResolvedValue([]);

    renderWithProviders(<DropzonesPage />);

    expect(await screen.findByRole('heading', { name: 'No active drop zones' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Drop zones' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a Zone' })).toBeInTheDocument();
  });

  it('shows the API error and loads the zones on retry', async () => {
    api.list
      .mockRejectedValueOnce(new DropZonesApiError(429, 'Rate limit exceeded. Try again in 12 seconds.'))
      .mockResolvedValueOnce([zone()]);

    renderWithProviders(<DropzonesPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load drop zones');
    expect(alert).toHaveTextContent('Rate limit exceeded. Try again in 12 seconds.');
    expect(screen.queryByRole('list', { name: 'Drop zones' })).not.toBeInTheDocument();

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'Newbury Queue' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('asks the API for the chosen filter', async () => {
    const later = zone({ id: 'c3a1c7de-0000-4000-8000-000000000003', name: 'Later Zone', status: 'scheduled' });
    api.list.mockImplementation(async (params?: ListDropZonesParams) => {
      if (params?.active === true) return [zone()];
      if (params?.active === false) return [later];
      return [zone(), later];
    });

    renderWithProviders(<DropzonesPage />);
    await screen.findByRole('heading', { name: 'Newbury Queue' });
    expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Not active' }));
    expect(await screen.findByRole('heading', { name: 'Later Zone' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Newbury Queue' })).not.toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith({ active: false, limit: 24, offset: 0 });
    expect(card('Later Zone').getByText('scheduled')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2));
    expect(api.list.mock.lastCall?.[0]?.active).toBeUndefined();
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('loads the next page from the right offset', async () => {
    const firstPage = Array.from({ length: 24 }, (_, index) =>
      zone({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, name: `Zone ${index + 1}` }),
    );
    const lastZone = zone({ id: 'd4a1c7de-0000-4000-8000-000000000004', name: 'Final Zone' });
    api.list.mockImplementation(async (params?: ListDropZonesParams) =>
      params?.offset === 24 ? [lastZone] : firstPage,
    );

    renderWithProviders(<DropzonesPage />);
    await screen.findByRole('heading', { name: 'Zone 24' });
    expect(screen.queryByRole('heading', { name: 'Final Zone' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('heading', { name: 'Final Zone' })).toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith({ active: true, limit: 24, offset: 24 });
    expect(screen.getByRole('heading', { name: 'Zone 1' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument());
  });

  it('keeps the loaded zones when the next page fails and retries that page', async () => {
    const firstPage = Array.from({ length: 24 }, (_, index) =>
      zone({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, name: `Zone ${index + 1}` }),
    );
    const lastZone = zone({ id: 'd4a1c7de-0000-4000-8000-000000000004', name: 'Final Zone' });
    let nextPageAttempts = 0;
    api.list.mockImplementation(async (params?: ListDropZonesParams) => {
      if (params?.offset !== 24) return firstPage;
      nextPageAttempts += 1;
      if (nextPageAttempts === 1) throw new DropZonesApiError(429, 'Rate limit exceeded. Try again in 3 seconds.');
      return [lastZone];
    });

    renderWithProviders(<DropzonesPage />);
    await screen.findByRole('heading', { name: 'Zone 24' });
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load more drop zones');
    expect(alert).toHaveTextContent('Rate limit exceeded. Try again in 3 seconds.');
    expect(screen.getByRole('heading', { name: 'Zone 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Zone 24' })).toBeInTheDocument();

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'Final Zone' })).toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith({ active: true, limit: 24, offset: 24 });
    expect(nextPageAttempts).toBe(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Zone 1' })).toBeInTheDocument();
  });

  it('labels a zone by its time window, not only by the status the API stored at creation', async () => {
    // Nothing in the API moves `status` after creation: a zone whose end has passed still says "active".
    api.list.mockResolvedValue([
      zone({ id: 'a1a1c7de-0000-4000-8000-000000000001', name: 'Open Zone' }),
      zone({ id: 'a2a1c7de-0000-4000-8000-000000000002', name: 'Finished Zone', ...OVER }),
      zone({ id: 'a3a1c7de-0000-4000-8000-000000000003', name: 'Future Zone', ...AHEAD }),
      zone({ id: 'a4a1c7de-0000-4000-8000-000000000004', name: 'Called Off', status: 'cancelled', ...AHEAD }),
    ]);

    renderWithProviders(<DropzonesPage />);
    await screen.findByRole('heading', { name: 'Open Zone' });

    expect(card('Open Zone').getByText('active')).toBeInTheDocument();
    expect(card('Finished Zone').getByText('ended')).toBeInTheDocument();
    expect(card('Finished Zone').queryByText('active')).not.toBeInTheDocument();
    expect(card('Future Zone').getByText('scheduled')).toBeInTheDocument();
    expect(card('Called Off').getByText('cancelled')).toBeInTheDocument();
  });
});

describe('Dropzones page: zone details', () => {
  beforeEach(() => {
    api.list.mockResolvedValue([zone()]);
  });

  it('shows members, check-ins and recent check-ins from the details endpoint', async () => {
    api.get.mockResolvedValue(details());

    renderWithProviders(<DropzonesPage />);
    const dialog = await openDetails();

    expect(dialog.getByRole('status', { name: 'Loading drop zone details' })).toBeInTheDocument();
    expect(await dialog.findByRole('group', { name: 'Members' })).toHaveTextContent('9');
    expect(api.get).toHaveBeenCalledWith(ZONE_ID);
    expect(dialog.getByRole('group', { name: 'Total Check-ins' })).toHaveTextContent('31');
    expect(dialog.getByRole('group', { name: 'Today (UTC)' })).toHaveTextContent('4');
    expect(dialog.getByText('42.36010, -71.05890')).toBeInTheDocument();
    expect(dialog.getByText('120 m')).toBeInTheDocument();
    expect(dialog.getByText('45 m')).toBeInTheDocument();
    expect(dialog.getByText('Public')).toBeInTheDocument();
    expect(dialog.getByText('Be kind. No line cutting.')).toBeInTheDocument();

    const tags = within(dialog.getByRole('list', { name: 'Tags' })).getAllByRole('listitem');
    expect(tags.map((tag) => tag.textContent)).toEqual(['jordan', 'queue']);

    const recent = within(dialog.getByRole('list', { name: 'Recent check-ins' })).getAllByRole('listitem');
    expect(recent).toHaveLength(2);
    expect(recent[0]).toHaveTextContent('Member 851aa5bf');
    expect(recent[0]).toHaveTextContent('made it before the rain');
    expect(recent[0]).toHaveTextContent('Streak 3');
    expect(recent[0]).toHaveTextContent('+14 LACES');
    expect(recent[1]).toHaveTextContent('You');
    expect(recent[1]).toHaveTextContent('Streak 1');
    expect(recent[1]).toHaveTextContent('+10 LACES');
  });

  it('shows an empty state for a zone nobody has checked in to', async () => {
    api.get.mockResolvedValue(
      details({
        rules: null,
        tags: null,
        is_public: false,
        stats: { member_count: 1, total_checkins: 0, today_checkins: 0 },
        recent_checkins: [],
      }),
    );

    renderWithProviders(<DropzonesPage />);
    const dialog = await openDetails();

    expect(await dialog.findByText('No check-ins yet.')).toBeInTheDocument();
    expect(dialog.queryByRole('list', { name: 'Recent check-ins' })).not.toBeInTheDocument();
    expect(dialog.queryByRole('list', { name: 'Tags' })).not.toBeInTheDocument();
    expect(dialog.queryByText(/Rules/)).not.toBeInTheDocument();
    expect(dialog.getByText('Private')).toBeInTheDocument();
    expect(dialog.getByRole('group', { name: 'Total Check-ins' })).toHaveTextContent('0');

    // Only members can read a private zone, so there is nothing to join.
    expect(dialog.getByText('You are a member of this private zone; only its members can see it.')).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Join Zone' })).not.toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Check In' })).toBeEnabled();
  });

  it('reports an unknown zone and recovers on retry', async () => {
    api.get.mockRejectedValueOnce(new DropZonesApiError(404, 'Dropzone not found')).mockResolvedValueOnce(details());

    renderWithProviders(<DropzonesPage />);
    const dialog = await openDetails();

    const alert = await dialog.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load this drop zone');
    expect(alert).toHaveTextContent('Dropzone not found');
    expect(dialog.queryByRole('group', { name: 'Members' })).not.toBeInTheDocument();

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await dialog.findByRole('group', { name: 'Members' })).toHaveTextContent('9');
    expect(dialog.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('joins the zone and shows the refreshed member count', async () => {
    api.list.mockReset();
    api.list.mockResolvedValueOnce([zone()]).mockResolvedValue([zone({ member_count: 8 })]);
    api.get
      .mockResolvedValueOnce(details())
      .mockResolvedValue(details({ stats: { member_count: 10, total_checkins: 31, today_checkins: 4 } }));
    api.join.mockResolvedValue({ success: true, message: 'Successfully joined dropzone' });

    renderWithProviders(<DropzonesPage />);
    const dialog = await openDetails();
    fireEvent.click(await dialog.findByRole('button', { name: 'Join Zone' }));

    expect(await dialog.findByRole('status')).toHaveTextContent('Successfully joined dropzone');
    expect(api.join).toHaveBeenCalledTimes(1);
    expect(api.join).toHaveBeenCalledWith(ZONE_ID);
    await waitFor(() => expect(dialog.getByRole('group', { name: 'Members' })).toHaveTextContent('10'));
    expect(dialog.getByRole('button', { name: 'Joined' })).toBeDisabled();
    // The card behind the dialog is refreshed from the list endpoint as well.
    expect(await screen.findByText('8 members')).toBeInTheDocument();
  });

  it.each([
    [409, 'Dropzone is at capacity'],
    [404, 'Dropzone not found'],
    [429, 'Rate limit exceeded. Try again in 12 seconds.'],
  ])('explains a rejected join (%i %s)', async (status, detail) => {
    api.get.mockResolvedValue(details());
    api.join.mockRejectedValue(new DropZonesApiError(status, detail));

    renderWithProviders(<DropzonesPage />);
    const dialog = await openDetails();
    fireEvent.click(await dialog.findByRole('button', { name: 'Join Zone' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent(`Could not join: ${detail}`);
    expect(dialog.queryByRole('status')).not.toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Join Zone' })).toBeEnabled();
    expect(dialog.getByRole('group', { name: 'Members' })).toHaveTextContent('9');
  });

  it('stops offering to join once the API says the user is already a member', async () => {
    api.get.mockResolvedValue(details());
    api.join.mockRejectedValue(new DropZonesApiError(400, 'Already a member'));

    renderWithProviders(<DropzonesPage />);
    const dialog = await openDetails();
    fireEvent.click(await dialog.findByRole('button', { name: 'Join Zone' }));

    expect(await dialog.findByRole('status')).toHaveTextContent('You are already a member of this zone.');
    expect(dialog.queryByRole('alert')).not.toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Joined' })).toBeDisabled();
    expect(dialog.queryByRole('button', { name: 'Join Zone' })).not.toBeInTheDocument();
    expect(api.join).toHaveBeenCalledTimes(1);

    // The page remembers it for as long as it is open.
    fireEvent.click(dialog.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const reopened = await openDetails();
    expect(await reopened.findByRole('button', { name: 'Joined' })).toBeDisabled();
  });

  it('does not offer to join a zone the user owns', async () => {
    api.list.mockResolvedValue([zone({ owner_id: ME })]);
    api.get.mockResolvedValue(details({ owner_id: ME }));

    renderWithProviders(<DropzonesPage />);
    const dialog = await openDetails();

    expect(await dialog.findByText('You own this zone and are already a member.')).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Join Zone' })).not.toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Check In' })).toBeEnabled();
  });
});

describe('Dropzones page: check-in', () => {
  beforeEach(() => {
    api.list.mockResolvedValue([zone()]);
    api.get.mockResolvedValue(details());
  });

  it('sends the browser location and shows the points, streak and balance the API returns', async () => {
    const getCurrentPosition = stubGeolocation(locatedAt(42.36012, -71.05893));
    api.list.mockReset();
    api.list.mockResolvedValueOnce([zone()]).mockResolvedValue([zone({ check_in_count: 24 })]);
    api.get.mockReset();
    api.get
      .mockResolvedValueOnce(details())
      .mockResolvedValue(details({ stats: { member_count: 9, total_checkins: 32, today_checkins: 5 } }));
    api.checkIn.mockResolvedValue(checkInResult);

    renderWithProviders(<DropzonesPage />);
    const dialog = await openCheckIn();

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(await dialog.findByText(/Location found \(42\.36012, -71\.05893\)/)).toBeInTheDocument();
    expect(dialog.getByText(/inside the check-in radius/)).toBeInTheDocument();

    fill(dialog, 'Message (optional)', '  first in line  ');
    fireEvent.click(dialog.getByRole('button', { name: 'Confirm check-in' }));

    const result = await dialog.findByText('Checked in to Newbury Queue');
    const status = result.closest('[role="status"]');
    expect(status).toHaveTextContent('+14 LACES earned');
    expect(status).toHaveTextContent('Streak: 3 days');
    expect(status).toHaveTextContent('Balance: 124 LACES');
    expect(status).toHaveTextContent('Successfully checked in! Streak: 3. Points: 14');
    expect(status).toHaveTextContent('Recorded 3 m from the zone center.');

    expect(api.checkIn).toHaveBeenCalledTimes(1);
    expect(api.checkIn.mock.calls[0]).toStrictEqual([
      ZONE_ID,
      { lat: 42.36012, lng: -71.05893, message: 'first in line' },
    ]);

    // The zone is fetched again, so the counters reflect the new check-in.
    await waitFor(() => expect(dialog.getByRole('group', { name: 'Today (UTC)' })).toHaveTextContent('5'));
    expect(dialog.getByRole('group', { name: 'Total Check-ins' })).toHaveTextContent('32');
    // ...and so does the card behind the dialog, from the list endpoint.
    expect(await screen.findByText('24 check-ins')).toBeInTheDocument();

    fireEvent.click(dialog.getByRole('button', { name: 'Done' }));
    expect(dialog.getByRole('button', { name: 'Check In' })).toBeInTheDocument();
  });

  it('leaves the message out of the request when none was typed', async () => {
    stubGeolocation(locatedAt(42.3601, -71.0589));
    api.checkIn.mockResolvedValue({ ...checkInResult, streak_count: 1, points_earned: 10, laces_balance: 110 });

    renderWithProviders(<DropzonesPage />);
    const dialog = await openCheckIn();
    fireEvent.click(await dialog.findByRole('button', { name: 'Confirm check-in' }));

    const result = await dialog.findByText('Checked in to Newbury Queue');
    expect(result.closest('[role="status"]')).toHaveTextContent(
      '+10 LACES earned · Streak: 1 day · Balance: 110 LACES',
    );
    expect(api.checkIn.mock.calls[0]).toStrictEqual([ZONE_ID, { lat: 42.3601, lng: -71.0589 }]);
  });

  it('has the other pages read their balance and check-in numbers again after a check-in', async () => {
    stubGeolocation(locatedAt(42.3601, -71.0589));
    api.checkIn.mockResolvedValue(checkInResult);
    // The keys laces.tsx, useAuth, dashboard.tsx, profile.tsx and leaderboard.tsx cache under.
    const elsewhere = [
      ['laces', 'balance'],
      ['currentUser'],
      ['dashboard', 'metrics'],
      ['profile', 'stats'],
      ['leaderboard', 'checkins', 10],
    ].map((queryKey) => ({ queryKey, read: vi.fn(async () => 1) }));
    const unrelated = { queryKey: ['heatmap', 'bins'], read: vi.fn(async () => 1) };

    renderWithProviders(
      <>
        <DropzonesPage />
        {[...elsewhere, unrelated].map((entry) => (
          <CachedElsewhere key={entry.queryKey.join('/')} {...entry} />
        ))}
      </>,
    );
    const dialog = await openCheckIn();
    await waitFor(() => elsewhere.forEach((entry) => expect(entry.read).toHaveBeenCalledTimes(1)));

    fireEvent.click(await dialog.findByRole('button', { name: 'Confirm check-in' }));
    await dialog.findByText('Checked in to Newbury Queue');

    await waitFor(() => elsewhere.forEach((entry) => expect(entry.read).toHaveBeenCalledTimes(2)));
    expect(unrelated.read).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['at the owner\'s own zone', 'Successfully checked in! Streak: 1. No LACES for checking in at your own dropzone.'],
    ['past the daily limit', 'Successfully checked in! Streak: 2. Daily limit of 3 rewarded check-ins reached.'],
  ])('says why a check-in paid nothing (%s)', async (_case, message) => {
    stubGeolocation(locatedAt(42.3601, -71.0589));
    api.checkIn.mockResolvedValue({ ...checkInResult, points_earned: 0, laces_balance: 100, message });

    renderWithProviders(<DropzonesPage />);
    const dialog = await openCheckIn();
    fireEvent.click(await dialog.findByRole('button', { name: 'Confirm check-in' }));

    const status = (await dialog.findByText('Checked in to Newbury Queue')).closest('[role="status"]');
    expect(status).toHaveTextContent('No LACES earned');
    expect(status).not.toHaveTextContent('+0 LACES');
    expect(status).toHaveTextContent('Balance: 100 LACES');
    expect(status).toHaveTextContent(message);
  });

  it.each([
    [400, 'Too far from dropzone. Distance: 1100.8m, Required: 45.0m'],
    [400, 'Already checked in today'],
    [400, 'Dropzone is not active'],
    [400, 'Dropzone has not started yet'],
    [400, 'Dropzone has ended'],
    [409, 'Dropzone is at capacity'],
    [404, 'Dropzone not found'],
    [422, 'lat: Input should be less than or equal to 90'],
  ])('explains a rejected check-in (%i %s)', async (status, detail) => {
    stubGeolocation(locatedAt(42.37, -71.0589));
    api.checkIn.mockRejectedValue(new DropZonesApiError(status, detail));

    renderWithProviders(<DropzonesPage />);
    const dialog = await openCheckIn();

    // The local estimate warns, but the API decides.
    expect(await dialog.findByText(/outside the 45 m check-in radius/)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Confirm check-in' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent(`Check-in failed: ${detail}`);
    expect(api.checkIn).toHaveBeenCalledWith(ZONE_ID, { lat: 42.37, lng: -71.0589 });
    expect(dialog.queryByText('Checked in to Newbury Queue')).not.toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Confirm check-in' })).toBeEnabled();
  });

  it('cannot check in until the browser shares a location', async () => {
    const getCurrentPosition = stubGeolocation(locationFailure(1));

    renderWithProviders(<DropzonesPage />);
    const dialog = await openCheckIn();

    expect(await dialog.findByRole('alert')).toHaveTextContent('Location permission was denied');
    expect(dialog.getByRole('button', { name: 'Confirm check-in' })).toBeDisabled();

    getCurrentPosition.mockImplementation(locatedAt(42.3601, -71.0589));
    fireEvent.click(dialog.getByRole('button', { name: 'Try again' }));

    expect(await dialog.findByText(/Location found \(42\.36010, -71\.05890\)/)).toBeInTheDocument();
    expect(dialog.queryByRole('alert')).not.toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Confirm check-in' })).toBeEnabled();
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(api.checkIn).not.toHaveBeenCalled();
  });

  it('asks for a fresh position on "Update location" and checks in with it', async () => {
    const getCurrentPosition = stubGeolocation(locatedAt(42.37, -71.0589));
    api.checkIn.mockResolvedValue(checkInResult);

    renderWithProviders(<DropzonesPage />);
    const dialog = await openCheckIn();
    expect(await dialog.findByText(/outside the 45 m check-in radius/)).toBeInTheDocument();
    // Opening the panel may reuse a position the browser found a moment ago.
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ maximumAge: 60000 });

    // The user walks over and asks again: a cached position would still say "too far".
    getCurrentPosition.mockImplementation(locatedAt(42.36011, -71.05891));
    fireEvent.click(dialog.getByRole('button', { name: 'Update location' }));

    expect(await dialog.findByText(/inside the check-in radius/)).toBeInTheDocument();
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(getCurrentPosition.mock.calls[1][2]).toMatchObject({ maximumAge: 0 });

    fireEvent.click(dialog.getByRole('button', { name: 'Confirm check-in' }));
    await dialog.findByText('Checked in to Newbury Queue');
    expect(api.checkIn.mock.calls[0]).toStrictEqual([ZONE_ID, { lat: 42.36011, lng: -71.05891 }]);
  });

  it('checks in once under React strict mode and ignores the answer to the discarded first request', async () => {
    // Strict mode mounts, unmounts and remounts every component, so the panel asks for the position twice.
    const answers: PositionCallback[] = [];
    const getCurrentPosition = stubGeolocation((onSuccess) => answers.push(onSuccess));
    const position = (latitude: number, longitude: number) =>
      ({ coords: { latitude, longitude, accuracy: 5 } }) as GeolocationPosition;
    api.checkIn.mockResolvedValue(checkInResult);

    renderWithProviders(
      <StrictMode>
        <DropzonesPage />
      </StrictMode>,
    );
    const dialog = await openCheckIn();
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(2));

    act(() => answers[0](position(10, 20)));
    expect(dialog.getByText('Getting your location…')).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Confirm check-in' })).toBeDisabled();

    act(() => answers[1](position(42.3601, -71.0589)));
    expect(await dialog.findByText(/Location found \(42\.36010, -71\.05890\)/)).toBeInTheDocument();

    fireEvent.click(dialog.getByRole('button', { name: 'Confirm check-in' }));
    await dialog.findByText('Checked in to Newbury Queue');
    expect(api.checkIn).toHaveBeenCalledTimes(1);
    expect(api.checkIn).toHaveBeenCalledWith(ZONE_ID, { lat: 42.3601, lng: -71.0589 });
  });

  it('says so when the browser has no geolocation', async () => {
    renderWithProviders(<DropzonesPage />);
    const dialog = await openCheckIn();

    expect(await dialog.findByRole('alert')).toHaveTextContent('This browser cannot share its location.');
    expect(dialog.getByRole('button', { name: 'Confirm check-in' })).toBeDisabled();
  });

  it('keeps check-in closed for a zone that is not active', async () => {
    api.list.mockResolvedValue([zone({ status: 'scheduled', starts_at: '2099-01-01T10:00:00Z' })]);
    api.get.mockResolvedValue(details({ status: 'scheduled', starts_at: '2099-01-01T10:00:00Z' }));

    renderWithProviders(<DropzonesPage />);
    const dialog = await openDetails();

    expect(await dialog.findByRole('button', { name: 'Check In' })).toBeDisabled();
    expect(
      dialog.getByText('Check-ins are only open while a zone is active; this one is scheduled.'),
    ).toBeInTheDocument();
  });

  it('keeps check-in closed for an "active" zone whose time window is over', async () => {
    // The API would answer 400 "Dropzone has ended"; its status field still says "active".
    api.list.mockResolvedValue([zone(OVER)]);
    api.get.mockResolvedValue(details(OVER));

    renderWithProviders(<DropzonesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'View details for Newbury Queue' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Newbury Queue ended' }));

    const checkInButton = await dialog.findByRole('button', { name: 'Check In' });
    expect(checkInButton).toBeDisabled();
    expect(checkInButton).toHaveAccessibleDescription(
      `Check-ins closed when this zone ended on ${new Date(OVER.ends_at).toLocaleString()}.`,
    );
    // Joining is not tied to the window.
    expect(dialog.getByRole('button', { name: 'Join Zone' })).toBeEnabled();
  });

  it('keeps check-in closed for an "active" zone that has not started', async () => {
    // The API would answer 400 "Dropzone has not started yet".
    api.list.mockResolvedValue([zone(AHEAD)]);
    api.get.mockResolvedValue(details(AHEAD));

    renderWithProviders(<DropzonesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'View details for Newbury Queue' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Newbury Queue scheduled' }));

    expect(await dialog.findByRole('button', { name: 'Check In' })).toBeDisabled();
    expect(
      dialog.getByText(`Check-ins open when this zone starts on ${new Date(AHEAD.starts_at).toLocaleString()}.`),
    ).toBeInTheDocument();
  });
});

describe('Dropzones page: create', () => {
  it('creates a zone from the required fields and shows it in the list', async () => {
    const created = zone({
      id: 'e5a1c7de-0000-4000-8000-000000000005',
      name: 'Seaport Popup',
      description: null,
      owner_id: ME,
      center_lat: 42.3519,
      center_lng: -71.0446,
      radius_meters: 100,
      member_count: 1,
      check_in_count: 0,
    });
    api.list.mockResolvedValueOnce([]).mockResolvedValue([created]);
    api.create.mockResolvedValue(created);

    renderWithProviders(<DropzonesPage />);
    await screen.findByRole('heading', { name: 'No active drop zones' });

    const dialog = await openCreateDialog();
    fill(dialog, 'Zone Name', ' Seaport Popup ');
    fill(dialog, 'Latitude', '42.3519');
    fill(dialog, 'Longitude', '-71.0446');
    fireEvent.click(dialog.getByRole('button', { name: 'Create Zone' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.create).toHaveBeenCalledTimes(1);
    // Empty optional fields are left out: the API rejects "" for the dates.
    expect(api.create.mock.calls[0][0]).toStrictEqual({
      name: 'Seaport Popup',
      center_lat: 42.3519,
      center_lng: -71.0446,
      radius_meters: 100,
      check_in_radius: 50,
      is_public: true,
    });

    expect(screen.getByRole('status')).toHaveTextContent('Drop zone "Seaport Popup" was created and is active.');
    expect(await screen.findByRole('heading', { name: 'Seaport Popup' })).toBeInTheDocument();
    expect(card('Seaport Popup').getByText('1 member')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'No active drop zones' })).not.toBeInTheDocument();
  });

  it('sends every optional field and switches the filter so a scheduled zone is visible', async () => {
    const created = zone({
      id: 'f6a1c7de-0000-4000-8000-000000000006',
      name: 'Midnight Release',
      description: 'Doors at ten',
      owner_id: ME,
      status: 'scheduled',
      starts_at: new Date('2099-01-01T10:00').toISOString(),
      ends_at: new Date('2099-01-02T10:00').toISOString(),
      radius_meters: 250,
      member_count: 1,
      check_in_count: 0,
    });
    api.list.mockImplementation(async (params?: ListDropZonesParams) => (params?.active === true ? [] : [created]));
    api.create.mockResolvedValue(created);

    renderWithProviders(<DropzonesPage />);
    await screen.findByRole('heading', { name: 'No active drop zones' });

    const dialog = await openCreateDialog();
    fill(dialog, 'Zone Name', 'Midnight Release');
    fill(dialog, 'Description (optional)', 'Doors at ten');
    fill(dialog, 'Latitude', '40');
    fill(dialog, 'Longitude', '-70');
    fill(dialog, 'Zone Radius (m)', '250');
    fill(dialog, 'Check-in Radius (m)', '75');
    fill(dialog, 'Starts (optional)', '2099-01-01T10:00');
    fill(dialog, 'Ends (optional)', '2099-01-02T10:00');
    fill(dialog, 'Capacity (optional)', '40');
    fill(dialog, 'Rules (optional)', 'Be nice');
    fill(dialog, 'Tags (optional, comma separated)', 'jordan, queue, ');
    fireEvent.click(dialog.getByRole('switch', { name: 'Public zone' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Create Zone' }));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0][0]).toStrictEqual({
      name: 'Midnight Release',
      description: 'Doors at ten',
      center_lat: 40,
      center_lng: -70,
      radius_meters: 250,
      check_in_radius: 75,
      starts_at: new Date('2099-01-01T10:00').toISOString(),
      ends_at: new Date('2099-01-02T10:00').toISOString(),
      max_capacity: 40,
      rules: 'Be nice',
      tags: ['jordan', 'queue'],
      is_public: false,
    });

    expect(await screen.findByRole('heading', { name: 'Midnight Release' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Drop zone "Midnight Release" was created and is scheduled.');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(card('Midnight Release').getByText('scheduled')).toBeInTheDocument();
  });

  it('points out invalid input without calling the API', async () => {
    api.list.mockResolvedValue([]);

    renderWithProviders(<DropzonesPage />);
    const dialog = await openCreateDialog();

    fireEvent.click(dialog.getByRole('button', { name: 'Create Zone' }));
    expect(await dialog.findByText('Give the zone a name.')).toBeInTheDocument();
    expect(dialog.getByText('Latitude must be a number between -90 and 90.')).toBeInTheDocument();
    expect(dialog.getByText('Longitude must be a number between -180 and 180.')).toBeInTheDocument();
    expect(dialog.getByLabelText('Zone Name')).toHaveAttribute('aria-invalid', 'true');
    expect(dialog.getByLabelText('Zone Name')).toHaveAccessibleDescription('Give the zone a name.');
    // The first field with a problem takes the focus.
    expect(dialog.getByLabelText('Zone Name')).toHaveFocus();
    expect(dialog.getByLabelText('Zone Name')).toBeRequired();
    expect(dialog.getByLabelText('Latitude')).toBeRequired();
    expect(dialog.getByLabelText('Longitude')).toBeRequired();
    expect(dialog.getByLabelText('Description (optional)')).not.toBeRequired();

    fill(dialog, 'Zone Name', 'Bad Times');
    fill(dialog, 'Latitude', '91');
    fill(dialog, 'Longitude', '-70');
    fill(dialog, 'Starts (optional)', '2099-01-02T10:00');
    fill(dialog, 'Ends (optional)', '2099-01-01T10:00');
    fill(dialog, 'Capacity (optional)', '0');
    fireEvent.click(dialog.getByRole('button', { name: 'Create Zone' }));

    expect(await dialog.findByText('The end must be after the start.')).toBeInTheDocument();
    expect(dialog.getByText('Capacity must be a whole number of at least 1.')).toBeInTheDocument();
    expect(dialog.getByText('Latitude must be a number between -90 and 90.')).toBeInTheDocument();
    expect(dialog.queryByText('Give the zone a name.')).not.toBeInTheDocument();
    expect(dialog.getByLabelText('Latitude')).toHaveFocus();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('applies the API limits for the radii and the tags before sending', async () => {
    // DropZoneCreate: radius_meters <= 50000, check_in_radius <= 500, at most 20 tags of 1-50 characters.
    api.list.mockResolvedValue([]);
    api.create.mockResolvedValue(zone({ name: 'Edge Zone' }));

    renderWithProviders(<DropzonesPage />);
    const dialog = await openCreateDialog();
    fill(dialog, 'Zone Name', 'Edge Zone');
    fill(dialog, 'Latitude', '42.3519');
    fill(dialog, 'Longitude', '-71.0446');
    fill(dialog, 'Zone Radius (m)', '50001');
    fill(dialog, 'Check-in Radius (m)', '501');
    fill(dialog, 'Tags (optional, comma separated)', `ok, ${'x'.repeat(51)}`);
    fireEvent.click(dialog.getByRole('button', { name: 'Create Zone' }));

    expect(await dialog.findByText('Zone radius must be above 0 and at most 50000 meters.')).toBeInTheDocument();
    expect(dialog.getByText('Check-in radius must be above 0 and at most 500 meters.')).toBeInTheDocument();
    expect(dialog.getByText('Each tag can be at most 50 characters.')).toBeInTheDocument();
    expect(dialog.getByLabelText('Zone Radius (m)')).toHaveFocus();
    expect(api.create).not.toHaveBeenCalled();

    fill(dialog, 'Tags (optional, comma separated)', Array.from({ length: 21 }, (_, index) => `t${index}`).join(','));
    fireEvent.click(dialog.getByRole('button', { name: 'Create Zone' }));
    expect(await dialog.findByText('Use at most 20 tags.')).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();

    // The largest values the API accepts go through.
    fill(dialog, 'Zone Radius (m)', '50000');
    fill(dialog, 'Check-in Radius (m)', '500');
    fill(dialog, 'Tags (optional, comma separated)', `ok, ${'x'.repeat(50)}`);
    fireEvent.click(dialog.getByRole('button', { name: 'Create Zone' }));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0][0]).toStrictEqual({
      name: 'Edge Zone',
      center_lat: 42.3519,
      center_lng: -71.0446,
      radius_meters: 50000,
      check_in_radius: 500,
      tags: ['ok', 'x'.repeat(50)],
      is_public: true,
    });
  });

  it('keeps the form open and shows what the API rejected', async () => {
    api.list.mockResolvedValue([]);
    api.create.mockRejectedValue(new DropZonesApiError(422, 'ends_at must be after starts_at'));

    renderWithProviders(<DropzonesPage />);
    const dialog = await openCreateDialog();
    fill(dialog, 'Zone Name', 'Seaport Popup');
    fill(dialog, 'Latitude', '42.3519');
    fill(dialog, 'Longitude', '-71.0446');
    fireEvent.click(dialog.getByRole('button', { name: 'Create Zone' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Could not create the drop zone: ends_at must be after starts_at',
    );
    expect(dialog.getByLabelText('Zone Name')).toHaveValue('Seaport Popup');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('reports the daily creation limit and lets the user try again', async () => {
    const created = zone({ id: 'e7a1c7de-0000-4000-8000-000000000007', name: 'Seaport Popup', owner_id: ME });
    api.list.mockResolvedValueOnce([]).mockResolvedValue([created]);
    api.create
      .mockRejectedValueOnce(new DropZonesApiError(429, 'You can create at most 5 dropzones per day'))
      .mockResolvedValueOnce(created);

    renderWithProviders(<DropzonesPage />);
    const dialog = await openCreateDialog();
    fill(dialog, 'Zone Name', 'Seaport Popup');
    fill(dialog, 'Latitude', '42.3519');
    fill(dialog, 'Longitude', '-71.0446');
    fireEvent.click(dialog.getByRole('button', { name: 'Create Zone' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Could not create the drop zone: You can create at most 5 dropzones per day',
    );
    expect(dialog.getByRole('button', { name: 'Create Zone' })).toBeEnabled();

    fireEvent.click(dialog.getByRole('button', { name: 'Create Zone' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.create).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('heading', { name: 'Seaport Popup' })).toBeInTheDocument();

    // A new form starts clean: neither the old values nor the old error come back.
    const reopened = await openCreateDialog();
    expect(reopened.getByLabelText('Zone Name')).toHaveValue('');
    expect(reopened.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('switches to "All" for a new zone whose window is already over, which neither other filter lists', async () => {
    // The API stores it as "active", but its active filter leaves it out and so does "not active".
    const created = zone({ id: 'e8a1c7de-0000-4000-8000-000000000008', name: 'Yesterday', owner_id: ME, ...OVER });
    api.list.mockImplementation(async (params?: ListDropZonesParams) =>
      params?.active === undefined ? [created] : [],
    );
    api.create.mockResolvedValue(created);

    renderWithProviders(<DropzonesPage />);
    await screen.findByRole('heading', { name: 'No active drop zones' });

    const dialog = await openCreateDialog();
    fill(dialog, 'Zone Name', 'Yesterday');
    fill(dialog, 'Latitude', '42.3519');
    fill(dialog, 'Longitude', '-71.0446');
    fill(dialog, 'Starts (optional)', '2020-01-01T10:00');
    fill(dialog, 'Ends (optional)', '2020-01-02T10:00');
    fireEvent.click(dialog.getByRole('button', { name: 'Create Zone' }));

    expect(await screen.findByRole('heading', { name: 'Yesterday' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Drop zone "Yesterday" was created and is ended.');
    expect(card('Yesterday').getByText('ended')).toBeInTheDocument();
    expect(api.create.mock.calls[0][0]).toMatchObject({
      starts_at: new Date('2020-01-01T10:00').toISOString(),
      ends_at: new Date('2020-01-02T10:00').toISOString(),
    });
  });

  it('fills the coordinates from the browser location', async () => {
    stubGeolocation(locatedAt(40.712776, -74.005974));
    api.list.mockResolvedValue([]);

    renderWithProviders(<DropzonesPage />);
    const dialog = await openCreateDialog();
    fireEvent.click(dialog.getByRole('button', { name: 'Create Zone' }));
    expect(await dialog.findByText('Latitude must be a number between -90 and 90.')).toBeInTheDocument();

    fireEvent.click(dialog.getByRole('button', { name: 'Use my current location' }));

    expect(dialog.getByLabelText('Latitude')).toHaveValue('40.712776');
    expect(dialog.getByLabelText('Longitude')).toHaveValue('-74.005974');
    // The complaints about the empty coordinates go; the one about the name stays.
    expect(dialog.queryByText('Latitude must be a number between -90 and 90.')).not.toBeInTheDocument();
    expect(dialog.queryByText('Longitude must be a number between -180 and 180.')).not.toBeInTheDocument();
    expect(dialog.getByLabelText('Latitude')).not.toHaveAttribute('aria-invalid');
    expect(dialog.getByText('Give the zone a name.')).toBeInTheDocument();
  });

  it('says why the coordinates could not be filled in and recovers on a second try', async () => {
    const getCurrentPosition = stubGeolocation(locationFailure(3));
    api.list.mockResolvedValue([]);

    renderWithProviders(<DropzonesPage />);
    const dialog = await openCreateDialog();
    fireEvent.click(dialog.getByRole('button', { name: 'Use my current location' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent('Finding your location took too long. Try again.');
    expect(dialog.getByLabelText('Latitude')).toHaveValue('');
    expect(dialog.getByRole('button', { name: 'Use my current location' })).toBeEnabled();

    getCurrentPosition.mockImplementation(locatedAt(40.712776, -74.005974));
    fireEvent.click(dialog.getByRole('button', { name: 'Use my current location' }));

    expect(dialog.getByLabelText('Latitude')).toHaveValue('40.712776');
    expect(dialog.getByLabelText('Longitude')).toHaveValue('-74.005974');
    expect(dialog.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('DropZonesAPI', () => {
  // The page tests replace this module, so its request paths and error handling are checked
  // here against the real implementation with only the network stubbed.
  const fetchMock = vi.fn();
  let real: typeof import('@/lib/api/dropzones');

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const lastRequest = () => {
    const [url, init] = fetchMock.mock.lastCall as [string, RequestInit | undefined];
    const headers = new Headers(init?.headers);
    return {
      path: new URL(url).pathname + new URL(url).search,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      authorization: headers.get('Authorization'),
      contentType: headers.get('Content-Type'),
    };
  };

  beforeAll(async () => {
    real = await vi.importActual<typeof import('@/lib/api/dropzones')>('@/lib/api/dropzones');
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    storeTokens({ access_token: 'access-1', token_type: 'bearer' });
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    clearTokens();
  });

  it('lists from /v1/dropzones with the filter and paging parameters', async () => {
    fetchMock.mockResolvedValueOnce(json(200, [zone()])).mockResolvedValueOnce(json(200, []));

    await expect(real.DropZonesAPI.list({ active: true, limit: 24, offset: 0 })).resolves.toEqual([zone()]);
    expect(lastRequest()).toMatchObject({ path: '/v1/dropzones?active=true&limit=24&offset=0', method: 'GET' });

    await real.DropZonesAPI.list();
    expect(lastRequest().path).toBe('/v1/dropzones');
  });

  it('reads one zone from /v1/dropzones/{id}', async () => {
    fetchMock.mockResolvedValueOnce(json(200, details()));

    await expect(real.DropZonesAPI.get(ZONE_ID)).resolves.toEqual(details());
    expect(lastRequest()).toMatchObject({ path: `/v1/dropzones/${ZONE_ID}`, method: 'GET' });
  });

  it('posts create, join and check-in to the versioned paths with the bearer token', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, zone()))
      .mockResolvedValueOnce(json(200, { success: true, message: 'Successfully joined dropzone' }))
      .mockResolvedValueOnce(json(200, checkInResult));

    await real.DropZonesAPI.create({ name: 'Newbury Queue', center_lat: 42.3601, center_lng: -71.0589 });
    expect(lastRequest()).toEqual({
      path: '/v1/dropzones',
      method: 'POST',
      body: { name: 'Newbury Queue', center_lat: 42.3601, center_lng: -71.0589 },
      authorization: 'Bearer access-1',
      contentType: 'application/json',
    });

    await expect(real.DropZonesAPI.join(ZONE_ID)).resolves.toEqual({
      success: true,
      message: 'Successfully joined dropzone',
    });
    expect(lastRequest()).toMatchObject({
      path: `/v1/dropzones/${ZONE_ID}/join`,
      method: 'POST',
      authorization: 'Bearer access-1',
    });

    await expect(real.DropZonesAPI.checkIn(ZONE_ID, { lat: 42.3601, lng: -71.0589, message: 'here' })).resolves.toEqual(
      checkInResult,
    );
    expect(lastRequest()).toEqual({
      path: `/v1/dropzones/${ZONE_ID}/checkin`,
      method: 'POST',
      body: { lat: 42.3601, lng: -71.0589, message: 'here' },
      authorization: 'Bearer access-1',
      contentType: 'application/json',
    });
  });

  it('throws the API detail with the status', async () => {
    fetchMock
      .mockResolvedValueOnce(json(400, { detail: 'Too far from dropzone. Distance: 1100.8m, Required: 50.0m' }))
      .mockResolvedValueOnce(json(409, { detail: 'Dropzone is at capacity' }))
      .mockResolvedValueOnce(json(404, { detail: 'Dropzone not found' }));

    await expect(real.DropZonesAPI.checkIn(ZONE_ID, { lat: 42.37, lng: -71.0589 })).rejects.toMatchObject({
      name: 'DropZonesApiError',
      status: 400,
      message: 'Too far from dropzone. Distance: 1100.8m, Required: 50.0m',
    });
    await expect(real.DropZonesAPI.join(ZONE_ID)).rejects.toMatchObject({
      status: 409,
      message: 'Dropzone is at capacity',
    });
    await expect(real.DropZonesAPI.get(ZONE_ID)).rejects.toMatchObject({ status: 404, message: 'Dropzone not found' });
  });

  it('turns 422 validation issues into a readable message', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json(422, {
          detail: [
            { type: 'string_too_short', loc: ['body', 'name'], msg: 'String should have at least 1 character' },
            { type: 'less_than_equal', loc: ['body', 'center_lat'], msg: 'Input should be less than or equal to 90' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        json(422, {
          detail: [{ type: 'value_error', loc: ['body'], msg: 'Value error, ends_at must be after starts_at' }],
        }),
      );

    const request = { name: '', center_lat: 400, center_lng: 2 };
    await expect(real.DropZonesAPI.create(request)).rejects.toMatchObject({
      status: 422,
      message: 'name: String should have at least 1 character; center_lat: Input should be less than or equal to 90',
    });
    await expect(real.DropZonesAPI.create(request)).rejects.toMatchObject({
      status: 422,
      message: 'ends_at must be after starts_at',
    });
  });

  it('falls back to a generic message when the response or the network gives none', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('upstream exploded', { status: 502 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(real.DropZonesAPI.list()).rejects.toMatchObject({ status: 502, message: 'Failed to load drop zones' });
    await expect(real.DropZonesAPI.list()).rejects.toMatchObject({
      status: 0,
      message: 'Could not reach the server. Check your connection and try again.',
    });
  });

  it('reports a successful response that is not JSON as a failure of that request', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>captive portal</html>', { status: 200 }));

    await expect(real.DropZonesAPI.get(ZONE_ID)).rejects.toMatchObject({
      name: 'DropZonesApiError',
      status: 200,
      message: 'Failed to load drop zone',
    });
  });

  it('keeps the detail of a 401 and of the daily creation limit', async () => {
    fetchMock
      .mockResolvedValueOnce(json(429, { detail: 'You can create at most 5 dropzones per day' }))
      .mockResolvedValueOnce(json(401, { detail: 'Not authenticated' }));

    await expect(
      real.DropZonesAPI.create({ name: 'Sixth', center_lat: 42.3601, center_lng: -71.0589 }),
    ).rejects.toMatchObject({ status: 429, message: 'You can create at most 5 dropzones per day' });

    // No refresh token is stored, so apiFetch gives up after the first 401 and ends the session.
    // That sends the browser to /login, which jsdom cannot do, so the test already "is" there.
    window.history.pushState({}, '', '/login');
    try {
      await expect(real.DropZonesAPI.join(ZONE_ID)).rejects.toMatchObject({
        status: 401,
        message: 'Not authenticated',
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      window.history.pushState({}, '', '/');
    }
  });
});
