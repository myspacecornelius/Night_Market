import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Drops from '../pages/Drops';
import { DropsAPI, DropsApiError } from '@/lib/api/drops';
import type { Drop, DropFollowState, DropsPage, DropsStats, ListDropsParams } from '@/lib/api/drops';
import { apiFetch } from '@/lib/api/http';
import { renderWithProviders } from './test-utils';

// Only the network calls are replaced; the error class and the types stay the real ones.
vi.mock('@/lib/api/drops', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/drops')>();
  return {
    ...actual,
    DropsAPI: {
      list: vi.fn(),
      get: vi.fn(),
      following: vi.fn(),
      follow: vi.fn(),
      unfollow: vi.fn(),
      stats: vi.fn(),
    },
  };
});

// For the tests of the client itself, which runs for real on top of this.
vi.mock('@/lib/api/http', () => ({ apiFetch: vi.fn() }));

const api = vi.mocked(DropsAPI);

/**
 * "Now" for the page: a Wednesday morning, local time. Only Date is frozen; timers run for
 * real, so queries, debounced filters and waitFor behave as they do in a browser.
 */
const NOW = new Date(2026, 10, 11, 9, 0, 0);
const november = (day: number, hour: number, minute = 0, second = 0) =>
  new Date(2026, 10, day, hour, minute, second).toISOString();

const WEDNESDAY = 'Wednesday, November 11, 2026';
const FRIDAY = 'Friday, November 13, 2026';
const UNDATED = 'Date to be announced';

function drop(overrides: Partial<Drop> = {}): Drop {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    brand: 'Nike',
    sku: 'FD0774-100',
    name: "Air Max 1 '86",
    description: 'Big Bubble returns.',
    release_at: november(13, 12, 30),
    retail_price: 150,
    image_url: 'https://cdn.example.com/air-max.jpg',
    status: 'upcoming',
    regions: ['US', 'EU'],
    release_type: 'RAFFLE',
    links: { snkrs: 'https://snkrs.example.com/air-max' },
    hype_score: 30,
    interest_count: 8,
    signal_count: 2,
    is_featured: true,
    is_verified: true,
    // Deliberately not what release_at says: the page must count down from release_at itself.
    time_until_drop: { status: 'upcoming', days: 99, hours: 9, minutes: 9, total_seconds: 8586540 },
    store_count: 3,
    is_following: false,
    ...overrides,
  };
}

const AIR_MAX = drop();
const SAMBA = drop({
  id: '22222222-2222-4222-8222-222222222222',
  brand: 'Adidas',
  sku: null,
  name: 'Samba OG',
  description: null,
  release_at: november(13, 18, 0),
  retail_price: null,
  image_url: null,
  regions: null,
  release_type: null,
  links: null,
  hype_score: 4,
  interest_count: 1,
  signal_count: 0,
  is_featured: false,
  is_verified: false,
  store_count: 1,
  is_following: true,
});
const DUNK = drop({
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Dunk Low Panda',
  release_at: november(11, 9, 12, 30),
  retail_price: 110,
  image_url: 'javascript:alert(1)',
  release_type: 'FCFS',
  hype_score: 12,
  interest_count: 5,
  is_featured: false,
  store_count: 0,
});
const NB_990 = drop({
  id: '44444444-4444-4444-8444-444444444444',
  brand: 'New Balance',
  name: '990v7',
  release_at: null,
  retail_price: 199.99,
  image_url: null,
  release_type: null,
  status: 'delayed',
  hype_score: 0,
  interest_count: 0,
  is_featured: false,
  store_count: 2,
  time_until_drop: { status: 'no_date' },
});

function page(drops: Drop[], overrides: Partial<DropsPage> = {}): DropsPage {
  return { drops, total: drops.length, page: 1, per_page: 20, has_next: false, ...overrides };
}

const STATS: DropsStats = {
  total_drops: 42,
  upcoming_drops: 17,
  live_drops: 3,
  this_week_drops: 5,
  top_brands: [
    { brand: 'Nike', count: 21 },
    { brand: 'Adidas', count: 9 },
  ],
  release_types: [
    { type: 'RAFFLE', count: 14 },
    { type: 'FCFS', count: 11 },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const never = <T,>() => new Promise<T>(() => {});

function panel(name: 'Upcoming' | 'Following') {
  return within(screen.getByRole('tabpanel', { name }));
}

/** The date headings of the agenda, in the order they are shown. */
function days(name: 'Upcoming' | 'Following' = 'Upcoming') {
  return panel(name)
    .getAllByRole('region')
    .map((region) => region.getAttribute('aria-label'));
}

function card(name: string) {
  const item = screen.getByRole('heading', { name, level: 3 }).closest('li');
  if (!item) throw new Error(`No drop card named ${name}`);
  return within(item);
}

function names(scope: ReturnType<typeof within>) {
  return scope.getAllByRole('heading', { level: 3 }).map((heading: HTMLElement) => heading.textContent);
}

function stat(label: string) {
  return within(screen.getByRole('region', { name: 'Drop statistics' })).getByRole('group', { name: label });
}

function openFollowing() {
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Following' }));
}

async function openDetails(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: `View details for ${name}` }));
  return within(await screen.findByRole('dialog', { name }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  Object.values(api).forEach((mock) => mock.mockReset());
  vi.mocked(apiFetch).mockReset();
  api.stats.mockResolvedValue(STATS);
  api.list.mockResolvedValue(page([AIR_MAX, DUNK, SAMBA, NB_990]));
  api.following.mockResolvedValue(page([SAMBA]));
  api.get.mockImplementation(async (id) => {
    const found = [AIR_MAX, SAMBA, DUNK, NB_990].find((candidate) => candidate.id === id);
    if (!found) throw new DropsApiError(404, 'Drop not found');
    return found;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Drops page: the agenda', () => {
  it('groups the drops the API returns by release date, soonest day first', async () => {
    renderWithProviders(<Drops />);
    expect(screen.getByRole('status', { name: 'Loading drops' })).toBeInTheDocument();

    await screen.findByRole('heading', { name: "Air Max 1 '86", level: 3 });
    expect(screen.queryByRole('status', { name: 'Loading drops' })).not.toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith({ page: 1, per_page: 20 });

    // The API lists featured drops first; the agenda is by day, with undated drops last.
    expect(days()).toEqual([WEDNESDAY, FRIDAY, UNDATED]);
    expect(names(within(panel('Upcoming').getByRole('region', { name: WEDNESDAY })))).toEqual(['Dunk Low Panda']);
    expect(names(within(panel('Upcoming').getByRole('region', { name: FRIDAY })))).toEqual([
      "Air Max 1 '86",
      'Samba OG',
    ]);
    expect(names(within(panel('Upcoming').getByRole('region', { name: UNDATED })))).toEqual(['990v7']);
    expect(panel('Upcoming').getByText('Showing 4 of 4 drops')).toBeInTheDocument();
    expect(screen.queryByText(/Calendar component will be here/)).not.toBeInTheDocument();
  });

  it("shows each drop's own details and a countdown worked out from its release date", async () => {
    renderWithProviders(<Drops />);
    await screen.findByRole('heading', { name: "Air Max 1 '86", level: 3 });

    const airMax = card("Air Max 1 '86");
    expect(airMax.getByText('Nike')).toBeInTheDocument();
    expect(airMax.getByText('$150.00')).toBeInTheDocument();
    expect(airMax.getByText('RAFFLE')).toBeInTheDocument();
    expect(airMax.getByText('Upcoming')).toBeInTheDocument();
    expect(airMax.getByText('Featured')).toBeInTheDocument();
    expect(airMax.getByText('12:30 PM')).toBeInTheDocument();
    expect(airMax.getByText('Releases in 2d 3h')).toBeInTheDocument();
    expect(airMax.getByText('3 stores')).toBeInTheDocument();
    expect(airMax.getByText('Hype 30')).toBeInTheDocument();
    expect(airMax.getByText('8 followers')).toBeInTheDocument();
    expect(airMax.getByRole('img', { name: "Nike Air Max 1 '86" })).toHaveAttribute(
      'src',
      'https://cdn.example.com/air-max.jpg',
    );

    const samba = card('Samba OG');
    expect(samba.getByText('Adidas')).toBeInTheDocument();
    expect(samba.getByText('Price to be announced')).toBeInTheDocument();
    expect(samba.getByText('Releases in 2d 9h')).toBeInTheDocument();
    expect(samba.getByText('1 store')).toBeInTheDocument();
    expect(samba.getByText('1 follower')).toBeInTheDocument();
    expect(samba.queryByText('Featured')).not.toBeInTheDocument();
    expect(samba.queryByRole('img')).not.toBeInTheDocument();

    const dunk = card('Dunk Low Panda');
    expect(dunk.getByText('Releases in 12m 30s')).toBeInTheDocument();
    expect(dunk.getByText('FCFS')).toBeInTheDocument();
    expect(dunk.getByText('0 stores')).toBeInTheDocument();
    // an image address that is not http(s) is never handed to the browser
    expect(dunk.queryByRole('img')).not.toBeInTheDocument();

    const undated = card('990v7');
    expect(undated.getByText('Release date to be announced')).toBeInTheDocument();
    expect(undated.getByText('Delayed')).toBeInTheDocument();
    expect(undated.getByText('$199.99')).toBeInTheDocument();
    expect(undated.getByText('0 followers')).toBeInTheDocument();
  });

  it('says so when a release time has passed or the drop will not release', async () => {
    api.list.mockResolvedValue(
      page([
        drop({ id: 'a', name: 'Went live', release_at: november(11, 8, 0), status: 'live' }),
        drop({ id: 'b', name: 'Overdue', release_at: november(11, 8, 30), status: 'upcoming' }),
        // within the hour, when a drop that is going to release counts the seconds
        drop({ id: 'c', name: 'Called off', release_at: november(11, 9, 30), status: 'cancelled' }),
      ]),
    );
    const timers = vi.spyOn(window, 'setInterval');
    try {
      renderWithProviders(<Drops />);
      await screen.findByRole('heading', { name: 'Went live', level: 3 });

      expect(card('Went live').getByText('Live now')).toBeInTheDocument();
      expect(card('Overdue').getByText('Release time has passed')).toBeInTheDocument();
      expect(card('Called off').getByText('Will not release')).toBeInTheDocument();
      expect(card('Called off').getByText('Cancelled')).toBeInTheDocument();
      expect(card('Called off').queryByText(/Releases in/)).not.toBeInTheDocument();
      // nothing is left to count on these cards: none of them reads the clock every second
      expect(timers.mock.calls.filter(([, delay]) => delay === 1000)).toEqual([]);
    } finally {
      timers.mockRestore();
    }
  });

  it('says so when there is nothing coming up', async () => {
    api.list.mockResolvedValue(page([]));
    renderWithProviders(<Drops />);

    expect(await screen.findByRole('heading', { name: 'No upcoming drops' })).toBeInTheDocument();
    expect(panel('Upcoming').queryByRole('region')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('reports a failed load with the reason and loads again on retry', async () => {
    api.list.mockRejectedValueOnce(new DropsApiError(503, 'The calendar is taking a break'));
    renderWithProviders(<Drops />);

    const alert = await panel('Upcoming').findByRole('alert');
    expect(within(alert).getByText('Could not load drops')).toBeInTheDocument();
    expect(within(alert).getByText('The calendar is taking a break')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: "Air Max 1 '86", level: 3 })).toBeInTheDocument();
    expect(panel('Upcoming').queryByRole('alert')).not.toBeInTheDocument();
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('loads the next page on request and adds it to the agenda', async () => {
    api.list.mockImplementation(async ({ page: pageNumber }: ListDropsParams = {}) =>
      pageNumber === 2
        ? page([NB_990], { total: 3, page: 2 })
        : page([AIR_MAX, DUNK], { total: 3, has_next: true }),
    );
    renderWithProviders(<Drops />);
    await screen.findByRole('heading', { name: "Air Max 1 '86", level: 3 });
    expect(panel('Upcoming').getByText('Showing 2 of 3 drops')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '990v7', level: 3 })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('heading', { name: '990v7', level: 3 })).toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith({ page: 2, per_page: 20 });
    expect(days()).toEqual([WEDNESDAY, FRIDAY, UNDATED]);
    expect(panel('Upcoming').getByText('Showing 3 of 3 drops')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('keeps the drops it has when the next page fails, and loads that page on retry', async () => {
    let nextPageFails = true;
    api.list.mockImplementation(async ({ page: pageNumber }: ListDropsParams = {}) => {
      if (pageNumber !== 2) return page([AIR_MAX, DUNK], { total: 3, has_next: true });
      if (nextPageFails) throw new DropsApiError(503, 'Try again in a moment');
      return page([NB_990], { total: 3, page: 2 });
    });
    renderWithProviders(<Drops />);
    await screen.findByRole('heading', { name: "Air Max 1 '86", level: 3 });

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    const alert = await panel('Upcoming').findByRole('alert');
    expect(within(alert).getByText('Could not load more drops')).toBeInTheDocument();
    expect(within(alert).getByText('Try again in a moment')).toBeInTheDocument();
    // what was loaded is still there
    expect(names(panel('Upcoming'))).toEqual(['Dunk Low Panda', "Air Max 1 '86"]);
    expect(panel('Upcoming').getByText('Showing 2 of 3 drops')).toBeInTheDocument();

    nextPageFails = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: '990v7', level: 3 })).toBeInTheDocument();
    expect(panel('Upcoming').queryByRole('alert')).not.toBeInTheDocument();
    expect(panel('Upcoming').getByText('Showing 3 of 3 drops')).toBeInTheDocument();
  });

  it('keeps counting down while the page is open, until the release time has come', async () => {
    renderWithProviders(<Drops />);
    await screen.findByRole('heading', { name: 'Dunk Low Panda', level: 3 });
    const dunk = card('Dunk Low Panda');
    expect(dunk.getByText('Releases in 12m 30s')).toBeInTheDocument();

    vi.setSystemTime(new Date(NOW.getTime() + 10_000));
    expect(await dunk.findByText('Releases in 12m 20s', undefined, { timeout: 3000 })).toBeInTheDocument();

    vi.setSystemTime(new Date(2026, 10, 11, 9, 12, 31));
    expect(await dunk.findByText('Release time has passed', undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(dunk.queryByText(/Releases in/)).not.toBeInTheDocument();
  });
});

describe('Drops page: filters', () => {
  it("sends each filter as the list route's own parameter and shows what comes back", async () => {
    api.list.mockImplementation(async (params: ListDropsParams = {}) => {
      if (params.brand === 'adi') return page([SAMBA]);
      return page([AIR_MAX, DUNK, SAMBA, NB_990]);
    });
    renderWithProviders(<Drops />);
    await screen.findByRole('heading', { name: "Air Max 1 '86", level: 3 });
    const filters = within(screen.getByRole('search', { name: 'Filter drops' }));

    fireEvent.change(filters.getByLabelText('Brand'), { target: { value: ' adi ' } });
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ brand: 'adi', page: 1, per_page: 20 }), {
      timeout: 3000,
    });
    await waitFor(() => expect(names(panel('Upcoming'))).toEqual(['Samba OG']));
    expect(panel('Upcoming').getByText('Showing 1 of 1 drop')).toBeInTheDocument();

    fireEvent.change(filters.getByLabelText('City'), { target: { value: 'Boston' } });
    await waitFor(
      () => expect(api.list).toHaveBeenLastCalledWith({ brand: 'adi', city: 'Boston', page: 1, per_page: 20 }),
      { timeout: 3000 },
    );

    fireEvent.click(within(filters.getByRole('group', { name: 'Status' })).getByRole('button', { name: 'Delayed' }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith({
        brand: 'adi',
        city: 'Boston',
        status: 'delayed',
        page: 1,
        per_page: 20,
      }),
    );
    expect(filters.getByRole('button', { name: 'Delayed' })).toHaveAttribute('aria-pressed', 'true');
    expect(filters.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(filters.getByRole('switch', { name: 'Featured only' }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith({
        brand: 'adi',
        city: 'Boston',
        status: 'delayed',
        featured_only: true,
        page: 1,
        per_page: 20,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ page: 1, per_page: 20 }));
    await waitFor(() => expect(names(panel('Upcoming'))).toHaveLength(4));
    expect(filters.getByLabelText('Brand')).toHaveValue('');
    expect(filters.getByLabelText('City')).toHaveValue('');
    expect(filters.getByRole('switch', { name: 'Featured only' })).toHaveAttribute('aria-checked', 'false');
    expect(filters.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('offers to clear the filters when nothing matches them', async () => {
    api.list.mockImplementation(async (params: ListDropsParams = {}) =>
      params.status === 'cancelled' ? page([]) : page([AIR_MAX]),
    );
    renderWithProviders(<Drops />);
    await screen.findByRole('heading', { name: "Air Max 1 '86", level: 3 });

    fireEvent.click(screen.getByRole('button', { name: 'Cancelled' }));

    expect(await screen.findByRole('heading', { name: 'No drops match these filters' })).toBeInTheDocument();
    expect(
      screen.getByText('Nothing releasing in the next four weeks, or still without a date, fits them.'),
    ).toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith({ status: 'cancelled', page: 1, per_page: 20 });

    fireEvent.click(within(screen.getByRole('tabpanel', { name: 'Upcoming' })).getAllByRole('button', { name: 'Clear filters' })[0]);

    expect(await screen.findByRole('heading', { name: "Air Max 1 '86", level: 3 })).toBeInTheDocument();
  });

  it('looks four weeks back for a status that only a released drop can have', async () => {
    // Without dates the API lists what is still to come: asked for "live" alone it finds
    // nothing, whatever "Live now" in the statistics says.
    const released = drop({ id: 'live-1', name: 'Out since yesterday', release_at: november(10, 10), status: 'live' });
    api.list.mockImplementation(async (params: ListDropsParams = {}) => {
      if (params.status === 'live') return params.from_date ? page([released]) : page([]);
      if (params.status === 'ended') return page([]);
      return page([AIR_MAX]);
    });
    renderWithProviders(<Drops />);
    await screen.findByRole('heading', { name: "Air Max 1 '86", level: 3 });
    const status = within(screen.getByRole('group', { name: 'Status' }));

    fireEvent.click(status.getByRole('button', { name: 'Live' }));

    expect(await screen.findByRole('heading', { name: 'Out since yesterday', level: 3 })).toBeInTheDocument();
    const sent = api.list.mock.lastCall?.[0];
    expect(sent).toEqual({ status: 'live', from_date: expect.any(String), page: 1, per_page: 20 });
    const lookBack = NOW.getTime() - new Date(sent?.from_date ?? '').getTime();
    expect(lookBack).toBeGreaterThanOrEqual(28 * 24 * 3_600_000);
    expect(lookBack).toBeLessThan(28 * 24 * 3_600_000 + 3_600_000);
    expect(days()).toEqual(['Tuesday, November 10, 2026']);
    expect(card('Out since yesterday').getByText('Live now')).toBeInTheDocument();
    // the date asked for does not move with the clock: the list is not asked again and again
    const asked = api.list.mock.calls.length;
    vi.setSystemTime(new Date(NOW.getTime() + 5_000));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(api.list).toHaveBeenCalledTimes(asked);

    fireEvent.click(status.getByRole('button', { name: 'Ended' }));

    expect(await screen.findByRole('heading', { name: 'No drops match these filters' })).toBeInTheDocument();
    expect(screen.getByText('Nothing released in the last four weeks, or still to come, fits them.')).toBeInTheDocument();
    expect(api.list.mock.lastCall?.[0]).toEqual({ status: 'ended', from_date: sent?.from_date, page: 1, per_page: 20 });

    fireEvent.click(status.getByRole('button', { name: 'Sold out' }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith({ status: 'sold_out', from_date: sent?.from_date, page: 1, per_page: 20 }),
    );

    // a status a drop has before its release needs no dates
    fireEvent.click(status.getByRole('button', { name: 'Upcoming' }));

    expect(await screen.findByRole('heading', { name: "Air Max 1 '86", level: 3 })).toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith({ status: 'upcoming', page: 1, per_page: 20 });
  });
});

describe('Drops page: following', () => {
  it('follows at once, before the API has answered, then shows the counts the API returned', async () => {
    const answer = deferred<DropFollowState>();
    api.follow.mockReturnValue(answer.promise);
    renderWithProviders(<Drops />);
    await screen.findByRole('heading', { name: "Air Max 1 '86", level: 3 });
    const airMax = card("Air Max 1 '86");
    expect(airMax.getByRole('button', { name: "Follow Air Max 1 '86" })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(airMax.getByRole('button', { name: "Follow Air Max 1 '86" }));

    const following = await airMax.findByRole('button', { name: "Following Air Max 1 '86" });
    expect(following).toHaveAttribute('aria-pressed', 'true');
    expect(airMax.getByText('9 followers')).toBeInTheDocument();
    expect(airMax.getByText('Hype 31')).toBeInTheDocument();
    expect(api.follow).toHaveBeenCalledTimes(1);
    expect(api.follow).toHaveBeenCalledWith(AIR_MAX.id);
    expect(api.unfollow).not.toHaveBeenCalled();
    // another drop is untouched
    expect(card('Dunk Low Panda').getByRole('button', { name: 'Follow Dunk Low Panda' })).toBeInTheDocument();

    // Someone else followed in the meantime: the API's numbers win over the guess.
    const followed = drop({ is_following: true, interest_count: 10, hype_score: 32 });
    api.list.mockResolvedValue(page([followed, DUNK, SAMBA, NB_990]));
    answer.resolve({ following: true, interest_count: 10, hype_score: 32 });

    expect(await airMax.findByText('10 followers')).toBeInTheDocument();
    expect(airMax.getByText('Hype 32')).toBeInTheDocument();
    expect(airMax.getByRole('button', { name: "Following Air Max 1 '86" })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it("takes the follow back and shows the API's reason when it fails", async () => {
    const answer = deferred<DropFollowState>();
    api.follow.mockReturnValue(answer.promise);
    renderWithProviders(<Drops />);
    await screen.findByRole('heading', { name: "Air Max 1 '86", level: 3 });
    const airMax = card("Air Max 1 '86");

    fireEvent.click(airMax.getByRole('button', { name: "Follow Air Max 1 '86" }));
    await airMax.findByRole('button', { name: "Following Air Max 1 '86" });

    // Whatever is read again afterwards never arrives: only the rollback can restore the card.
    api.list.mockReturnValue(never());
    answer.reject(new DropsApiError(429, 'Too many requests, slow down'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Could not follow Air Max 1 '86: Too many requests, slow down");
    expect(airMax.getByRole('button', { name: "Follow Air Max 1 '86" })).toHaveAttribute('aria-pressed', 'false');
    expect(airMax.getByText('8 followers')).toBeInTheDocument();
    expect(airMax.getByText('Hype 30')).toBeInTheDocument();

    fireEvent.click(within(alert).getByRole('button', { name: 'Dismiss message' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('unfollows a followed drop, and takes that back too when it fails', async () => {
    const answer = deferred<DropFollowState>();
    api.unfollow.mockReturnValue(answer.promise);
    renderWithProviders(<Drops />);
    await screen.findByRole('heading', { name: 'Samba OG', level: 3 });
    const samba = card('Samba OG');
    expect(samba.getByRole('button', { name: 'Following Samba OG' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(samba.getByRole('button', { name: 'Following Samba OG' }));

    expect(await samba.findByRole('button', { name: 'Follow Samba OG' })).toHaveAttribute('aria-pressed', 'false');
    expect(samba.getByText('0 followers')).toBeInTheDocument();
    expect(samba.getByText('Hype 3')).toBeInTheDocument();
    expect(api.unfollow).toHaveBeenCalledWith(SAMBA.id);
    expect(api.follow).not.toHaveBeenCalled();

    api.list.mockReturnValue(never());
    answer.reject(new DropsApiError(0, 'Could not reach the server. Check your connection and try again.'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not unfollow Samba OG: Could not reach the server. Check your connection and try again.',
    );
    expect(samba.getByRole('button', { name: 'Following Samba OG' })).toHaveAttribute('aria-pressed', 'true');
    expect(samba.getByText('1 follower')).toBeInTheDocument();
    expect(samba.getByText('Hype 4')).toBeInTheDocument();
  });

  it('keeps two follows that are in flight together apart', async () => {
    const airMaxAnswer = deferred<DropFollowState>();
    const dunkAnswer = deferred<DropFollowState>();
    api.follow.mockImplementation((id) => (id === AIR_MAX.id ? airMaxAnswer.promise : dunkAnswer.promise));
    renderWithProviders(<Drops />);
    await screen.findByRole('heading', { name: "Air Max 1 '86", level: 3 });
    const airMax = card("Air Max 1 '86");
    const dunk = card('Dunk Low Panda');

    fireEvent.click(airMax.getByRole('button', { name: "Follow Air Max 1 '86" }));
    await airMax.findByRole('button', { name: "Following Air Max 1 '86" });
    fireEvent.click(dunk.getByRole('button', { name: 'Follow Dunk Low Panda' }));
    await dunk.findByRole('button', { name: 'Following Dunk Low Panda' });
    expect(api.follow.mock.calls).toEqual([[AIR_MAX.id], [DUNK.id]]);

    // The first one fails while the second is still on its way.
    airMaxAnswer.reject(new DropsApiError(404, 'Drop not found'));

    expect(await screen.findByRole('alert')).toHaveTextContent("Could not follow Air Max 1 '86: Drop not found");
    expect(airMax.getByRole('button', { name: "Follow Air Max 1 '86" })).toHaveAttribute('aria-pressed', 'false');
    expect(airMax.getByText('8 followers')).toBeInTheDocument();
    // the other drop keeps what its own press showed, and nothing is read again under it
    expect(dunk.getByRole('button', { name: 'Following Dunk Low Panda' })).toHaveAttribute('aria-pressed', 'true');
    expect(dunk.getByText('6 followers')).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledTimes(1);

    api.list.mockResolvedValue(
      page([AIR_MAX, drop({ ...DUNK, is_following: true, interest_count: 7, hype_score: 14 }), SAMBA, NB_990]),
    );
    dunkAnswer.resolve({ following: true, interest_count: 7, hype_score: 14 });

    expect(await dunk.findByText('7 followers')).toBeInTheDocument();
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(dunk.getByRole('button', { name: 'Following Dunk Low Panda' })).toHaveAttribute('aria-pressed', 'true');
    expect(airMax.getByRole('button', { name: "Follow Air Max 1 '86" })).toBeInTheDocument();
    // the failure of the first is still reported
    expect(screen.getByRole('alert')).toHaveTextContent("Could not follow Air Max 1 '86: Drop not found");
  });

  it("reads the Following tab and the quests again after a follow, although the app's cache is still fresh", async () => {
    // The app keeps what it has read for a minute (main.tsx): without an invalidation the
    // Following tab would go on showing the list from before the follow.
    const appLikeClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    appLikeClient.setQueryData(['quests'], { quests: [] });
    api.follow.mockResolvedValue({ following: true, interest_count: 9, hype_score: 31 });
    renderWithProviders(
      <QueryClientProvider client={appLikeClient}>
        <Drops />
      </QueryClientProvider>,
    );
    openFollowing();
    await screen.findByRole('heading', { name: 'Samba OG', level: 3 });
    expect(names(panel('Following'))).toEqual(['Samba OG']);
    expect(api.following).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Upcoming' }));
    const followed = drop({ is_following: true, interest_count: 9, hype_score: 31 });
    api.following.mockResolvedValue(page([followed, SAMBA]));
    api.list.mockResolvedValue(page([followed, DUNK, SAMBA, NB_990]));
    fireEvent.click(await screen.findByRole('button', { name: "Follow Air Max 1 '86" }));
    await screen.findByRole('button', { name: "Following Air Max 1 '86" });
    await waitFor(() => expect(appLikeClient.getQueryState(['quests'])?.isInvalidated).toBe(true));

    openFollowing();

    await waitFor(() => expect(names(panel('Following'))).toEqual(["Air Max 1 '86", 'Samba OG']));
    expect(api.following).toHaveBeenCalledTimes(2);
  });

  it("lists the caller's followed drops on the Following tab and drops one that is unfollowed", async () => {
    api.following.mockResolvedValue(page([SAMBA, drop({ id: 'f2', name: 'Gel-Kayano 14', is_following: true })]));
    api.unfollow.mockResolvedValue({ following: false, interest_count: 0, hype_score: 3 });
    renderWithProviders(<Drops />);
    await screen.findByRole('heading', { name: "Air Max 1 '86", level: 3 });
    expect(api.following).not.toHaveBeenCalled();

    openFollowing();

    expect(screen.getByRole('status', { name: 'Loading the drops you follow' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Samba OG', level: 3 })).toBeInTheDocument();
    expect(api.following).toHaveBeenCalledWith({ upcoming_only: true, page: 1, per_page: 20 });
    expect(names(panel('Following'))).toEqual(['Samba OG', 'Gel-Kayano 14']);
    expect(days('Following')).toEqual([FRIDAY]);
    expect(panel('Following').getByText('Showing 2 of 2 drops')).toBeInTheDocument();
    // the Upcoming tab's drops are not on this one
    expect(screen.queryByRole('heading', { name: 'Dunk Low Panda', level: 3 })).not.toBeInTheDocument();

    api.following.mockResolvedValue(page([drop({ id: 'f2', name: 'Gel-Kayano 14', is_following: true })]));
    fireEvent.click(card('Samba OG').getByRole('button', { name: 'Following Samba OG' }));

    await waitFor(() => expect(names(panel('Following'))).toEqual(['Gel-Kayano 14']));
    expect(api.unfollow).toHaveBeenCalledWith(SAMBA.id);
    expect(panel('Following').getByText('Showing 1 of 1 drop')).toBeInTheDocument();
  });

  it('includes past releases on request', async () => {
    const released = drop({ id: 'p1', name: 'Last week', release_at: november(4, 10), status: 'ended', is_following: true });
    api.following.mockImplementation(async ({ upcoming_only } = {}) =>
      upcoming_only === false ? page([SAMBA, released]) : page([SAMBA]),
    );
    renderWithProviders(<Drops />);
    openFollowing();
    await screen.findByRole('heading', { name: 'Samba OG', level: 3 });

    fireEvent.click(screen.getByRole('switch', { name: 'Include past releases' }));

    expect(await screen.findByRole('heading', { name: 'Last week', level: 3 })).toBeInTheDocument();
    expect(api.following).toHaveBeenLastCalledWith({ upcoming_only: false, page: 1, per_page: 20 });
    // what is still to come stays on top; what is over follows
    expect(days('Following')).toEqual([FRIDAY, 'Wednesday, November 4, 2026']);
    expect(card('Last week').getByText('Ended')).toBeInTheDocument();
  });

  it('remembers the filters and "Include past releases" across a look at the other tab', async () => {
    const released = drop({ id: 'p1', name: 'Last week', release_at: november(4, 10), status: 'ended', is_following: true });
    api.following.mockImplementation(async ({ upcoming_only } = {}) =>
      upcoming_only === false ? page([SAMBA, released]) : page([SAMBA]),
    );
    renderWithProviders(<Drops />);
    await screen.findByRole('heading', { name: "Air Max 1 '86", level: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Delayed' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Featured only' }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith({ status: 'delayed', featured_only: true, page: 1, per_page: 20 }),
    );

    openFollowing();
    fireEvent.click(await screen.findByRole('switch', { name: 'Include past releases' }));
    await screen.findByRole('heading', { name: 'Last week', level: 3 });

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Upcoming' }));

    expect(await screen.findByRole('button', { name: 'Delayed' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('switch', { name: 'Featured only' })).toHaveAttribute('aria-checked', 'true');
    expect(api.list).toHaveBeenLastCalledWith({ status: 'delayed', featured_only: true, page: 1, per_page: 20 });

    openFollowing();

    expect(await screen.findByRole('switch', { name: 'Include past releases' })).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByRole('heading', { name: 'Last week', level: 3 })).toBeInTheDocument();
    expect(api.following).toHaveBeenLastCalledWith({ upcoming_only: false, page: 1, per_page: 20 });
  });

  it('points back to the calendar when nothing is followed', async () => {
    api.following.mockResolvedValue(page([]));
    renderWithProviders(<Drops />);
    openFollowing();

    expect(
      await screen.findByRole('heading', { name: 'You are not following any upcoming drops' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Browse upcoming drops' }));

    expect(screen.getByRole('tab', { name: 'Upcoming' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('heading', { name: "Air Max 1 '86", level: 3 })).toBeInTheDocument();
  });

  it('reports a failed load of the followed drops and loads again on retry', async () => {
    api.following.mockRejectedValueOnce(new DropsApiError(401, 'Could not validate credentials'));
    renderWithProviders(<Drops />);
    openFollowing();

    const alert = await panel('Following').findByRole('alert');
    expect(within(alert).getByText('Could not load the drops you follow')).toBeInTheDocument();
    expect(within(alert).getByText('Could not validate credentials')).toBeInTheDocument();

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'Samba OG', level: 3 })).toBeInTheDocument();
    expect(panel('Following').queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Drops page: details', () => {
  it('shows what the detail route returns, and only http(s) values as links', async () => {
    const details = deferred<Drop>();
    api.get.mockReturnValue(details.promise);
    renderWithProviders(<Drops />);

    const dialog = await openDetails("Air Max 1 '86");
    expect(api.get).toHaveBeenCalledWith(AIR_MAX.id);
    expect(dialog.getByRole('status', { name: 'Loading drop details' })).toBeInTheDocument();

    details.resolve(
      drop({
        // not the list's copy: the dialog must show this one
        description: 'The 1986 shape, bubble and all.',
        regions: ['US', 'JP'],
        interest_count: 12,
        hype_score: 40,
        signal_count: 6,
        links: {
          snkrs: 'https://snkrs.example.com/air-max',
          raffle_links: ['http://raffle.example.com/one', 'see the store window'],
          sneaky: 'javascript:alert(document.cookie)',
          info: { faq: 'https://help.example.com/faq' },
          stock: 250,
        },
      }),
    );

    expect(await dialog.findByText('The 1986 shape, bubble and all.')).toBeInTheDocument();
    expect(dialog.queryByRole('status', { name: 'Loading drop details' })).not.toBeInTheDocument();
    expect(
      within(dialog.getByRole('list', { name: 'Regions' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['US', 'JP']);
    expect(dialog.getByText('Friday, November 13, 2026 at 12:30 PM')).toBeInTheDocument();
    expect(dialog.getByText('Releases in 2d 3h')).toBeInTheDocument();
    expect(dialog.getByText('$150.00')).toBeInTheDocument();
    expect(dialog.getByText('FD0774-100')).toBeInTheDocument();
    expect(dialog.getByRole('group', { name: 'Followers' })).toHaveTextContent('12');
    expect(dialog.getByRole('group', { name: 'Hype' })).toHaveTextContent('40');
    expect(dialog.getByRole('group', { name: 'Signals' })).toHaveTextContent('6');
    expect(dialog.getByRole('group', { name: 'Stores' })).toHaveTextContent('3');

    const links = within(dialog.getByRole('list', { name: 'Links' }));
    expect(links.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      'https://snkrs.example.com/air-max',
      'http://raffle.example.com/one',
      'https://help.example.com/faq',
    ]);
    for (const link of links.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    // shown, but as plain text
    expect(links.getByText('see the store window')).toBeInTheDocument();
    expect(links.getByText('javascript:alert(document.cookie)')).toBeInTheDocument();
    expect(links.getByText('250')).toBeInTheDocument();
    expect(links.getByText('javascript:alert(document.cookie)').closest('a')).toBeNull();
  });

  it('says what a drop does not have yet', async () => {
    renderWithProviders(<Drops />);

    const dialog = await openDetails('Samba OG');

    expect(await dialog.findByText('No description yet.')).toBeInTheDocument();
    expect(dialog.getByText('No regions announced.')).toBeInTheDocument();
    expect(dialog.getByText('No links yet.')).toBeInTheDocument();
    expect(dialog.getByText('Price to be announced')).toBeInTheDocument();
    expect(dialog.queryByRole('list', { name: 'Links' })).not.toBeInTheDocument();
  });

  it('reports a failed load of the details and loads again on retry', async () => {
    api.get.mockRejectedValueOnce(new DropsApiError(404, 'Drop not found'));
    renderWithProviders(<Drops />);

    const dialog = await openDetails("Air Max 1 '86");
    const alert = await dialog.findByRole('alert');
    expect(within(alert).getByText('Could not load this drop')).toBeInTheDocument();
    expect(within(alert).getByText('Drop not found')).toBeInTheDocument();

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await dialog.findByText('Big Bubble returns.')).toBeInTheDocument();
    expect(dialog.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('follows from the dialog and reports a failure inside it', async () => {
    api.follow.mockResolvedValueOnce({ following: true, interest_count: 9, hype_score: 31 });
    renderWithProviders(<Drops />);
    const dialog = await openDetails("Air Max 1 '86");
    await dialog.findByText('Big Bubble returns.');
    api.get.mockResolvedValue(drop({ is_following: true, interest_count: 9, hype_score: 31 }));
    api.list.mockResolvedValue(page([drop({ is_following: true, interest_count: 9, hype_score: 31 }), DUNK]));

    fireEvent.click(dialog.getByRole('button', { name: "Follow Air Max 1 '86" }));

    expect(await dialog.findByRole('button', { name: "Following Air Max 1 '86" })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(api.follow).toHaveBeenCalledWith(AIR_MAX.id);
    await waitFor(() => expect(dialog.getByRole('group', { name: 'Followers' })).toHaveTextContent('9'));

    api.unfollow.mockRejectedValueOnce(new DropsApiError(500, 'Something went wrong on our side'));
    fireEvent.click(dialog.getByRole('button', { name: "Following Air Max 1 '86" }));

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      "Could not unfollow Air Max 1 '86: Something went wrong on our side",
    );
    expect(dialog.getByRole('button', { name: "Following Air Max 1 '86" })).toHaveAttribute('aria-pressed', 'true');

    // closing the dialog leaves the card in the state the API confirmed
    fireEvent.click(dialog.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(card("Air Max 1 '86").getByRole('button', { name: "Following Air Max 1 '86" })).toBeInTheDocument();
  });
});

describe('Drops page: statistics', () => {
  it('shows the numbers the stats route returns', async () => {
    const answer = deferred<DropsStats>();
    api.stats.mockReturnValue(answer.promise);
    renderWithProviders(<Drops />);
    expect(screen.getByRole('status', { name: 'Loading drop statistics' })).toBeInTheDocument();

    answer.resolve(STATS);

    await waitFor(() => expect(stat('Total drops')).toHaveTextContent('42'));
    expect(stat('Upcoming')).toHaveTextContent('17');
    expect(stat('Live now')).toHaveTextContent('3');
    expect(stat('This week')).toHaveTextContent('5');
    expect(
      within(screen.getByRole('list', { name: 'Top brands' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Nike 21', 'Adidas 9']);
    expect(
      within(screen.getByRole('list', { name: 'Release types' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['RAFFLE 14', 'FCFS 11']);
    expect(screen.queryByRole('status', { name: 'Loading drop statistics' })).not.toBeInTheDocument();
    expect(api.stats).toHaveBeenCalledWith();
  });

  it('says so when no drops exist at all', async () => {
    api.stats.mockResolvedValue({
      total_drops: 0, upcoming_drops: 0, live_drops: 0, this_week_drops: 0, top_brands: [], release_types: [],
    });
    renderWithProviders(<Drops />);

    expect(await screen.findByText('No drops have been announced yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Top brands' })).not.toBeInTheDocument();
  });

  it('reports failed statistics without hiding the calendar, and loads them again on retry', async () => {
    api.stats.mockRejectedValueOnce(new DropsApiError(500, 'Stats are unavailable'));
    renderWithProviders(<Drops />);

    const alert = await within(screen.getByRole('region', { name: 'Drop statistics' })).findByRole('alert');
    expect(within(alert).getByText('Could not load drop statistics')).toBeInTheDocument();
    expect(within(alert).getByText('Stats are unavailable')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: "Air Max 1 '86", level: 3 })).toBeInTheDocument();

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(stat('Total drops')).toHaveTextContent('42'));
    expect(api.stats).toHaveBeenCalledTimes(2);
  });
});

describe('drops API client', () => {
  const fetchMock = vi.mocked(apiFetch);

  async function client() {
    return (await vi.importActual<typeof import('@/lib/api/drops')>('@/lib/api/drops')).DropsAPI;
  }

  function answer(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }

  it('asks each route for what it serves', async () => {
    const real = await client();
    fetchMock.mockImplementation(async () => answer(page([AIR_MAX])));

    await real.list();
    expect(fetchMock).toHaveBeenLastCalledWith('/v1/drops/', undefined);

    await real.list({ brand: 'New Balance', status: 'live', city: 'Boston', featured_only: true, page: 2, per_page: 20 });
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/v1/drops/?brand=New+Balance&status=live&city=Boston&featured_only=true&page=2&per_page=20',
      undefined,
    );

    await real.following({ upcoming_only: false, page: 3, per_page: 10 });
    expect(fetchMock).toHaveBeenLastCalledWith('/v1/drops/following?upcoming_only=false&page=3&per_page=10', undefined);

    fetchMock.mockImplementation(async () => answer(AIR_MAX));
    expect(await real.get(AIR_MAX.id)).toEqual(AIR_MAX);
    expect(fetchMock).toHaveBeenLastCalledWith(`/v1/drops/${AIR_MAX.id}`, undefined);

    fetchMock.mockImplementation(async () => answer(STATS));
    expect(await real.stats()).toEqual(STATS);
    expect(fetchMock).toHaveBeenLastCalledWith('/v1/drops/stats/overview', undefined);

    fetchMock.mockImplementation(async () => answer({ following: true, interest_count: 9, hype_score: 31 }));
    expect(await real.follow(AIR_MAX.id)).toEqual({ following: true, interest_count: 9, hype_score: 31 });
    expect(fetchMock).toHaveBeenLastCalledWith(`/v1/drops/${AIR_MAX.id}/interest`, { method: 'POST' });

    fetchMock.mockImplementation(async () => answer({ following: false, interest_count: 8, hype_score: 30 }));
    expect(await real.unfollow(AIR_MAX.id)).toEqual({ following: false, interest_count: 8, hype_score: 30 });
    expect(fetchMock).toHaveBeenLastCalledWith(`/v1/drops/${AIR_MAX.id}/interest`, { method: 'DELETE' });
  });

  it("fails with the API's own reason", async () => {
    const real = await client();

    fetchMock.mockResolvedValueOnce(answer({ detail: 'Drop not found' }, 404));
    await expect(real.follow('missing')).rejects.toMatchObject({
      name: 'DropsApiError',
      status: 404,
      message: 'Drop not found',
    });

    // on a 422 "detail" is a list of issues, not a string
    fetchMock.mockResolvedValueOnce(
      answer(
        { detail: [{ type: 'less_than_equal', loc: ['query', 'per_page'], msg: 'Input should be less than or equal to 100', input: '500' }] },
        422,
      ),
    );
    await expect(real.following({ per_page: 500 })).rejects.toMatchObject({
      status: 422,
      message: 'per_page: Input should be less than or equal to 100',
    });

    fetchMock.mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(real.stats()).rejects.toMatchObject({
      status: 502,
      message: 'Could not load the drop statistics (HTTP 502)',
    });

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(real.list()).rejects.toMatchObject({
      status: 0,
      message: 'Could not reach the server. Check your connection and try again.',
    });
  });
});
