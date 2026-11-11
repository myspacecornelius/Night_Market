import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import Leaderboard from '../app/routes/leaderboard';
import { LeaderboardAPI } from '@/lib/api/leaderboard';
import type {
  Leaderboard as LeaderboardData,
  LeaderboardEntry,
  LeaderboardParams,
  LeaderboardType,
} from '@/lib/api/leaderboard';
import { clearTokens, storeTokens } from '@/lib/auth-tokens';
import { renderWithProviders } from './test-utils';

vi.mock('@/lib/api/leaderboard', () => ({
  LeaderboardAPI: {
    getLeaderboard: vi.fn(),
  },
}));

const api = vi.mocked(LeaderboardAPI);

function entry(
  rank: number,
  username: string,
  value: number,
  overrides: Partial<LeaderboardEntry> = {},
): LeaderboardEntry {
  return {
    rank,
    userId: `00000000-0000-4000-8000-${String(rank).padStart(12, '0')}`,
    username,
    avatar: null,
    value,
    isCurrentUser: false,
    ...overrides,
  };
}

// Titles, subtitles and units are the ones the API returns for each board.
const lacesBoard: LeaderboardData = {
  type: 'laces',
  title: 'LACES Leaderboard',
  subtitle: 'Top LACES holders in the community',
  unit: 'LACES',
  items: [
    entry(1, 'sole_scout', 900000, { avatar: 'https://cdn.example.com/avatars/sole_scout.png' }),
    entry(2, 'anonymous', 700000, { userId: null }),
    entry(3, 'night_owl', 500000, { isCurrentUser: true }),
    entry(4, 'lace_lord', 1234),
  ],
};

const postsBoard: LeaderboardData = {
  type: 'posts',
  title: 'Signal Leaders',
  subtitle: 'Most active community members',
  unit: 'signals',
  items: [entry(1, 'drop_watcher', 42), entry(2, 'sole_scout', 7)],
};

const checkinsBoard: LeaderboardData = {
  type: 'checkins',
  title: 'Drop Hunters',
  subtitle: 'Most check-ins at drop zones',
  unit: 'check-ins',
  items: [],
};

/** 30 members on the LACES board; the signed-in user is 12th. */
const longLacesBoard: LeaderboardData = {
  ...lacesBoard,
  items: Array.from({ length: 30 }, (_, index) => {
    const rank = index + 1;
    return entry(rank, `member_${rank}`, 5000 - index * 100, { isCurrentUser: rank === 12 });
  }),
};

/** Answers getLeaderboard the way the API does: the requested board, cut to the requested length. */
function serve(boards: Partial<Record<LeaderboardType, LeaderboardData>>) {
  return async ({ type = 'laces', limit = 10 }: LeaderboardParams = {}): Promise<LeaderboardData> => {
    const board = boards[type];
    if (!board) throw new Error(`No ${type} board in this test`);
    return { ...board, items: board.items.slice(0, limit) };
  };
}

async function findRows(boardTitle: string) {
  const list = await screen.findByRole('list', { name: boardTitle });
  return within(list).getAllByRole('listitem');
}

function getRows(boardTitle: string) {
  return within(screen.getByRole('list', { name: boardTitle })).getAllByRole('listitem');
}

/** The line that tells the signed-in user where they stand on the selected board. */
function standing() {
  return screen.getByRole('status', { name: 'Your standing' });
}

/**
 * Stands in for the other pages: a check-in, a boost, a quest reward or a profile edit
 * changes the boards, and those pages say so by invalidating ['leaderboard'].
 */
function OtherPageAction() {
  const queryClient = useQueryClient();
  return (
    <button type="button" onClick={() => void queryClient.invalidateQueries({ queryKey: ['leaderboard'] })}>
      Check in elsewhere
    </button>
  );
}

/** The page under the app's own query settings (main.tsx): a loaded board stays fresh for a minute. */
function renderWithAppStaleTime() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 60 * 1000 } },
  });
  return renderWithProviders(
    <QueryClientProvider client={client}>
      <Leaderboard />
    </QueryClientProvider>,
  );
}

describe('Leaderboard page', () => {
  beforeEach(() => {
    api.getLeaderboard
      .mockReset()
      .mockImplementation(serve({ laces: lacesBoard, posts: postsBoard, checkins: checkinsBoard }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the LACES top 10 and lists the members the API returns, best first', async () => {
    renderWithProviders(<Leaderboard />);

    const rows = await findRows('LACES Leaderboard');

    expect(api.getLeaderboard).toHaveBeenCalledTimes(1);
    expect(api.getLeaderboard).toHaveBeenCalledWith({ type: 'laces', limit: 10 });

    expect(screen.getByRole('heading', { name: 'LACES Leaderboard' })).toBeInTheDocument();
    expect(screen.getByText('Top LACES holders in the community')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'LACES' })).toHaveAttribute('aria-selected', 'true');

    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('Rank 1');
    expect(rows[0]).toHaveTextContent('@sole_scout');
    expect(rows[0]).toHaveTextContent('900,000 LACES');
    expect(rows[1]).toHaveTextContent('Rank 2');
    expect(rows[1]).toHaveTextContent('700,000 LACES');
    expect(rows[2]).toHaveTextContent('Rank 3');
    expect(rows[2]).toHaveTextContent('@night_owl');
    expect(rows[2]).toHaveTextContent('500,000 LACES');
    expect(rows[3]).toHaveTextContent('#4');
    expect(rows[3]).toHaveTextContent('@lace_lord');
    expect(rows[3]).toHaveTextContent('1,234 LACES');
  });

  it("highlights the signed-in user's row and shows their rank", async () => {
    renderWithProviders(<Leaderboard />);

    const rows = await findRows('LACES Leaderboard');

    expect(rows[2]).toHaveAttribute('aria-current', 'true');
    expect(within(rows[2]).getByText('You')).toBeInTheDocument();
    for (const other of [rows[0], rows[1], rows[3]]) {
      expect(other).not.toHaveAttribute('aria-current');
      expect(within(other).queryByText('You')).not.toBeInTheDocument();
    }

    expect(standing()).toHaveTextContent('Your rank: #3');
  });

  it('shows an anonymous member without a handle or a picture', async () => {
    vi.stubGlobal(
      'Image',
      // Pictures do not load in jsdom; this one reports itself as loaded so avatars render.
      class extends EventTarget {
        src = '';
        complete = true;
        naturalWidth = 1;
      },
    );
    renderWithProviders(<Leaderboard />);

    const rows = await findRows('LACES Leaderboard');

    expect(within(rows[1]).getByText('Anonymous')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Anonymous')).not.toHaveAttribute('title');
    expect(screen.queryByText('@anonymous')).not.toBeInTheDocument();
    expect(rows[1].querySelector('img')).toBeNull();

    expect(rows[0].querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/avatars/sole_scout.png');
    expect(rows[3].querySelector('img')).toBeNull();
  });

  it("shows the caller's own handle and picture when the caller is an anonymous member", async () => {
    // What the API sends an anonymous member: everyone else sees "anonymous" in the second row.
    api.getLeaderboard.mockResolvedValue({
      ...lacesBoard,
      items: [
        entry(1, 'sole_scout', 900000),
        entry(2, 'ghost_rider', 700000, {
          userId: '76d3d984-b48b-48de-8297-8fe29918e248',
          avatar: 'https://cdn.example.com/avatars/ghost.png',
          isCurrentUser: true,
        }),
        entry(3, 'anonymous', 500000, { userId: null }),
      ],
    });
    renderWithProviders(<Leaderboard />);

    const rows = await findRows('LACES Leaderboard');

    expect(rows[1]).toHaveTextContent('@ghost_rider');
    expect(within(rows[1]).getByText('You')).toBeInTheDocument();
    expect(rows[1]).toHaveAttribute('aria-current', 'true');
    expect(within(rows[1]).queryByText('Anonymous')).not.toBeInTheDocument();
    expect(within(rows[2]).getByText('Anonymous')).toBeInTheDocument();
    expect(rows[2]).not.toHaveAttribute('aria-current');
    expect(standing()).toHaveTextContent('Your rank: #2');
  });

  it('keeps the whole of a long username within reach when the row has to cut it short', async () => {
    const longest = 'the_longest_username_the_signup_form_allows_63bb62'; // 50 characters, the API's limit
    api.getLeaderboard.mockResolvedValue({
      ...lacesBoard,
      items: [entry(1, longest, 10000600), entry(2, 'night_owl', 500, { isCurrentUser: true })],
    });
    renderWithProviders(<Leaderboard />);

    const rows = await findRows('LACES Leaderboard');

    // The row shows the name on one line with an ellipsis; the full name is its text and its tooltip.
    const name = within(rows[0]).getByText(`@${longest}`);
    expect(name).toHaveAttribute('title', `@${longest}`);
    expect(rows[0]).toHaveTextContent('10,000,600 LACES');
    expect(within(rows[1]).getByText('@night_owl')).toHaveAttribute('title', '@night_owl');
  });

  it('switches to the signals board and asks the API for it', async () => {
    renderWithProviders(<Leaderboard />);
    await findRows('LACES Leaderboard');

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Signals' }));

    const rows = await findRows('Signal Leaders');
    expect(api.getLeaderboard).toHaveBeenCalledTimes(2);
    expect(api.getLeaderboard).toHaveBeenLastCalledWith({ type: 'posts', limit: 10 });

    expect(screen.getByRole('tab', { name: 'Signals' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'LACES' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('heading', { name: 'Signal Leaders' })).toBeInTheDocument();
    expect(screen.getByText('Most active community members')).toBeInTheDocument();

    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('@drop_watcher');
    expect(rows[0]).toHaveTextContent('42 signals');
    expect(rows[1]).toHaveTextContent('@sole_scout');
    expect(rows[1]).toHaveTextContent('7 signals');

    // Nothing of the LACES board is left, and the user is not on this one.
    expect(screen.queryByText('@lace_lord')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'LACES Leaderboard' })).not.toBeInTheDocument();
    expect(standing()).toHaveTextContent('You are not on this board yet');
    for (const row of rows) expect(row).not.toHaveAttribute('aria-current');
  });

  it('says so when a board has no members', async () => {
    renderWithProviders(<Leaderboard />);
    await findRows('LACES Leaderboard');

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Check-ins' }));

    const empty = (await screen.findByText('No one is on this board yet')).closest('[role="status"]');
    expect(empty).toHaveTextContent('No one has checked in at a drop zone yet.');
    expect(api.getLeaderboard).toHaveBeenLastCalledWith({ type: 'checkins', limit: 10 });
    expect(screen.getByRole('heading', { name: 'Drop Hunters' })).toBeInTheDocument();
    expect(screen.getByText('Most check-ins at drop zones')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(standing()).toHaveTextContent('You are not on this board yet');
  });

  it('shows a loading state until the board arrives', async () => {
    let deliver: (board: LeaderboardData) => void = () => {};
    api.getLeaderboard.mockReturnValueOnce(
      new Promise<LeaderboardData>((resolve) => {
        deliver = resolve;
      }),
    );
    renderWithProviders(<Leaderboard />);

    // The status region carries the words too: screen readers announce its content, not its label.
    expect(screen.getByRole('status', { name: 'Loading leaderboard' })).toHaveTextContent('Loading leaderboard');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(standing()).toBeEmptyDOMElement();

    deliver(lacesBoard);

    expect(await findRows('LACES Leaderboard')).toHaveLength(4);
    expect(screen.queryByRole('status', { name: 'Loading leaderboard' })).not.toBeInTheDocument();
  });

  it('reports a failed load with the reason and retries on request', async () => {
    api.getLeaderboard.mockRejectedValueOnce(new Error('Rate limit exceeded. Try again in 12 seconds.'));
    renderWithProviders(<Leaderboard />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load the leaderboard');
    expect(alert).toHaveTextContent('Rate limit exceeded. Try again in 12 seconds.');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading leaderboard' })).not.toBeInTheDocument();

    const retry = screen.getByRole('button', { name: 'Retry' });
    retry.focus();
    fireEvent.click(retry);

    const rows = await findRows('LACES Leaderboard');
    expect(rows[0]).toHaveTextContent('@sole_scout');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.getLeaderboard).toHaveBeenCalledTimes(2);
    expect(api.getLeaderboard).toHaveBeenLastCalledWith({ type: 'laces', limit: 10 });

    // The Retry button is gone with the message; keyboard focus stays on the board, not on <body>.
    expect(retry).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'LACES' })).toHaveFocus();
  });

  it('keeps a board that fails to load from affecting the others', async () => {
    const answer = serve({ laces: lacesBoard, checkins: checkinsBoard });
    api.getLeaderboard.mockImplementation(async (params = {}) => {
      if (params.type === 'posts') throw new Error('Inactive user');
      return answer(params);
    });
    renderWithProviders(<Leaderboard />);
    await findRows('LACES Leaderboard');

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Signals' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load the leaderboard');
    expect(alert).toHaveTextContent('Inactive user');
    // Nothing of the LACES board is passed off as the signals board.
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'LACES Leaderboard' })).not.toBeInTheDocument();
    expect(standing()).toBeEmptyDOMElement();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'LACES' }));

    expect(await findRows('LACES Leaderboard')).toHaveLength(4);
    expect(standing()).toHaveTextContent('Your rank: #3');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('ignores a late answer for a board the user has already left', async () => {
    let deliverSignals: (board: LeaderboardData) => void = () => {};
    const answer = serve({ laces: lacesBoard, checkins: checkinsBoard });
    api.getLeaderboard.mockImplementation((params = {}) =>
      params.type === 'posts'
        ? new Promise<LeaderboardData>((resolve) => {
            deliverSignals = resolve;
          })
        : answer(params),
    );
    renderWithProviders(<Leaderboard />);
    await findRows('LACES Leaderboard');

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Signals' }));
    expect(screen.getByRole('status', { name: 'Loading leaderboard' })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Check-ins' }));
    expect(await screen.findByText('No one is on this board yet')).toBeInTheDocument();

    await act(async () => {
      deliverSignals(postsBoard);
      // Give the late answer time to reach the cache and any listener.
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(screen.getByRole('heading', { name: 'Drop Hunters' })).toBeInTheDocument();
    expect(screen.getByText('No one is on this board yet')).toBeInTheDocument();
    expect(screen.queryByText('@drop_watcher')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Signal Leaders' })).not.toBeInTheDocument();
  });

  it('asks the API for a longer list when another length is chosen', async () => {
    api.getLeaderboard.mockImplementation(serve({ laces: longLacesBoard }));
    renderWithProviders(<Leaderboard />);

    expect(await findRows('LACES Leaderboard')).toHaveLength(10);
    expect(screen.getByRole('button', { name: 'Top 10' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Top 25' })).toHaveAttribute('aria-pressed', 'false');
    expect(standing()).toHaveTextContent('You are outside the top 10');
    expect(screen.queryByText('@member_12')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Top 25' }));

    // While the longer list loads the ten rows stay, marked busy, and nothing is claimed about the top 25.
    expect(screen.getByRole('list', { name: 'LACES Leaderboard' })).toHaveAttribute('aria-busy', 'true');
    expect(getRows('LACES Leaderboard')).toHaveLength(10);
    expect(screen.queryByRole('status', { name: 'Loading leaderboard' })).not.toBeInTheDocument();
    expect(standing()).toBeEmptyDOMElement();

    expect(await screen.findByText('@member_25')).toBeInTheDocument();
    expect(api.getLeaderboard).toHaveBeenCalledTimes(2);
    expect(api.getLeaderboard).toHaveBeenLastCalledWith({ type: 'laces', limit: 25 });

    expect(screen.getByRole('list', { name: 'LACES Leaderboard' })).toHaveAttribute('aria-busy', 'false');
    const rows = getRows('LACES Leaderboard');
    expect(rows).toHaveLength(25);
    expect(rows[11]).toHaveTextContent('#12');
    expect(rows[11]).toHaveTextContent('@member_12');
    expect(rows[11]).toHaveTextContent('3,900 LACES');
    expect(rows[11]).toHaveAttribute('aria-current', 'true');
    expect(standing()).toHaveTextContent('Your rank: #12');
    expect(screen.getByRole('button', { name: 'Top 25' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Top 10' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Top 50' }));

    expect(await screen.findByText('@member_30')).toBeInTheDocument();
    expect(api.getLeaderboard).toHaveBeenLastCalledWith({ type: 'laces', limit: 50 });
    expect(getRows('LACES Leaderboard')).toHaveLength(30);
  });

  it('reports a longer list that fails to load, and loads it on retry', async () => {
    let failing = true;
    const answer = serve({ laces: longLacesBoard });
    api.getLeaderboard.mockImplementation(async (params = {}) => {
      if (params.limit === 25 && failing) throw new Error('Rate limit exceeded. Try again in 5 seconds.');
      return answer(params);
    });
    renderWithProviders(<Leaderboard />);
    expect(await findRows('LACES Leaderboard')).toHaveLength(10);

    fireEvent.click(screen.getByRole('button', { name: 'Top 25' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load the leaderboard');
    expect(alert).toHaveTextContent('Rate limit exceeded. Try again in 5 seconds.');
    // The ten rows are not left on screen under the "Top 25" choice, and no standing is claimed.
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(standing()).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: 'Top 25' })).toHaveAttribute('aria-pressed', 'true');

    failing = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('@member_25')).toBeInTheDocument();
    expect(getRows('LACES Leaderboard')).toHaveLength(25);
    expect(standing()).toHaveTextContent('Your rank: #12');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.getLeaderboard).toHaveBeenLastCalledWith({ type: 'laces', limit: 25 });
  });

  it('keeps the chosen length when the board changes', async () => {
    renderWithProviders(<Leaderboard />);
    await findRows('LACES Leaderboard');

    fireEvent.click(screen.getByRole('button', { name: 'Top 50' }));
    await waitFor(() => expect(api.getLeaderboard).toHaveBeenLastCalledWith({ type: 'laces', limit: 50 }));

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Signals' }));

    await findRows('Signal Leaders');
    expect(api.getLeaderboard).toHaveBeenLastCalledWith({ type: 'posts', limit: 50 });
  });

  it('reloads the board from the API on refresh and shows the new standings', async () => {
    api.getLeaderboard.mockResolvedValueOnce(lacesBoard).mockResolvedValueOnce({
      ...lacesBoard,
      items: [entry(1, 'night_owl', 950000, { isCurrentUser: true }), entry(2, 'sole_scout', 900000)],
    });
    renderWithProviders(<Leaderboard />);
    await findRows('LACES Leaderboard');
    expect(standing()).toHaveTextContent('Your rank: #3');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(standing()).toHaveTextContent('Your rank: #1'));
    expect(api.getLeaderboard).toHaveBeenCalledTimes(2);
    expect(api.getLeaderboard).toHaveBeenLastCalledWith({ type: 'laces', limit: 10 });

    const rows = getRows('LACES Leaderboard');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('@night_owl');
    expect(rows[0]).toHaveTextContent('950,000 LACES');
    expect(rows[0]).toHaveAttribute('aria-current', 'true');
    expect(rows[1]).toHaveTextContent('@sole_scout');
    expect(screen.queryByText('@lace_lord')).not.toBeInTheDocument();
  });

  it('keeps Refresh focusable while it reloads, and does not ask twice', async () => {
    let deliver: (board: LeaderboardData) => void = () => {};
    api.getLeaderboard.mockResolvedValueOnce(lacesBoard).mockReturnValueOnce(
      new Promise<LeaderboardData>((resolve) => {
        deliver = resolve;
      }),
    );
    renderWithProviders(<Leaderboard />);
    await findRows('LACES Leaderboard');
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    expect(refresh).toHaveAttribute('aria-disabled', 'false');

    refresh.focus();
    fireEvent.click(refresh);

    // Marked unavailable for assistive technology, but not `disabled`: a disabled button
    // would hand the keyboard focus back to <body> in a browser.
    await waitFor(() => expect(refresh).toHaveAttribute('aria-disabled', 'true'));
    expect(refresh).not.toBeDisabled();
    expect(refresh).toHaveFocus();
    expect(api.getLeaderboard).toHaveBeenCalledTimes(2);

    fireEvent.click(refresh);
    fireEvent.click(refresh);
    expect(api.getLeaderboard).toHaveBeenCalledTimes(2);

    deliver({ ...lacesBoard, items: [entry(1, 'night_owl', 950000, { isCurrentUser: true })] });

    await waitFor(() => expect(getRows('LACES Leaderboard')).toHaveLength(1));
    expect(refresh).toHaveAttribute('aria-disabled', 'false');
    expect(refresh).toHaveFocus();
    expect(api.getLeaderboard).toHaveBeenCalledTimes(2);
  });

  it('keeps the last rankings on screen when a refresh fails', async () => {
    api.getLeaderboard
      .mockResolvedValueOnce(lacesBoard)
      .mockRejectedValueOnce(new Error('Rate limit exceeded. Try again in 30 seconds.'));
    renderWithProviders(<Leaderboard />);
    await findRows('LACES Leaderboard');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not refresh the leaderboard. Showing the last loaded rankings.');
    expect(alert).toHaveTextContent('Rate limit exceeded. Try again in 30 seconds.');
    expect(getRows('LACES Leaderboard')).toHaveLength(4);
    expect(screen.getByText('@lace_lord')).toBeInTheDocument();
    expect(standing()).toHaveTextContent('Your rank: #3');

    // Retry: the button says so and takes no second click, but stays focusable; then the news arrives.
    let deliver: (board: LeaderboardData) => void = () => {};
    api.getLeaderboard.mockReturnValueOnce(
      new Promise<LeaderboardData>((resolve) => {
        deliver = resolve;
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    const retrying = await screen.findByRole('button', { name: 'Retrying…' });
    expect(retrying).toHaveAttribute('aria-disabled', 'true');
    expect(retrying).not.toBeDisabled();
    fireEvent.click(retrying);
    expect(api.getLeaderboard).toHaveBeenCalledTimes(3);
    expect(getRows('LACES Leaderboard')).toHaveLength(4);

    deliver({ ...lacesBoard, items: [entry(1, 'night_owl', 950000, { isCurrentUser: true })] });

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(getRows('LACES Leaderboard')).toHaveLength(1);
    expect(standing()).toHaveTextContent('Your rank: #1');
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
    expect(api.getLeaderboard).toHaveBeenCalledTimes(3);
  });

  it('reloads the board on screen when another page invalidates the leaderboards', async () => {
    api.getLeaderboard.mockResolvedValueOnce(lacesBoard).mockResolvedValueOnce({
      ...lacesBoard,
      items: [entry(1, 'night_owl', 950000, { isCurrentUser: true }), entry(2, 'sole_scout', 900000)],
    });
    renderWithProviders(
      <>
        <Leaderboard />
        <OtherPageAction />
      </>,
    );
    await findRows('LACES Leaderboard');

    fireEvent.click(screen.getByRole('button', { name: 'Check in elsewhere' }));

    await waitFor(() => expect(standing()).toHaveTextContent('Your rank: #1'));
    expect(api.getLeaderboard).toHaveBeenCalledTimes(2);
    expect(getRows('LACES Leaderboard')[0]).toHaveTextContent('950,000 LACES');
  });

  it('reuses a board loaded within the last minute, until a refresh marks every board out of date', async () => {
    renderWithAppStaleTime();
    await findRows('LACES Leaderboard');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Signals' }));
    await findRows('Signal Leaders');
    expect(api.getLeaderboard).toHaveBeenCalledTimes(2);

    // Back to a board that is still fresh: shown at once, without asking again.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'LACES' }));
    expect(getRows('LACES Leaderboard')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute('aria-disabled', 'false');
    expect(api.getLeaderboard).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledTimes(3));
    expect(api.getLeaderboard).toHaveBeenLastCalledWith({ type: 'laces', limit: 10 });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute('aria-disabled', 'false'),
    );

    // The signals board was loaded before the refresh, so it is asked for again.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Signals' }));
    expect(getRows('Signal Leaders')).toHaveLength(2);
    await waitFor(() => expect(api.getLeaderboard).toHaveBeenCalledTimes(4));
    expect(api.getLeaderboard).toHaveBeenLastCalledWith({ type: 'posts', limit: 10 });
  });

  it("asks once and shows one list under React's strict mode", async () => {
    renderWithProviders(
      <StrictMode>
        <Leaderboard />
      </StrictMode>,
    );

    expect(await findRows('LACES Leaderboard')).toHaveLength(4);
    expect(screen.getAllByRole('list')).toHaveLength(1);
    expect(api.getLeaderboard).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Signals' }));

    expect(await findRows('Signal Leaders')).toHaveLength(2);
    expect(api.getLeaderboard).toHaveBeenCalledTimes(2);
    expect(api.getLeaderboard).toHaveBeenLastCalledWith({ type: 'posts', limit: 10 });
  });

  it('filters the loaded members by username without another request', async () => {
    renderWithProviders(<Leaderboard />);
    await findRows('LACES Leaderboard');
    const search = screen.getByRole('searchbox', { name: 'Search members on this board' });

    fireEvent.change(search, { target: { value: '@LACE' } });

    let rows = getRows('LACES Leaderboard');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('#4');
    expect(rows[0]).toHaveTextContent('@lace_lord');

    fireEvent.change(search, { target: { value: 'zzz' } });

    expect(screen.getByText('No members on this board match "zzz"')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    rows = getRows('LACES Leaderboard');
    expect(rows).toHaveLength(4);
    expect(search).toHaveValue('');
    expect(api.getLeaderboard).toHaveBeenCalledTimes(1);
  });
});

describe('LeaderboardAPI', () => {
  const fetchMock = vi.fn();
  let real: typeof import('@/lib/api/leaderboard');

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  beforeAll(async () => {
    real = await vi.importActual<typeof import('@/lib/api/leaderboard')>('@/lib/api/leaderboard');
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

  it('requests the board and length from /v1/dashboard/leaderboard with the bearer token', async () => {
    fetchMock.mockResolvedValueOnce(json(200, postsBoard));

    const board = await real.LeaderboardAPI.getLeaderboard({ type: 'posts', limit: 25 });

    expect(board).toEqual(postsBoard);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    const requested = new URL(url);
    expect(requested.pathname).toBe('/v1/dashboard/leaderboard');
    expect(Object.fromEntries(requested.searchParams)).toEqual({ type: 'posts', limit: '25' });
    expect(init?.method ?? 'GET').toBe('GET');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-1');
  });

  it('leaves the defaults to the API when no board or length is given', async () => {
    fetchMock.mockResolvedValueOnce(json(200, lacesBoard));

    await real.LeaderboardAPI.getLeaderboard();

    const requested = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requested.pathname).toBe('/v1/dashboard/leaderboard');
    expect(requested.search).toBe('');
  });

  it("rejects with the API's detail message", async () => {
    fetchMock.mockResolvedValueOnce(
      json(429, { detail: 'Rate limit exceeded. Try again in 12 seconds.', retry_after: 12 }),
    );
    await expect(real.LeaderboardAPI.getLeaderboard({ type: 'laces' })).rejects.toMatchObject({
      message: 'Rate limit exceeded. Try again in 12 seconds.',
      status: 429,
    });

    fetchMock.mockResolvedValueOnce(json(403, { detail: 'Inactive user' }));
    await expect(real.LeaderboardAPI.getLeaderboard()).rejects.toMatchObject({
      message: 'Inactive user',
      status: 403,
    });
  });

  it('names the rejected parameters when the detail is a list of validation issues', async () => {
    // The body the API sends for ?type=x&limit=abc.
    fetchMock.mockResolvedValueOnce(
      json(422, {
        detail: [
          {
            type: 'string_pattern_mismatch',
            loc: ['query', 'type'],
            msg: "String should match pattern '^(laces|posts|checkins)$'",
            input: 'x',
          },
          {
            type: 'int_parsing',
            loc: ['query', 'limit'],
            msg: 'Input should be a valid integer, unable to parse string as an integer',
            input: 'abc',
          },
        ],
      }),
    );

    const failure = await real.LeaderboardAPI.getLeaderboard({ limit: 51 }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(real.LeaderboardApiError);
    expect(failure).toMatchObject({
      status: 422,
      message:
        "type: String should match pattern '^(laces|posts|checkins)$'; " +
        'limit: Input should be a valid integer, unable to parse string as an integer',
    });
  });

  it('renews an expired session once and then returns the board', async () => {
    storeTokens({ access_token: 'expired', refresh_token: 'refresh-1', token_type: 'bearer' });
    fetchMock
      .mockResolvedValueOnce(json(401, { detail: 'Could not validate credentials' }))
      .mockResolvedValueOnce(json(200, { access_token: 'access-2', refresh_token: 'refresh-2', token_type: 'bearer' }))
      .mockResolvedValueOnce(json(200, checkinsBoard));

    await expect(real.LeaderboardAPI.getLeaderboard({ type: 'checkins', limit: 10 })).resolves.toEqual(checkinsBoard);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, init] = fetchMock.mock.calls[2] as [string, RequestInit | undefined];
    expect(new URL(url).pathname).toBe('/v1/dashboard/leaderboard');
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual({ type: 'checkins', limit: '10' });
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-2');
  });

  it("rejects with the API's reason when the session cannot be renewed", async () => {
    // Already on the login page, so ending the session does not navigate (jsdom cannot).
    const before = window.location.pathname;
    window.history.replaceState(null, '', '/login');
    try {
      fetchMock.mockResolvedValueOnce(json(401, { detail: 'Not authenticated' }));

      await expect(real.LeaderboardAPI.getLeaderboard()).rejects.toMatchObject({
        message: 'Not authenticated',
        status: 401,
      });
    } finally {
      window.history.replaceState(null, '', before);
    }
  });

  it('explains a request that never reached the API, instead of repeating "Failed to fetch"', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(real.LeaderboardAPI.getLeaderboard({ type: 'laces', limit: 10 })).rejects.toMatchObject({
      message: 'Could not reach the server. Check your connection and try again.',
      status: 0,
    });
  });

  it('falls back to a message of its own when the answer is not the API\'s JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('upstream unavailable', { status: 503 }));
    await expect(real.LeaderboardAPI.getLeaderboard()).rejects.toMatchObject({
      message: 'Could not load the leaderboard (HTTP 503)',
      status: 503,
    });

    fetchMock.mockResolvedValueOnce(json(500, { detail: '' }));
    await expect(real.LeaderboardAPI.getLeaderboard()).rejects.toThrow('Could not load the leaderboard (HTTP 500)');

    fetchMock.mockResolvedValueOnce(new Response('<html>gateway</html>', { status: 200 }));
    await expect(real.LeaderboardAPI.getLeaderboard()).rejects.toThrow(
      "Could not load the leaderboard: the server's answer could not be read",
    );
  });
});
