import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { latLngBounds } from 'leaflet';
import type { ReactNode } from 'react';
import { useMap } from 'react-leaflet';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import HeatmapPage from '../app/routes/heatmap';
import { geohashBounds, heatLevel } from '@/components/map/HeatMapOverlay';
import {
  HeatmapAPI,
  HeatmapApiError,
  bboxFromBounds,
  heatmapDropZonesPath,
  heatmapErrorMessage,
  heatmapPath,
} from '@/lib/api/heatmap';
import type {
  HeatmapBin,
  HeatmapDropZone,
  HeatmapParams,
  HeatmapRefreshResponse,
  HeatmapResponse,
  HeatmapWindow,
} from '@/lib/api/heatmap';
import { renderWithProviders } from './test-utils';

// Only the network calls are replaced; the error class, the constants and the pure helpers stay real.
vi.mock('@/lib/api/heatmap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/heatmap')>();
  return {
    ...actual,
    HeatmapAPI: {
      getHeatmap: vi.fn(),
      refreshCache: vi.fn(),
      listDropZones: vi.fn(),
    },
  };
});

const api = vi.mocked(HeatmapAPI);

/*
 * Fixtures in the shape the running API returns (see services/routers/heatmap.py):
 * bins arrive in no particular order, text and media of a sample post can each be null.
 */
const soho: HeatmapBin = {
  geohash: 'dr5rsj2',
  lat: 40.72288513183594,
  lng: -74.00321960449219,
  post_count: 12,
  boost_score: 145,
  top_tags: ['jordan', 'soho'],
  sample_posts: [
    {
      post_id: '2b6c262f-566b-4cee-b03e-bcb1e243ebd3',
      content_text: 'Jordan 4s on the wall in SoHo',
      media_url: null,
      timestamp: '2026-11-11T01:18:11.571111+00:00',
      boost_score: 45,
    },
    {
      post_id: '02f85db4-4301-44c6-8d2a-c36eb86eee04',
      content_text: null,
      media_url: 'https://cdn.example.com/a.jpg',
      timestamp: '2026-11-10T22:28:11.571111+00:00',
      boost_score: 0,
    },
  ],
};

const unionSquare: HeatmapBin = {
  geohash: 'dr5rsr9',
  lat: 40.73590189218521,
  lng: -73.9911013841629,
  post_count: 8,
  boost_score: 19,
  top_tags: ['restock'],
  sample_posts: [
    {
      post_id: '18dc1580-de1c-4516-aae2-fc3986a4aae8',
      content_text: 'Union Sq restock',
      media_url: null,
      timestamp: '2026-11-09T01:28:11.571111+00:00',
      boost_score: 12,
    },
  ],
};

const boston: HeatmapBin = {
  geohash: 'drt2zp2',
  lat: 42.35984802246094,
  lng: -71.05888366699219,
  post_count: 3,
  boost_score: 0,
  top_tags: [],
  sample_posts: [
    {
      post_id: '268c8871-03bd-4f73-a622-526971c963a5',
      content_text: null,
      media_url: 'javascript:alert(1)',
      timestamp: '2026-11-10T23:28:11.571111+00:00',
      boost_score: 0,
    },
  ],
};

const day: HeatmapResponse = {
  bins: [boston, soho, unionSquare],
  total_posts: 23,
  time_window: '24h',
  bbox: null,
};

const hour: HeatmapResponse = {
  bins: [{ ...soho, post_count: 2, boost_score: 50, sample_posts: soho.sample_posts.slice(0, 1) }],
  total_posts: 2,
  time_window: '1h',
  bbox: null,
};

const nothing: HeatmapResponse = { bins: [], total_posts: 0, time_window: '24h', bbox: null };

/** Twelve areas, dr5rsj0 with 12 posts down to dr5rsjc with 1: more than the list shows at first. */
const twelveAreas = (window: HeatmapWindow = '24h'): HeatmapResponse => {
  const suffixes = '0123456789bc'.split('');
  return {
    bins: suffixes.map((suffix, index) => ({
      ...unionSquare,
      geohash: `dr5rsj${suffix}`,
      post_count: suffixes.length - index,
      sample_posts: [],
    })),
    total_posts: 78,
    time_window: window,
    bbox: null,
  };
};

const zones: HeatmapDropZone[] = [
  {
    id: '97dd75df-5e8c-4539-bd96-35bacf6b204e',
    name: 'Later zone',
    description: null,
    owner_id: '7ecce974-fc26-4442-9bfe-0174f214036a',
    center_lat: 40.73,
    center_lng: -73.99,
    radius_meters: 100,
    status: 'active',
    starts_at: null,
    ends_at: '2026-11-13T01:32:42.492320Z',
    member_count: 1,
    check_in_count: 0,
    created_at: '2026-11-11T01:32:42.553511Z',
  },
  {
    id: '1c15f1fa-61eb-476f-85ce-bf39d907bca2',
    name: 'SoHo meetup',
    description: 'Weekly',
    owner_id: '7ecce974-fc26-4442-9bfe-0174f214036a',
    center_lat: 40.7234,
    center_lng: -74.0034,
    radius_meters: 200,
    status: 'active',
    starts_at: null,
    ends_at: null,
    member_count: 7,
    check_in_count: 23,
    created_at: '2026-11-11T01:32:42.530409Z',
  },
];

/** The map double from tests/setup.ts; every useMap() call in the page gets this same object. */
const map = useMap();

const area = (geohash: string) => screen.getByRole('article', { name: `Area ${geohash}` });
const findArea = (geohash: string) => screen.findByRole('article', { name: `Area ${geohash}` });
const listedAreas = () =>
  within(screen.getByRole('list', { name: 'Hottest areas' }))
    .getAllByRole('article')
    .map((article) => article.getAttribute('aria-label'));
const stat = (name: string) => within(screen.getByRole('group', { name }));
const mapTiles = () => within(screen.getByTestId('map-container'));

beforeEach(() => {
  api.getHeatmap.mockReset();
  api.refreshCache.mockReset();
  api.listDropZones.mockReset();
  api.getHeatmap.mockResolvedValue(day);
  api.listDropZones.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Heatmap page', () => {
  it('asks the API for the default view and shows its totals', async () => {
    renderWithProviders(<HeatmapPage />);

    await findArea('dr5rsj2');

    expect(api.getHeatmap).toHaveBeenCalledTimes(1);
    expect(api.getHeatmap).toHaveBeenCalledWith({ window: '24h', zoom: 7, bbox: undefined });
    expect(screen.getByText('23 public posts in 3 areas over the last 24 hours')).toBeInTheDocument();
    expect(stat('Total Activity').getByText('23')).toBeInTheDocument();
    expect(stat('Active Areas').getByText('3')).toBeInTheDocument();
    expect(stat('Peak Activity').getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Showing 3 of 3 areas')).toBeInTheDocument();
    expect(screen.queryByText(/Only the newest/)).not.toBeInTheDocument();
  });

  it('notes when the API reached its cap on counted posts', async () => {
    api.getHeatmap.mockResolvedValue({ ...day, total_posts: 5000 });

    renderWithProviders(<HeatmapPage />);
    await findArea('dr5rsj2');

    expect(screen.getByText('Only the newest 5000 posts are counted.')).toBeInTheDocument();
    expect(stat('Total Activity').getByText('5000')).toBeInTheDocument();
  });

  it('lists the areas busiest first with their tags and sample posts', async () => {
    renderWithProviders(<HeatmapPage />);

    const first = within(await findArea('dr5rsj2'));

    // The API sent Boston first; the page ranks by post count
    expect(listedAreas()).toEqual(['Area dr5rsj2', 'Area dr5rsr9', 'Area drt2zp2']);

    expect(first.getByText('#1 · 12 posts')).toBeInTheDocument();
    expect(first.getByText('40.7229, -74.0032 ·')).toBeInTheDocument();
    expect(first.getByText('Boost score 145')).toBeInTheDocument();
    expect(first.getByText('#jordan')).toBeInTheDocument();
    expect(first.getByText('#soho')).toBeInTheDocument();
    expect(first.getByText('Jordan 4s on the wall in SoHo')).toBeInTheDocument();
    expect(first.getByText('Boost 45')).toBeInTheDocument();
    expect(first.getByText(new Date('2026-11-11T01:18:11.571111+00:00').toLocaleString())).toBeInTheDocument();

    const second = within(area('dr5rsr9'));
    expect(second.getByText('#2 · 8 posts')).toBeInTheDocument();
    expect(second.getByText('Union Sq restock')).toBeInTheDocument();
    expect(second.getByText('#restock')).toBeInTheDocument();

    // No tags came back for Boston, so no tag list is rendered for it
    const third = within(area('drt2zp2'));
    expect(third.getByText('#3 · 3 posts')).toBeInTheDocument();
    expect(third.queryByRole('list', { name: 'Popular tags' })).not.toBeInTheDocument();
  });

  it('handles sample posts without text and only links to web media', async () => {
    renderWithProviders(<HeatmapPage />);

    const first = within(await findArea('dr5rsj2'));
    expect(first.getByText('Media post without text')).toBeInTheDocument();
    expect(first.getByRole('link', { name: 'View media' })).toHaveAttribute('href', 'https://cdn.example.com/a.jpg');

    // A media_url that is not an http(s) address is never turned into a link
    const third = within(area('drt2zp2'));
    expect(third.getByText('Media post without text')).toBeInTheDocument();
    expect(third.queryByRole('link')).not.toBeInTheDocument();
  });

  it('draws one map tile per bin and opens the map on the busiest one', async () => {
    const setView = vi.spyOn(map, 'setView');
    renderWithProviders(<HeatmapPage />);

    await findArea('dr5rsj2');

    const tiles = mapTiles();
    expect(tiles.getByText('dr5rsj2')).toBeInTheDocument();
    expect(tiles.getByText('dr5rsr9')).toBeInTheDocument();
    expect(tiles.getByText('drt2zp2')).toBeInTheDocument();
    expect(tiles.getByText('12 posts')).toBeInTheDocument();
    expect(tiles.getByText('145 boost')).toBeInTheDocument();
    expect(tiles.getByText('8 posts')).toBeInTheDocument();
    expect(tiles.getByText('3 posts')).toBeInTheDocument();
    expect(screen.getByText('Busiest area: 12')).toBeInTheDocument();

    await waitFor(() => expect(setView).toHaveBeenCalledWith([soho.lat, soho.lng], 15, { animate: false }));
    // Only once: later answers do not move the map on their own
    expect(setView).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state until the API answers', async () => {
    let answer: (value: HeatmapResponse) => void = () => {};
    api.getHeatmap.mockReturnValue(new Promise<HeatmapResponse>((resolve) => (answer = resolve)));

    renderWithProviders(<HeatmapPage />);

    expect(screen.getByRole('status', { name: 'Loading heat map' })).toBeInTheDocument();
    expect(screen.getByText('Loading map data...')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Total Activity' })).not.toBeInTheDocument();

    answer(day);

    await findArea('dr5rsj2');
    expect(screen.queryByRole('status', { name: 'Loading heat map' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Loading map data...')).not.toBeInTheDocument());
  });

  it('shows an empty state and can widen the window from it', async () => {
    api.getHeatmap.mockImplementation(async (params?: HeatmapParams) =>
      params?.window === '7d' ? { ...day, time_window: '7d' } : nothing,
    );

    renderWithProviders(<HeatmapPage />);

    expect(await screen.findByText('No activity here yet')).toBeInTheDocument();
    expect(screen.getByText('No public posts with a location in the last 24 hours.')).toBeInTheDocument();
    expect(stat('Total Activity').getByText('0')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Hottest areas' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Busiest area:/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show the last 7 days' }));

    await findArea('dr5rsj2');
    expect(api.getHeatmap).toHaveBeenLastCalledWith({ window: '7d', zoom: 7, bbox: undefined });
    expect(screen.getByText('23 public posts in 3 areas over the last 7 days')).toBeInTheDocument();
    expect(screen.queryByText('No activity here yet')).not.toBeInTheDocument();
  });

  it('shows the API error and retries on request', async () => {
    api.getHeatmap.mockRejectedValueOnce(new HeatmapApiError(400, 'Zoom level must be between 4 and 10'));

    renderWithProviders(<HeatmapPage />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Could not load the heat map')).toBeInTheDocument();
    expect(within(alert).getByText('Zoom level must be between 4 and 10')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Total Activity' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading the heat map' }));

    await findArea('dr5rsj2');
    expect(api.getHeatmap).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('switches the time window', async () => {
    api.getHeatmap.mockImplementation(async (params?: HeatmapParams) => (params?.window === '1h' ? hour : day));

    renderWithProviders(<HeatmapPage />);
    await findArea('drt2zp2');

    const windows = within(screen.getByRole('group', { name: 'Time window' }));
    expect(windows.getByRole('button', { name: 'Last 24 hours' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(windows.getByRole('button', { name: 'Last hour' }));

    expect(await screen.findByText('2 public posts in 1 area over the last hour')).toBeInTheDocument();
    expect(api.getHeatmap).toHaveBeenLastCalledWith({ window: '1h', zoom: 7, bbox: undefined });
    expect(windows.getByRole('button', { name: 'Last hour' })).toHaveAttribute('aria-pressed', 'true');
    expect(windows.getByRole('button', { name: 'Last 24 hours' })).toHaveAttribute('aria-pressed', 'false');
    expect(listedAreas()).toEqual(['Area dr5rsj2']);
    expect(within(area('dr5rsj2')).getByText('#1 · 2 posts')).toBeInTheDocument();
    expect(stat('Total Activity').getByText('2')).toBeInTheDocument();
    expect(mapTiles().queryByText('drt2zp2')).not.toBeInTheDocument();
  });

  it('keeps the last results on screen, marked as updating, while another window loads', async () => {
    let answer: (value: HeatmapResponse) => void = () => {};
    api.getHeatmap.mockImplementation((params?: HeatmapParams) =>
      params?.window === '1h' ? new Promise<HeatmapResponse>((resolve) => (answer = resolve)) : Promise.resolve(day),
    );

    renderWithProviders(<HeatmapPage />);
    await findArea('drt2zp2');
    expect(screen.queryByText(/updating…/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Last hour' }));

    // Still the 24 hour answer, and it says so
    expect(await screen.findByText('Loading map data...')).toBeInTheDocument();
    expect(screen.getByText(/updating…/)).toBeInTheDocument();
    expect(screen.getByText('23 public posts in 3 areas over the last 24 hours')).toBeInTheDocument();
    expect(stat('Total Activity').getByText('public posts in the last 24 hours')).toBeInTheDocument();
    expect(listedAreas()).toHaveLength(3);

    answer(hour);

    expect(await screen.findByText('2 public posts in 1 area over the last hour')).toBeInTheDocument();
    expect(screen.queryByText(/updating…/)).not.toBeInTheDocument();
    expect(stat('Total Activity').getByText('public posts in the last hour')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Loading map data...')).not.toBeInTheDocument());
  });

  it('shows an error with a retry, not the previous window, when another window fails to load', async () => {
    let hourWorks = false;
    api.getHeatmap.mockImplementation(async (params?: HeatmapParams) => {
      if (params?.window !== '1h') return day;
      if (!hourWorks) throw new HeatmapApiError(429, 'Rate limit exceeded. Try again in 12 seconds.');
      return hour;
    });

    renderWithProviders(<HeatmapPage />);
    await findArea('drt2zp2');

    fireEvent.click(screen.getByRole('button', { name: 'Last hour' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Could not load the heat map')).toBeInTheDocument();
    expect(within(alert).getByText('Rate limit exceeded. Try again in 12 seconds.')).toBeInTheDocument();
    // Nothing from the 24 hour answer is passed off as the last hour
    expect(screen.queryByRole('group', { name: 'Total Activity' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Hottest areas' })).not.toBeInTheDocument();
    expect(mapTiles().queryByText('dr5rsj2')).not.toBeInTheDocument();
    expect(screen.queryByText(/public posts in/)).not.toBeInTheDocument();

    hourWorks = true;
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading the heat map' }));

    expect(await screen.findByText('2 public posts in 1 area over the last hour')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(listedAreas()).toEqual(['Area dr5rsj2']);

    // The 24 hour answer is still there to go back to
    fireEvent.click(screen.getByRole('button', { name: 'Last 24 hours' }));
    expect(await screen.findByText('23 public posts in 3 areas over the last 24 hours')).toBeInTheDocument();
  });

  it('changes the detail level within the range the API accepts', async () => {
    const finer: HeatmapResponse = {
      bins: [{ ...soho, geohash: 'dr5rsj2q', post_count: 5 }],
      total_posts: 5,
      time_window: '24h',
      bbox: null,
    };
    api.getHeatmap.mockImplementation(async (params?: HeatmapParams) => (params?.zoom === 7 ? day : finer));

    const setView = vi.spyOn(map, 'setView');
    renderWithProviders(<HeatmapPage />);
    await findArea('dr5rsj2');
    expect(screen.getByText('Level 7')).toBeInTheDocument();
    expect(screen.getByText(/Block: each area is about 150 × 150 m/)).toBeInTheDocument();

    const smaller = screen.getByRole('button', { name: 'Smaller areas' });
    fireEvent.click(smaller);

    expect(await findArea('dr5rsj2q')).toBeInTheDocument();
    expect(api.getHeatmap).toHaveBeenLastCalledWith({ window: '24h', zoom: 8, bbox: undefined });
    expect(screen.getByText('Level 8')).toBeInTheDocument();
    expect(screen.getByText(/Building: each area is about 38 × 19 m/)).toBeInTheDocument();
    // The map zooms in around its current center (0, 0 for the map double) so the smaller areas stay visible
    expect(setView).toHaveBeenLastCalledWith([0, 0], 18, { animate: false });
    expect(screen.queryByRole('article', { name: 'Area drt2zp2' })).not.toBeInTheDocument();

    fireEvent.click(smaller);
    fireEvent.click(smaller);

    await waitFor(() => expect(api.getHeatmap).toHaveBeenLastCalledWith({ window: '24h', zoom: 10, bbox: undefined }));
    expect(screen.getByText('Level 10')).toBeInTheDocument();
    expect(smaller).toBeDisabled();

    const larger = screen.getByRole('button', { name: 'Larger areas' });
    for (let level = 9; level >= 4; level--) fireEvent.click(larger);

    await waitFor(() => expect(api.getHeatmap).toHaveBeenLastCalledWith({ window: '24h', zoom: 4, bbox: undefined }));
    expect(screen.getByText('Level 4')).toBeInTheDocument();
    expect(larger).toBeDisabled();
    expect(smaller).toBeEnabled();
  });

  it('filters the list and the map by a minimum post count without another request', async () => {
    renderWithProviders(<HeatmapPage />);
    await findArea('drt2zp2');

    const minimum = screen.getByLabelText('Minimum posts per area');
    fireEvent.change(minimum, { target: { value: '5' } });

    expect(listedAreas()).toEqual(['Area dr5rsj2', 'Area dr5rsr9']);
    expect(screen.getByText('Showing 2 of 3 areas')).toBeInTheDocument();
    expect(mapTiles().queryByText('drt2zp2')).not.toBeInTheDocument();
    expect(mapTiles().getByText('dr5rsr9')).toBeInTheDocument();

    fireEvent.change(minimum, { target: { value: '50' } });

    expect(screen.getByText('No area has 50 or more posts')).toBeInTheDocument();
    expect(screen.getByText('The busiest area has 12 posts.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Hottest areas' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset filter' }));

    expect(listedAreas()).toEqual(['Area dr5rsj2', 'Area dr5rsr9', 'Area drt2zp2']);
    expect(minimum).toHaveValue(1);
    expect(api.getHeatmap).toHaveBeenCalledTimes(1);
  });

  it('shows ten areas at first and more on request', async () => {
    api.getHeatmap.mockResolvedValue(twelveAreas());

    renderWithProviders(<HeatmapPage />);
    await findArea('dr5rsj0');

    expect(listedAreas()).toHaveLength(10);
    expect(screen.queryByRole('article', { name: 'Area dr5rsjc' })).not.toBeInTheDocument();
    // Every bin is on the map even while the list is cut short
    expect(mapTiles().getByText('dr5rsjc')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show more (2 more)' }));

    expect(listedAreas()).toHaveLength(12);
    expect(within(area('dr5rsjc')).getByText('#12 · 1 post')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument();
  });

  it('moves the map to an area and marks it when "Show on map" is used', async () => {
    const setView = vi.spyOn(map, 'setView');
    renderWithProviders(<HeatmapPage />);
    await findArea('dr5rsr9');
    expect(area('dr5rsr9')).not.toHaveAttribute('aria-current');

    fireEvent.click(within(area('dr5rsr9')).getByRole('button', { name: 'Show on map' }));

    await waitFor(() =>
      expect(setView).toHaveBeenLastCalledWith([unionSquare.lat, unionSquare.lng], 15, { animate: false }),
    );
    expect(area('dr5rsr9')).toHaveAttribute('aria-current', 'true');
    expect(within(area('dr5rsr9')).getByRole('button', { name: 'Show on map' })).toHaveAttribute('aria-pressed', 'true');
    expect(area('dr5rsj2')).not.toHaveAttribute('aria-current');
  });

  it('shows the selected area above the list when it is further down the ranking than the list goes', async () => {
    api.getHeatmap.mockImplementation(async (params?: HeatmapParams) => twelveAreas(params?.window));
    const selectedArea = () => screen.queryByRole('region', { name: 'Selected area' });

    renderWithProviders(<HeatmapPage />);
    await findArea('dr5rsj0');
    expect(selectedArea()).not.toBeInTheDocument();

    // Select the last of the twelve; it is in the list, so the list marks it and nothing is repeated
    fireEvent.click(screen.getByRole('button', { name: 'Show more (2 more)' }));
    fireEvent.click(within(area('dr5rsjc')).getByRole('button', { name: 'Show on map' }));
    expect(area('dr5rsjc')).toHaveAttribute('aria-current', 'true');
    expect(selectedArea()).not.toBeInTheDocument();

    // Another window starts the list at ten again. The selected area is still selected on the
    // map, so it stays on the page: on its own, with its real rank, and the list stays at ten.
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(await screen.findByText('78 public posts in 12 areas over the last 7 days')).toBeInTheDocument();

    expect(listedAreas()).toHaveLength(10);
    expect(listedAreas()).not.toContain('Area dr5rsjc');
    const pinned = selectedArea();
    expect(pinned).toBeInTheDocument();
    const card = within(pinned as HTMLElement).getByRole('article', { name: 'Area dr5rsjc' });
    expect(card).toHaveAttribute('aria-current', 'true');
    expect(within(card).getByText('#12 · 1 post')).toBeInTheDocument();
    expect(within(card).getByText('#restock')).toBeInTheDocument();
    expect(screen.getAllByRole('article', { name: 'Area dr5rsjc' })).toHaveLength(1);

    // Once the list reaches it, it is shown there and not twice
    fireEvent.click(screen.getByRole('button', { name: 'Show more (2 more)' }));
    expect(selectedArea()).not.toBeInTheDocument();
    expect(listedAreas()).toHaveLength(12);
    expect(area('dr5rsjc')).toHaveAttribute('aria-current', 'true');

    // Filtered off the map, it is not shown at all
    fireEvent.change(screen.getByLabelText('Minimum posts per area'), { target: { value: '2' } });
    expect(screen.queryByRole('article', { name: 'Area dr5rsjc' })).not.toBeInTheDocument();
    expect(selectedArea()).not.toBeInTheDocument();
    expect(listedAreas()).toHaveLength(10);
  });

  it('refresh clears the API cache, then re-reads the heat map', async () => {
    const recounted: HeatmapResponse = {
      ...day,
      bins: [boston, { ...soho, post_count: 19 }, unionSquare],
      total_posts: 30,
    };
    api.refreshCache.mockResolvedValue({ cache_keys_cleared: 4, throttled: false });

    renderWithProviders(<HeatmapPage />);
    await findArea('dr5rsj2');
    expect(api.refreshCache).not.toHaveBeenCalled();

    api.getHeatmap.mockResolvedValue(recounted);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('Heat map recounted. 4 cached results cleared.')).toBeInTheDocument();
    expect(api.refreshCache).toHaveBeenCalledTimes(1);
    expect(api.getHeatmap).toHaveBeenCalledTimes(2);
    expect(api.getHeatmap).toHaveBeenLastCalledWith({ window: '24h', zoom: 7, bbox: undefined });
    expect(stat('Total Activity').getByText('30')).toBeInTheDocument();
    expect(stat('Peak Activity').getByText('19')).toBeInTheDocument();
    expect(within(area('dr5rsj2')).getByText('#1 · 19 posts')).toBeInTheDocument();
    // The tile of that area carries the new count as well, and the legend follows
    expect(mapTiles().getByText('19 posts')).toBeInTheDocument();
    expect(mapTiles().queryByText('12 posts')).not.toBeInTheDocument();
    expect(screen.getByText('Busiest area: 19')).toBeInTheDocument();
  });

  it('cannot be refreshed twice at once', async () => {
    let finish: (value: HeatmapRefreshResponse) => void = () => {};
    api.refreshCache.mockReturnValue(new Promise<HeatmapRefreshResponse>((resolve) => (finish = resolve)));

    renderWithProviders(<HeatmapPage />);
    await findArea('dr5rsj2');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    const busy = await screen.findByRole('button', { name: 'Refreshing...' });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(api.refreshCache).toHaveBeenCalledTimes(1);
    // Nothing is re-read before the API has dropped its cache
    expect(api.getHeatmap).toHaveBeenCalledTimes(1);

    finish({ cache_keys_cleared: 2, throttled: false });

    expect(await screen.findByText('Heat map recounted. 2 cached results cleared.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(api.getHeatmap).toHaveBeenCalledTimes(2);
  });

  it('drops the report of the last refresh when the view changes', async () => {
    api.getHeatmap.mockImplementation(async (params?: HeatmapParams) => (params?.window === '1h' ? hour : day));
    api.refreshCache.mockResolvedValue({ cache_keys_cleared: 0, throttled: true });

    renderWithProviders(<HeatmapPage />);
    await findArea('dr5rsj2');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText(/already recounted in the last few seconds/);

    // "In the last few seconds" is about the moment Refresh was pressed, not about a later view
    fireEvent.click(screen.getByRole('button', { name: 'Last hour' }));

    expect(await screen.findByText('2 public posts in 1 area over the last hour')).toBeInTheDocument();
    expect(screen.queryByText(/already recounted/)).not.toBeInTheDocument();

    // A failed refresh is dropped the same way
    api.refreshCache.mockRejectedValue(new HeatmapApiError(401, 'Could not validate credentials'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not validate credentials');

    fireEvent.click(screen.getByRole('button', { name: 'Smaller areas' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('says so when the API reports that the cache was flushed moments ago', async () => {
    // Inside the API's shared 30 second cooldown nothing is dropped, but the page still re-reads
    api.refreshCache.mockResolvedValue({ cache_keys_cleared: 0, throttled: true });

    renderWithProviders(<HeatmapPage />);
    await findArea('dr5rsj2');

    api.getHeatmap.mockResolvedValue(hour);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(
      await screen.findByText('The heat map was already recounted in the last few seconds. Showing those results.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/cached results? cleared/)).not.toBeInTheDocument();
    expect(api.getHeatmap).toHaveBeenCalledTimes(2);
    expect(stat('Total Activity').getByText('2')).toBeInTheDocument();
  });

  it('reports a failed refresh and leaves the data alone', async () => {
    api.refreshCache.mockRejectedValue(new HeatmapApiError(401, 'Not authenticated'));

    renderWithProviders(<HeatmapPage />);
    await findArea('dr5rsj2');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not refresh the heat map. Not authenticated');
    expect(api.getHeatmap).toHaveBeenCalledTimes(1);
    expect(stat('Total Activity').getByText('23')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
  });

  it('keeps the last results on screen when a re-read fails', async () => {
    api.refreshCache.mockResolvedValue({ cache_keys_cleared: 1, throttled: false });

    renderWithProviders(<HeatmapPage />);
    await findArea('dr5rsj2');

    api.getHeatmap.mockRejectedValue(new HeatmapApiError(0, 'Could not reach the server. Check your connection and try again.'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(
      await screen.findByText('Could not update the heat map. Showing the last loaded results.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Could not reach the server. Check your connection and try again.')).toBeInTheDocument();
    // The cache was dropped, but what is on screen is not a recount: the page does not claim one
    expect(screen.queryByText(/Heat map recounted/)).not.toBeInTheDocument();
    expect(stat('Total Activity').getByText('23')).toBeInTheDocument();
    expect(listedAreas()).toHaveLength(3);

    // Once the re-read works, the recount is reported with the new numbers
    api.getHeatmap.mockResolvedValue({ ...day, total_posts: 31 });
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading the heat map' }));

    expect(await screen.findByText('Heat map recounted. 1 cached result cleared.')).toBeInTheDocument();
    expect(stat('Total Activity').getByText('31')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('searches the visible map area and goes back to everywhere', async () => {
    // The user has moved the map over lower Manhattan; the edges of the view are not round numbers
    vi.spyOn(map, 'getBounds').mockReturnValue(latLngBounds([40.60042, -74.09958], [40.79961, -73.90037]));
    const inArea: HeatmapResponse = {
      bins: [soho, unionSquare],
      total_posts: 20,
      time_window: '24h',
      bbox: [-74.1, 40.6, -73.9, 40.8],
    };
    api.getHeatmap.mockImplementation(async (params?: HeatmapParams) => (params?.bbox ? inArea : day));

    renderWithProviders(<HeatmapPage />);
    await findArea('drt2zp2');
    expect(screen.queryByRole('button', { name: 'Search everywhere' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Search this map area' }));

    expect(
      await screen.findByText('20 public posts in 2 areas over the last 24 hours in the searched map area'),
    ).toBeInTheDocument();
    // The box that is sent covers the view and sits on the three-decimal grid the API caches by
    expect(api.getHeatmap).toHaveBeenLastCalledWith({ window: '24h', zoom: 7, bbox: [-74.1, 40.6, -73.9, 40.8] });
    expect(listedAreas()).toEqual(['Area dr5rsj2', 'Area dr5rsr9']);

    fireEvent.click(screen.getByRole('button', { name: 'Search everywhere' }));

    expect(await screen.findByText('23 public posts in 3 areas over the last 24 hours')).toBeInTheDocument();
    expect(api.getHeatmap).toHaveBeenLastCalledWith({ window: '24h', zoom: 7, bbox: undefined });
    expect(screen.queryByRole('button', { name: 'Search everywhere' })).not.toBeInTheDocument();
  });

  it('does not send a bbox when the map has no visible area', async () => {
    // The map double reports a view with no width or height
    renderWithProviders(<HeatmapPage />);
    await findArea('dr5rsj2');

    fireEvent.click(screen.getByRole('button', { name: 'Search this map area' }));

    expect(
      screen.getByText('The map has no visible area to search yet. Move or zoom the map and try again.'),
    ).toBeInTheDocument();
    expect(api.getHeatmap).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Search everywhere' })).not.toBeInTheDocument();
  });
});

describe('Heatmap page drop zones', () => {
  it('puts the active drop zones from the API on the map', async () => {
    api.listDropZones.mockResolvedValue(zones);

    renderWithProviders(<HeatmapPage />);

    expect(await screen.findByText('2 active drop zones on the map.')).toBeInTheDocument();
    expect(api.listDropZones).toHaveBeenCalledWith({ active: true, limit: 100 });

    const tiles = mapTiles();
    expect(tiles.getByRole('heading', { name: 'SoHo meetup' })).toBeInTheDocument();
    expect(tiles.getByRole('heading', { name: 'Later zone' })).toBeInTheDocument();
    expect(tiles.getByText('Weekly')).toBeInTheDocument();
    expect(tiles.getByText('7 members')).toBeInTheDocument();
    expect(tiles.getByText('23 check-ins')).toBeInTheDocument();
    expect(tiles.getByText('1 member')).toBeInTheDocument();
    expect(tiles.getByText(`Ends ${new Date('2026-11-13T01:32:42.492320Z').toLocaleString()}`)).toBeInTheDocument();
    expect(tiles.getAllByRole('link', { name: 'Open drop zones' })[0]).toHaveAttribute('href', '/dropzones');
  });

  it('hides the drop zones when the switch is turned off', async () => {
    api.listDropZones.mockResolvedValue(zones);

    renderWithProviders(<HeatmapPage />);
    await screen.findByText('2 active drop zones on the map.');

    const toggle = screen.getByRole('switch', { name: 'Show drop zones' });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(mapTiles().queryByRole('heading', { name: 'SoHo meetup' })).not.toBeInTheDocument();
    expect(screen.queryByText('2 active drop zones on the map.')).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(await mapTiles().findByRole('heading', { name: 'SoHo meetup' })).toBeInTheDocument();
  });

  it('re-reads the drop zones on refresh and updates the ones already on the map', async () => {
    api.listDropZones.mockResolvedValue(zones);
    api.refreshCache.mockResolvedValue({ cache_keys_cleared: 1, throttled: false });

    renderWithProviders(<HeatmapPage />);
    expect(await mapTiles().findByText('7 members')).toBeInTheDocument();

    // Someone joined and checked in at the SoHo zone; the other zone ended
    api.listDropZones.mockResolvedValue([{ ...zones[1], member_count: 8, check_in_count: 24, description: 'Every Friday' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await mapTiles().findByText('8 members')).toBeInTheDocument();
    expect(mapTiles().getByText('24 check-ins')).toBeInTheDocument();
    expect(mapTiles().getByText('Every Friday')).toBeInTheDocument();
    expect(mapTiles().queryByText('7 members')).not.toBeInTheDocument();
    expect(mapTiles().queryByRole('heading', { name: 'Later zone' })).not.toBeInTheDocument();
    expect(screen.getByText('1 active drop zone on the map.')).toBeInTheDocument();
    expect(api.listDropZones).toHaveBeenCalledTimes(2);
  });

  it('re-reads the drop zones each time the page is opened, even while the cached list is fresh', async () => {
    // The app keeps answers fresh for a minute (see main.tsx); zones change on the drop zones page meanwhile
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60 * 1000 } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
    api.listDropZones.mockResolvedValue(zones.slice(1));

    const firstVisit = render(<HeatmapPage />, { wrapper });
    expect(await screen.findByText('1 active drop zone on the map.')).toBeInTheDocument();
    await findArea('dr5rsj2');
    firstVisit.unmount();

    // A zone was created in the meantime
    api.listDropZones.mockResolvedValue(zones);
    render(<HeatmapPage />, { wrapper });

    expect(await screen.findByText('2 active drop zones on the map.')).toBeInTheDocument();
    expect(mapTiles().getByRole('heading', { name: 'Later zone' })).toBeInTheDocument();
    expect(api.listDropZones).toHaveBeenCalledTimes(2);
    // The heat map answer is still fresh, so it is not asked for again
    expect(api.getHeatmap).toHaveBeenCalledTimes(1);
  });

  it('says so when there are no active drop zones', async () => {
    renderWithProviders(<HeatmapPage />);

    expect(await screen.findByText('No active drop zones right now.')).toBeInTheDocument();
  });

  it('shows a loading state for the drop zones', async () => {
    api.listDropZones.mockReturnValue(new Promise<HeatmapDropZone[]>(() => {}));

    renderWithProviders(<HeatmapPage />);

    expect(screen.getByText('Loading drop zones…')).toBeInTheDocument();
    // The heat map itself does not wait for the drop zones
    expect(await findArea('dr5rsj2')).toBeInTheDocument();
  });

  it('shows a drop zone error with a retry, without hiding the heat map', async () => {
    api.listDropZones.mockRejectedValueOnce(new HeatmapApiError(400, 'Invalid bbox format'));

    renderWithProviders(<HeatmapPage />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Could not load drop zones')).toBeInTheDocument();
    expect(within(alert).getByText('Invalid bbox format')).toBeInTheDocument();
    expect(await findArea('dr5rsj2')).toBeInTheDocument();

    api.listDropZones.mockResolvedValue(zones);
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading drop zones' }));

    expect(await screen.findByText('2 active drop zones on the map.')).toBeInTheDocument();
    expect(api.listDropZones).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('heat map geometry', () => {
  it('decodes a geohash to the cell whose center the API reports', () => {
    // geohash, lat and lng as GET /v1/heatmap returned them at zoom 7 and zoom 4
    for (const [geohash, lat, lng] of [
      ['dr5rsj2', 40.72288513183594, -74.00321960449219],
      ['dr5r', 40.693359375, -74.00390625],
      ['drt2zp2', 42.35984802246094, -71.05888366699219],
    ] as const) {
      const bounds = geohashBounds(geohash);
      expect(bounds).not.toBeNull();
      const [[south, west], [north, east]] = bounds as [[number, number], [number, number]];
      expect((south + north) / 2).toBeCloseTo(lat, 10);
      expect((west + east) / 2).toBeCloseTo(lng, 10);
      expect(north).toBeGreaterThan(south);
      expect(east).toBeGreaterThan(west);
    }
  });

  it('rejects strings that are not geohashes', () => {
    expect(geohashBounds('')).toBeNull();
    expect(geohashBounds('dr5a')).toBeNull(); // "a" is not in the geohash alphabet
  });

  it('colors tiles relative to the busiest bin', () => {
    expect(heatLevel(12, 12)).toBe(4);
    expect(heatLevel(8, 12)).toBe(3);
    expect(heatLevel(6, 12)).toBe(2);
    expect(heatLevel(3, 12)).toBe(1);
    expect(heatLevel(1, 12)).toBe(0);
    expect(heatLevel(0, 0)).toBe(0);
  });

  it('turns map bounds into the bbox the API accepts', () => {
    // Already on the three-decimal grid the API caches by: sent as it is
    expect(bboxFromBounds({ north: 40.8, south: 40.6, east: -73.9, west: -74.1 })).toEqual([-74.1, 40.6, -73.9, 40.8]);
    // Otherwise widened to that grid, never narrowed, so the box covers the whole view
    expect(bboxFromBounds({ north: 40.812349, south: 40.600051, east: -73.90004, west: -74.123456 })).toEqual([
      -74.124, 40.6, -73.9, 40.813,
    ]);
    // A view smaller than one grid step (the map zoomed all the way in) still has an area
    expect(bboxFromBounds({ north: 40.72345, south: 40.72331, east: -74.00321, west: -74.00358 })).toEqual([
      -74.004, 40.723, -74.003, 40.724,
    ]);
    // A zoomed-out map reports edges beyond the world; the API only takes -180..180 and -90..90
    expect(bboxFromBounds({ north: 95, south: -95, east: 540, west: -540 })).toEqual([-180, -90, 180, 90]);
    expect(bboxFromBounds({ north: 0.0004, south: -0.0004, east: 0.0004, west: -0.0004 })).toEqual([
      -0.001, -0.001, 0.001, 0.001,
    ]);
  });

  it('never sends two different boxes that the API would cache as one', () => {
    // The API keys its cache on "%.3f" of each edge; these two views differ by less than that
    const cacheKey = (bbox: number[] | null) => bbox?.map((edge) => edge.toFixed(3)).join(',');
    const one = bboxFromBounds({ north: 40.8, south: 40.6, east: -73.9, west: -74.1004 });
    const other = bboxFromBounds({ north: 40.8, south: 40.6, east: -73.9, west: -74.0996 });

    expect(one).toEqual([-74.101, 40.6, -73.9, 40.8]);
    expect(other).toEqual([-74.1, 40.6, -73.9, 40.8]);
    expect(cacheKey(one)).not.toBe(cacheKey(other));
    // Each box is exactly its own cache key, so the cached answer is always for the box that was asked
    expect(one?.join(',')).toBe('-74.101,40.6,-73.9,40.8');
    expect(one?.map(Number).every((edge) => Number(edge.toFixed(3)) === edge)).toBe(true);
  });

  it('refuses bounds the API would reject', () => {
    expect(bboxFromBounds({ north: 0, south: 0, east: 0, west: 0 })).toBeNull();
    expect(bboxFromBounds({ north: 40.6, south: 40.8, east: -73.9, west: -74.1 })).toBeNull();
    expect(bboxFromBounds({ north: Number.NaN, south: 40.6, east: -73.9, west: -74.1 })).toBeNull();
    // Entirely beyond the antimeridian: nothing is left after clamping
    expect(bboxFromBounds({ north: 10, south: 5, east: 200, west: 185 })).toBeNull();
  });
});

describe('heat map API module', () => {
  it('builds the heat map request the API expects', () => {
    // Nothing chosen: the API applies its own defaults (zoom 7, 24h, everywhere)
    expect(heatmapPath()).toBe('/v1/heatmap');
    expect(heatmapPath({ window: '7d', zoom: 4 })).toBe('/v1/heatmap?zoom=4&window=7d');
    // bbox is min_lng,min_lat,max_lng,max_lat in one comma-separated value
    const path = heatmapPath({ bbox: [-74.1, 40.6, -73.9, 40.8], zoom: 10, window: '1h' });
    expect(path.startsWith('/v1/heatmap?')).toBe(true);
    const query = new URLSearchParams(path.slice(path.indexOf('?') + 1));
    expect(Object.fromEntries(query)).toEqual({ bbox: '-74.1,40.6,-73.9,40.8', zoom: '10', window: '1h' });
  });

  it('builds the drop zone request the API expects', () => {
    expect(heatmapDropZonesPath()).toBe('/v1/dropzones');
    expect(heatmapDropZonesPath({ active: true, limit: 100 })).toBe('/v1/dropzones?active=true&limit=100');
    // active=false is a filter of its own (anything not active), so it is sent rather than dropped
    expect(heatmapDropZonesPath({ active: false, offset: 0 })).toBe('/v1/dropzones?active=false&offset=0');
  });

  it('reads the message out of the error bodies the API sends', () => {
    // 400, 401, 405, 429 and 500: "detail" is the message
    expect(heatmapErrorMessage('Zoom level must be between 4 and 10', 'fallback')).toBe('Zoom level must be between 4 and 10');
    expect(heatmapErrorMessage('Not authenticated', 'fallback')).toBe('Not authenticated');

    // 422: "detail" is a list of validation issues (bodies as GET /v1/heatmap?window=30d&zoom=abc returned them)
    expect(
      heatmapErrorMessage(
        [{ type: 'literal_error', loc: ['query', 'window'], msg: "Input should be '1h', '24h' or '7d'", input: '30d' }],
        'fallback',
      ),
    ).toBe("window: Input should be '1h', '24h' or '7d'");
    expect(
      heatmapErrorMessage(
        [
          {
            type: 'int_parsing',
            loc: ['query', 'zoom'],
            msg: 'Input should be a valid integer, unable to parse string as an integer',
            input: 'abc',
          },
          { type: 'literal_error', loc: ['query', 'window'], msg: "Input should be '1h', '24h' or '7d'", input: '30d' },
        ],
        'fallback',
      ),
    ).toBe(
      "zoom: Input should be a valid integer, unable to parse string as an integer; window: Input should be '1h', '24h' or '7d'",
    );
    // An issue that names no field keeps its message
    expect(heatmapErrorMessage([{ loc: ['body'], msg: 'Field required' }], 'fallback')).toBe('Field required');
  });

  it('falls back to a plain message when the error body says nothing usable', () => {
    for (const detail of [undefined, null, '', [], [{ nothing: true }], { message: 'x' }, 42]) {
      expect(heatmapErrorMessage(detail, 'Failed to load the heat map')).toBe('Failed to load the heat map');
    }
  });
});
