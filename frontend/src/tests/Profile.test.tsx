import { StrictMode, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Profile from '../app/routes/profile';
import { UsersAPI, UsersApiError } from '@/lib/api/users';
import type { ProfileStats, UpdateProfileRequest, UserPost, UserProfile } from '@/lib/api/users';
import { renderWithProviders } from './test-utils';

// Only the calls are replaced: the error class and the limits are the real ones.
vi.mock('@/lib/api/users', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/users')>();
  return {
    ...actual,
    UsersAPI: {
      getMe: vi.fn(),
      updateMe: vi.fn(),
      getStats: vi.fn(),
      getPosts: vi.fn(),
    },
  };
});

const api = vi.mocked(UsersAPI);

const USER_ID = '9b2f6c1e-3d4a-4f7b-8a55-0c1d2e3f4a5b';

const scout: UserProfile = {
  user_id: USER_ID,
  username: 'sole_scout',
  email: 'scout@example.com',
  display_name: 'Sole Scout',
  avatar_url: null,
  is_anonymous: false,
  bio: 'Lining up since 2009.',
  location: 'Boston, MA',
  website_url: 'https://solescout.example.com',
  laces_balance: 4321,
  is_verified: true,
  created_at: '2024-03-15T12:00:00Z',
};

/** An account that has filled in nothing and hides its name from other members. */
const newcomer: UserProfile = {
  user_id: '1c0ffee0-0000-4000-8000-00000000beef',
  username: 'quiet_one',
  email: 'quiet@example.com',
  display_name: 'Quiet One',
  avatar_url: null,
  is_anonymous: true,
  bio: null,
  location: null,
  website_url: null,
  laces_balance: 100,
  is_verified: false,
  created_at: null,
};

const stats: ProfileStats = {
  lacesBalance: 4321,
  lacesEarnedToday: 15,
  lacesEarnedThisWeek: 135,
  lacesEarnedLastWeek: 60,
  weeklyGrowth: 125,
  activeSignals: 9,
  nearbyActivity: null,
  communityRank: 7,
  totalUsers: 58,
  totalViews: 2468,
  signalsPosted: 23,
  checkIns: 11,
  updatedAt: '2026-11-11T02:07:43.359084+00:00',
};

const pinnedPrivatePost: UserPost = {
  post_id: '4158c5ff-3039-432c-a9f3-72e37c67f636',
  user_id: USER_ID,
  post_type: 'SPOTTED',
  content_text: 'Restock on the wall at Bodega',
  media_url: null,
  tags: ['jordan', 'restock'],
  visibility: 'private',
  timestamp: '2026-11-10T18:30:00Z',
  boost_score: 40,
  geo_tag_lat: 42.35,
  geo_tag_long: -71.06,
};

const publicPost: UserPost = {
  post_id: 'dc8e9b15-1443-4389-be65-dc178407f27f',
  user_id: USER_ID,
  post_type: 'LINE_UPDATE',
  content_text: 'Line is around the block already',
  media_url: null,
  tags: null,
  visibility: 'public',
  timestamp: '2026-11-09T07:05:00Z',
  boost_score: 0,
  geo_tag_lat: null,
  geo_tag_long: null,
};

/** What the fake API holds for the signed-in user; PATCH changes it, GET reads it. */
let account: UserProfile;

function region(name: string) {
  return screen.getByRole('region', { name });
}

function stat(name: string) {
  return screen.getByRole('group', { name });
}

function openTab(name: string) {
  // Radix tabs change on mouse down, not on click.
  fireEvent.mouseDown(screen.getByRole('tab', { name }));
}

async function renderProfile() {
  const view = renderWithProviders(<Profile />);
  await screen.findByRole('heading', { level: 1 });
  return view;
}

async function startEditing() {
  await renderProfile();
  fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
  return screen.getByRole('form', { name: 'Edit profile' });
}

function type(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
}

/** Lets everything that is already queued (promises, timers of 0 ms) run. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The page behind a button that leaves it and comes back, as a route change does. */
function Visits() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen((current) => !current)}>
        {open ? 'Leave the page' : 'Come back'}
      </button>
      {open && <Profile />}
    </>
  );
}

beforeEach(() => {
  account = scout;
  api.getMe.mockReset().mockImplementation(async () => account);
  api.updateMe.mockReset().mockImplementation(async (changes: UpdateProfileRequest) => {
    account = { ...account, ...changes };
    return account;
  });
  api.getStats.mockReset().mockResolvedValue(stats);
  api.getPosts.mockReset().mockResolvedValue([pinnedPrivatePost, publicPost]);
});

describe('Profile: identity', () => {
  it('shows a loading state and then the signed-in user from the API', async () => {
    let finish: (value: UserProfile) => void = () => {};
    api.getMe.mockReturnValue(new Promise<UserProfile>((resolve) => (finish = resolve)));

    const { container } = renderWithProviders(<Profile />);

    expect(screen.getByRole('status', { name: 'Loading profile' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();

    finish(scout);

    expect(await screen.findByRole('heading', { level: 1, name: 'Sole Scout' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading profile' })).not.toBeInTheDocument();

    const header = region('Profile');
    expect(within(header).getByText('@sole_scout')).toBeInTheDocument();
    expect(within(header).getByText('Verified')).toBeInTheDocument();
    expect(within(header).queryByText('Anonymous to others')).not.toBeInTheDocument();
    expect(within(header).getByText('SS')).toBeInTheDocument(); // initials, as there is no avatar
    const joined = container.querySelector('time[datetime="2024-03-15T12:00:00Z"]');
    expect(joined).toHaveTextContent('2024');

    const about = region('About');
    expect(within(about).getByText('Lining up since 2009.')).toBeInTheDocument();
    expect(within(about).getByText('Boston, MA')).toBeInTheDocument();
    expect(within(about).getByRole('link', { name: 'https://solescout.example.com' })).toHaveAttribute(
      'href',
      'https://solescout.example.com',
    );
    expect(within(about).getByText('scout@example.com')).toBeInTheDocument();
  });

  it('shows what another account holds, with empty states for what it has not filled in', async () => {
    account = newcomer;

    await renderProfile();

    expect(screen.getByRole('heading', { level: 1, name: 'Quiet One' })).toBeInTheDocument();
    const header = region('Profile');
    expect(within(header).getByText('@quiet_one')).toBeInTheDocument();
    expect(within(header).getByText('Anonymous to others')).toBeInTheDocument();
    expect(within(header).queryByText('Verified')).not.toBeInTheDocument();
    expect(within(header).queryByText(/Joined/)).not.toBeInTheDocument();

    const about = region('About');
    expect(within(about).getByText(/No bio yet/)).toBeInTheDocument();
    expect(within(about).getAllByText('Not specified')).toHaveLength(2); // location and website
    expect(within(about).queryByRole('link')).not.toBeInTheDocument();
    expect(within(about).getByText('quiet@example.com')).toBeInTheDocument();
    expect(within(stat('LACES Balance')).getByText('100')).toBeInTheDocument();
  });

  it('has none of the invented profile, achievements or notification settings', async () => {
    await renderProfile();

    // The auth context of the test harness holds "Test User": the page must not read it.
    expect(screen.queryByText('Test User')).not.toBeInTheDocument();
    expect(screen.queryByText(/John Doe|johndoe|San Francisco/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Overview', 'Posts', 'Settings']);

    openTab('Settings');
    expect(screen.getByText('Privacy Settings')).toBeInTheDocument();
    expect(screen.queryByText(/Notification/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Achievement/)).not.toBeInTheDocument();
  });

  it('goes by the username when the stored display name is blank', async () => {
    // Registration accepts a display name made of spaces only.
    account = { ...newcomer, display_name: '   ' };

    await renderProfile();

    expect(screen.getByRole('heading', { level: 1, name: 'quiet_one' })).toBeInTheDocument();
    expect(within(region('Profile')).getByText('Q')).toBeInTheDocument(); // initial of the username
  });

  it('lets a name, bio, location or tag that is one long word break instead of widening the page', async () => {
    // jsdom has no layout, so this only checks that every text a member typed carries the
    // rule that was measured in Chrome (100 to 500 characters without a space, 390px wide).
    const breakable = '[overflow-wrap:anywhere]';
    account = { ...scout, display_name: 'W'.repeat(100), bio: 'M'.repeat(500), location: 'L'.repeat(100) };
    api.getPosts.mockResolvedValue([{ ...publicPost, content_text: 'P'.repeat(300), tags: ['t'.repeat(50)] }]);

    await renderProfile();

    expect(screen.getByRole('heading', { level: 1, name: 'W'.repeat(100) })).toHaveClass(breakable);
    expect(screen.getByText('@sole_scout')).toHaveClass(breakable);
    expect(screen.getByText('M'.repeat(500))).toHaveClass(breakable);
    expect(screen.getByText('L'.repeat(100))).toHaveClass(breakable);

    openTab('Posts');
    expect(await screen.findByText('P'.repeat(300))).toHaveClass(breakable);
    expect(screen.getByText(`#${'t'.repeat(50)}`)).toHaveClass(breakable);
  });

  it('shows a stored website that is not a web address as text, never as a link', async () => {
    account = { ...scout, website_url: 'javascript:alert(document.cookie)' };

    await renderProfile();

    const about = region('About');
    expect(within(about).getByText('javascript:alert(document.cookie)')).toBeInTheDocument();
    expect(within(about).queryByRole('link')).not.toBeInTheDocument();
  });

  it('reloads on every visit, and keeps the last loaded profile, stats and posts when that fails', async () => {
    renderWithProviders(<Visits />);
    await screen.findByRole('heading', { level: 1, name: 'Sole Scout' });
    await screen.findByRole('group', { name: 'Community Rank' });
    openTab('Posts');
    await screen.findByText('Restock on the wall at Bodega');

    fireEvent.click(screen.getByRole('button', { name: 'Leave the page' }));
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();

    api.getMe.mockRejectedValueOnce(new Error('Service unavailable'));
    api.getStats.mockRejectedValueOnce(new Error('Stats are down'));
    api.getPosts.mockRejectedValueOnce(new Error('Posts are down'));
    fireEvent.click(screen.getByRole('button', { name: 'Come back' }));

    // What was loaded before is on screen at once, and both requests are made again.
    expect(screen.getByRole('heading', { level: 1, name: 'Sole Scout' })).toBeInTheDocument();
    expect(
      await screen.findByText('Could not refresh your profile. Showing the last loaded details.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Service unavailable')).toBeInTheDocument();
    expect(
      await screen.findByText('Could not refresh your stats. Showing the last loaded numbers.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Stats are down')).toBeInTheDocument();
    expect(within(stat('Community Rank')).getByText('#7')).toBeInTheDocument();
    expect(within(region('About')).getByText('Lining up since 2009.')).toBeInTheDocument();
    expect(api.getMe).toHaveBeenCalledTimes(2);
    expect(api.getStats).toHaveBeenCalledTimes(2);

    openTab('Posts');
    expect(
      await screen.findByText('Could not refresh your posts. Showing the last loaded list.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Posts are down')).toBeInTheDocument();
    expect(within(region('Recent Posts')).getAllByRole('listitem')).toHaveLength(2);
    expect(api.getPosts).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading profile' }));
    await waitFor(() =>
      expect(
        screen.queryByText('Could not refresh your profile. Showing the last loaded details.'),
      ).not.toBeInTheDocument(),
    );
    expect(api.getMe).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading posts' }));
    await waitFor(() => expect(within(region('Recent Posts')).queryByRole('alert')).not.toBeInTheDocument());
    expect(api.getPosts).toHaveBeenCalledTimes(3);
  });

  it('makes each request once and works the same under React strict mode', async () => {
    renderWithProviders(
      <StrictMode>
        <Profile />
      </StrictMode>,
    );
    await screen.findByRole('heading', { level: 1, name: 'Sole Scout' });
    await screen.findByRole('group', { name: 'Community Rank' });
    expect(api.getMe).toHaveBeenCalledTimes(1);
    expect(api.getStats).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
    expect(screen.getByLabelText(/Display name/)).toHaveFocus();
    type(/Display name/, 'Night Owl');
    save();

    expect(await screen.findByRole('heading', { level: 1, name: 'Night Owl' })).toBeInTheDocument();
    expect(api.updateMe).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Edit Profile' })).toHaveFocus();

    openTab('Settings');
    fireEvent.click(screen.getByRole('switch', { name: 'Appear as anonymous' }));
    expect(await screen.findByText('Saved. Other members now see you as anonymous.')).toBeInTheDocument();
    expect(api.updateMe).toHaveBeenCalledTimes(2);
    expect(api.updateMe).toHaveBeenLastCalledWith({ is_anonymous: true });

    openTab('Posts');
    await screen.findByText('Restock on the wall at Bodega');
    expect(api.getPosts).toHaveBeenCalledTimes(1);
  });

  it('reports a failed profile request and loads it on retry', async () => {
    api.getMe.mockRejectedValueOnce(new Error('Could not validate credentials'));

    renderWithProviders(<Profile />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load your profile');
    expect(alert).toHaveTextContent('Could not validate credentials');
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading profile' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Sole Scout' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.getMe).toHaveBeenCalledTimes(2);
  });
});

describe('Profile: stats', () => {
  it('shows the balance, rank, signals and check-ins the API reports', async () => {
    await renderProfile();

    expect(within(stat('LACES Balance')).getByText('4,321')).toBeInTheDocument();
    expect(await within(stat('LACES Balance')).findByText('135 earned this week')).toBeInTheDocument();
    expect(within(stat('Community Rank')).getByText('#7')).toBeInTheDocument();
    expect(within(stat('Community Rank')).getByText('of 58 members')).toBeInTheDocument();
    expect(within(stat('Signals Posted')).getByText('23')).toBeInTheDocument();
    expect(within(stat('Signals Posted')).getByText('2,468 views')).toBeInTheDocument();
    expect(within(stat('Check-ins')).getByText('11')).toBeInTheDocument();
  });

  it('shows zeros for an account with no activity', async () => {
    api.getStats.mockResolvedValue({
      ...stats,
      lacesEarnedThisWeek: 0,
      communityRank: 1,
      totalUsers: 1,
      totalViews: 1,
      signalsPosted: 0,
      checkIns: 0,
    });

    await renderProfile();

    const rank = await screen.findByRole('group', { name: 'Community Rank' });
    expect(within(rank).getByText('#1')).toBeInTheDocument();
    expect(within(rank).getByText('of 1 member')).toBeInTheDocument();
    expect(within(stat('Signals Posted')).getByText('0')).toBeInTheDocument();
    expect(within(stat('Signals Posted')).getByText('1 view')).toBeInTheDocument();
    expect(within(stat('Check-ins')).getByText('0')).toBeInTheDocument();
    expect(within(stat('LACES Balance')).getByText('0 earned this week')).toBeInTheDocument();
  });

  it('shows a loading state while the stats are on their way', async () => {
    api.getStats.mockReturnValue(new Promise<ProfileStats>(() => {}));

    await renderProfile();

    expect(screen.getByRole('status', { name: 'Loading stats' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Community Rank' })).not.toBeInTheDocument();
    // The balance comes with the profile, so it does not wait for the stats.
    expect(within(stat('LACES Balance')).getByText('4,321')).toBeInTheDocument();
  });

  it('reports failed stats and loads them on retry', async () => {
    api.getStats.mockRejectedValueOnce(new Error('Could not load your stats (HTTP 500)'));

    await renderProfile();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load your rank and activity');
    expect(alert).toHaveTextContent('Could not load your stats (HTTP 500)');
    expect(screen.queryByRole('group', { name: 'Community Rank' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Sole Scout' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading stats' }));

    expect(await within(await screen.findByRole('group', { name: 'Community Rank' })).findByText('#7')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Profile: recent posts', () => {
  it("asks for the signed-in user's latest posts and lists them", async () => {
    await renderProfile();
    expect(api.getPosts).not.toHaveBeenCalled();

    openTab('Posts');

    const first = (await screen.findByText('Restock on the wall at Bodega')).closest('li');
    expect(api.getPosts).toHaveBeenCalledTimes(1);
    expect(api.getPosts).toHaveBeenCalledWith(USER_ID, { limit: 5 });

    expect(first).not.toBeNull();
    const firstRow = within(first as HTMLElement);
    expect(firstRow.getByText('Spotted')).toBeInTheDocument();
    expect(firstRow.getByText('Private')).toBeInTheDocument();
    expect(firstRow.getByText('40 LACES in boosts')).toBeInTheDocument();
    expect(firstRow.getByText('Pinned to a location')).toBeInTheDocument();
    expect(firstRow.getByText('#jordan')).toBeInTheDocument();
    expect(firstRow.getByText('#restock')).toBeInTheDocument();
    expect(first?.querySelector('time')).toHaveAttribute('datetime', '2026-11-10T18:30:00Z');

    const second = screen.getByText('Line is around the block already').closest('li');
    const secondRow = within(second as HTMLElement);
    expect(secondRow.getByText('Line update')).toBeInTheDocument();
    expect(secondRow.getByText('0 LACES in boosts')).toBeInTheDocument();
    expect(secondRow.queryByText('Private')).not.toBeInTheDocument();
    expect(secondRow.queryByText('Pinned to a location')).not.toBeInTheDocument();

    expect(within(region('Recent Posts')).getAllByRole('listitem')).toHaveLength(2);
  });

  it('lists a post without text, posts for a limited audience and a tag used twice', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.getPosts.mockResolvedValue([
      {
        ...publicPost,
        post_id: '241122af-2726-43c2-ab40-e58e575521cd',
        post_type: 'HEAT_CHECK',
        content_text: null,
        visibility: 'friends',
        tags: ['dunk', 'dunk', 'sb'],
      },
      {
        ...publicPost,
        post_id: 'afc9b652-ce10-464c-b2b0-924c6562de7a',
        post_type: 'INTEL_REPORT',
        content_text: '   ',
        visibility: 'local',
      },
    ]);

    await renderProfile();
    openTab('Posts');

    const [first, second] = await within(region('Recent Posts')).findAllByRole('listitem');
    expect(within(first).getByText('Heat check')).toBeInTheDocument();
    expect(within(first).getByText('Friends')).toBeInTheDocument();
    expect(within(first).getByText('This post has no text.')).toBeInTheDocument();
    expect(within(first).getAllByText('#dunk')).toHaveLength(2);
    expect(within(first).getByText('#sb')).toBeInTheDocument();

    expect(within(second).getByText('Intel report')).toBeInTheDocument();
    expect(within(second).getByText('Local')).toBeInTheDocument();
    expect(within(second).getByText('This post has no text.')).toBeInTheDocument();

    // React reports list items that share a key through console.error.
    expect(consoleError.mock.calls.flat().map(String).join('\n')).not.toMatch(/same key/);
    consoleError.mockRestore();
  });

  it('says so when the user has not posted yet', async () => {
    api.getPosts.mockResolvedValue([]);

    await renderProfile();
    openTab('Posts');

    expect(await screen.findByText('You have not posted anything yet.')).toBeInTheDocument();
    expect(within(region('Recent Posts')).queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('shows a loading state, reports a failed request and loads the posts on retry', async () => {
    let fail: (reason: Error) => void = () => {};
    api.getPosts.mockReturnValueOnce(new Promise<UserPost[]>((_, reject) => (fail = reject)));

    await renderProfile();
    openTab('Posts');

    expect(await screen.findByRole('status', { name: 'Loading posts' })).toBeInTheDocument();

    fail(new Error('Could not load your posts (HTTP 503)'));

    const alert = await within(region('Recent Posts')).findByRole('alert');
    expect(alert).toHaveTextContent('Could not load your posts');
    expect(alert).toHaveTextContent('HTTP 503');
    expect(screen.queryByRole('status', { name: 'Loading posts' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading posts' }));

    expect(await screen.findByText('Restock on the wall at Bodega')).toBeInTheDocument();
    expect(within(region('Recent Posts')).queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Profile: editing', () => {
  it('fills the form with the saved values', async () => {
    await startEditing();

    expect(screen.getByLabelText(/Display name/)).toHaveValue('Sole Scout');
    expect(screen.getByLabelText('Bio')).toHaveValue('Lining up since 2009.');
    expect(screen.getByLabelText('Location')).toHaveValue('Boston, MA');
    expect(screen.getByLabelText('Website')).toHaveValue('https://solescout.example.com');
    expect(screen.getByLabelText('Avatar URL')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Edit Profile' })).not.toBeInTheDocument();
  });

  it('saves only the changed fields and shows what the API answered', async () => {
    await startEditing();

    type(/Display name/, '  Night Owl  ');
    type('Bio', 'Up before the trucks arrive.');
    type('Website', ''); // cleared
    type('Avatar URL', 'https://cdn.example.com/owl.png');
    save();

    expect(await screen.findByRole('heading', { level: 1, name: 'Night Owl' })).toBeInTheDocument();
    expect(api.updateMe).toHaveBeenCalledTimes(1);
    expect(api.updateMe).toHaveBeenCalledWith({
      display_name: 'Night Owl',
      bio: 'Up before the trucks arrive.',
      website_url: null,
      avatar_url: 'https://cdn.example.com/owl.png',
    });

    expect(screen.queryByRole('form', { name: 'Edit profile' })).not.toBeInTheDocument();
    const about = region('About');
    expect(within(about).getByRole('status')).toHaveTextContent('Profile updated.');
    expect(within(about).getByText('Up before the trucks arrive.')).toBeInTheDocument();
    expect(within(about).getByText('Boston, MA')).toBeInTheDocument(); // untouched
    expect(within(about).queryByRole('link')).not.toBeInTheDocument();
    expect(within(about).getByText('Not specified')).toBeInTheDocument();
    expect(screen.queryByText('Sole Scout')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Profile' })).toBeInTheDocument();
  });

  it('makes the rest of the app reload the signed-in user after a save', async () => {
    // Stands in for the app shell, which reads the user from the ['currentUser'] query, and
    // for the dashboard and leaderboard pages, whose lists show the user's name and avatar.
    const loadShellUser = vi.fn(async () => account.display_name);
    const loadDashboard = vi.fn(async () => 'activity');
    const loadLeaderboard = vi.fn(async () => 'leaders');
    function Shell() {
      const { data } = useQuery({ queryKey: ['currentUser'], queryFn: loadShellUser, staleTime: Infinity });
      useQuery({ queryKey: ['dashboard', 'activity'], queryFn: loadDashboard, staleTime: Infinity });
      useQuery({ queryKey: ['leaderboard', 'laces', 10], queryFn: loadLeaderboard, staleTime: Infinity });
      return <p data-testid="shell-user">{data}</p>;
    }
    renderWithProviders(
      <>
        <Shell />
        <Profile />
      </>,
    );
    await screen.findByRole('heading', { level: 1, name: 'Sole Scout' });
    await waitFor(() => expect(screen.getByTestId('shell-user')).toHaveTextContent('Sole Scout'));
    expect(loadShellUser).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
    type(/Display name/, 'Night Owl');
    save();

    await waitFor(() => expect(screen.getByTestId('shell-user')).toHaveTextContent('Night Owl'));
    expect(loadShellUser).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(loadDashboard).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(loadLeaderboard).toHaveBeenCalledTimes(2));
  });

  it('does not let a profile reload that started before the save overwrite what was saved', async () => {
    renderWithProviders(<Visits />);
    await screen.findByRole('heading', { level: 1, name: 'Sole Scout' });
    fireEvent.click(screen.getByRole('button', { name: 'Leave the page' }));

    // Coming back starts a reload, and this one is slow to answer.
    let answerReload: (value: UserProfile) => void = () => {};
    api.getMe.mockReturnValueOnce(new Promise<UserProfile>((resolve) => (answerReload = resolve)));
    fireEvent.click(screen.getByRole('button', { name: 'Come back' }));
    await waitFor(() => expect(api.getMe).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
    type(/Display name/, 'Night Owl');
    save();
    expect(await screen.findByRole('heading', { level: 1, name: 'Night Owl' })).toBeInTheDocument();

    // The reload answers only now, with the account as it was before the save.
    answerReload(scout);
    await settle();

    expect(screen.getByRole('heading', { level: 1, name: 'Night Owl' })).toBeInTheDocument();
    expect(screen.queryByText('Sole Scout')).not.toBeInTheDocument();
  });

  it('moves the focus into the form when it opens and back to the Edit button when it closes', async () => {
    await startEditing();
    expect(screen.getByLabelText(/Display name/)).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Edit Profile' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
    expect(screen.getByLabelText(/Display name/)).toHaveFocus();
    type('Bio', 'Up before the trucks arrive.');
    save();

    const about = await screen.findByRole('region', { name: 'About' });
    expect(within(about).getByText('Up before the trucks arrive.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Profile' })).toHaveFocus();
  });

  it('confirms a save that was answered while another tab was open, without taking the focus', async () => {
    let answer: () => void = () => {};
    api.updateMe.mockImplementationOnce(
      (changes: UpdateProfileRequest) =>
        new Promise<UserProfile>((resolve) => {
          answer = () => {
            account = { ...account, ...changes };
            resolve(account);
          };
        }),
    );
    await startEditing();
    type(/Display name/, 'Night Owl');
    save();
    await waitFor(() => expect(api.updateMe).toHaveBeenCalledTimes(1));

    openTab('Posts');
    await screen.findByText('Restock on the wall at Bodega');
    answer();

    expect(await screen.findByRole('heading', { level: 1, name: 'Night Owl' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Edit Profile' })).not.toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Posts' })).toHaveAttribute('aria-selected', 'true');

    // The confirmation waits on the tab the form was on, and goes once that tab is left.
    openTab('Overview');
    expect(within(region('About')).getByRole('status')).toHaveTextContent('Profile updated.');
    openTab('Posts');
    openTab('Overview');
    expect(within(region('About')).getByRole('status')).toBeEmptyDOMElement();
  });

  it('saves one change at a time, so an older answer cannot overwrite a newer one', async () => {
    let answerFirst: () => void = () => {};
    api.updateMe.mockImplementationOnce(
      (changes: UpdateProfileRequest) =>
        new Promise<UserProfile>((resolve) => {
          answerFirst = () => {
            account = { ...account, ...changes };
            resolve(account);
          };
        }),
    );
    await startEditing();
    type(/Display name/, 'Night Owl');
    save();
    await waitFor(() => expect(api.updateMe).toHaveBeenCalledTimes(1));

    // The form's save is still on its way when the privacy switch is used.
    openTab('Settings');
    const anonymous = screen.getByRole('switch', { name: 'Appear as anonymous' });
    fireEvent.click(anonymous);
    await waitFor(() => expect(anonymous).toBeDisabled());
    expect(anonymous).toHaveAttribute('aria-checked', 'true');
    await settle();
    expect(api.updateMe).toHaveBeenCalledTimes(1);

    answerFirst();

    expect(await screen.findByText('Saved. Other members now see you as anonymous.')).toBeInTheDocument();
    expect(api.updateMe).toHaveBeenCalledTimes(2);
    expect(api.updateMe).toHaveBeenLastCalledWith({ is_anonymous: true });
    expect(screen.getByRole('heading', { level: 1, name: 'Night Owl' })).toBeInTheDocument();
    expect(within(region('Profile')).getByText('Anonymous to others')).toBeInTheDocument();
  });

  it('does not call the API when nothing was changed', async () => {
    await startEditing();

    save();

    expect(await within(region('About')).findByRole('status')).toHaveTextContent('No changes to save.');
    expect(api.updateMe).not.toHaveBeenCalled();
    expect(screen.queryByRole('form', { name: 'Edit profile' })).not.toBeInTheDocument();
  });

  it('discards the edits on cancel', async () => {
    await startEditing();

    type(/Display name/, 'Somebody Else');
    type('Bio', 'Never saved');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('form', { name: 'Edit profile' })).not.toBeInTheDocument();
    expect(api.updateMe).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Sole Scout' })).toBeInTheDocument();
    expect(within(region('About')).getByText('Lining up since 2009.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
    expect(screen.getByLabelText(/Display name/)).toHaveValue('Sole Scout');
    expect(screen.getByLabelText('Bio')).toHaveValue('Lining up since 2009.');
  });

  it('keeps what was typed while another tab is looked at', async () => {
    await startEditing();
    type('Bio', 'Half-written thought');

    openTab('Posts');
    expect(await screen.findByText('Restock on the wall at Bodega')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Edit profile' })).not.toBeInTheDocument(); // hidden, not gone

    openTab('Overview');
    expect(screen.getByRole('form', { name: 'Edit profile' })).toBeInTheDocument();
    expect(screen.getByLabelText('Bio')).toHaveValue('Half-written thought');
    expect(api.updateMe).not.toHaveBeenCalled();
  });

  it('requires a display name', async () => {
    await startEditing();

    type(/Display name/, '   ');
    save();

    const field = screen.getByLabelText(/Display name/);
    expect(await screen.findByText('Display name is required')).toHaveAttribute('role', 'alert');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(/Display name is required/);
    expect(field).toHaveFocus();
    expect(api.updateMe).not.toHaveBeenCalled();
    expect(screen.getByRole('form', { name: 'Edit profile' })).toBeInTheDocument();

    // The message goes away once the field is corrected, and the save goes through.
    type(/Display name/, 'Night Owl');
    expect(screen.queryByText('Display name is required')).not.toBeInTheDocument();
    save();
    expect(await screen.findByRole('heading', { level: 1, name: 'Night Owl' })).toBeInTheDocument();
    expect(api.updateMe).toHaveBeenCalledWith({ display_name: 'Night Owl' });
  });

  it('enforces the length limits of the API', async () => {
    await startEditing();

    type(/Display name/, 'n'.repeat(101));
    type('Bio', 'b'.repeat(501));
    type('Location', 'l'.repeat(101));
    expect(screen.getByText('501/500 characters')).toBeInTheDocument();
    save();

    expect(await screen.findByText('Display name must be 100 characters or fewer')).toBeInTheDocument();
    expect(screen.getByText('Bio must be 500 characters or fewer')).toBeInTheDocument();
    expect(screen.getByText('Location must be 100 characters or fewer')).toBeInTheDocument();
    expect(api.updateMe).not.toHaveBeenCalled();

    // Exactly at the limits is fine.
    type(/Display name/, 'n'.repeat(100));
    type('Bio', 'b'.repeat(500));
    type('Location', 'l'.repeat(100));
    save();

    await waitFor(() => expect(api.updateMe).toHaveBeenCalledTimes(1));
    expect(api.updateMe).toHaveBeenCalledWith({
      display_name: 'n'.repeat(100),
      bio: 'b'.repeat(500),
      location: 'l'.repeat(100),
    });
  });

  it.each([
    ['javascript:alert(1)'],
    ['solescout.example.com'],
    ['ftp://example.com/kicks'],
    ['https://'],
    ['https://exa mple.com'],
  ])('refuses %s as a website or avatar link', async (link) => {
    await startEditing();

    type('Website', link);
    type('Avatar URL', link);
    save();

    expect(
      await screen.findByText('Website must be a link starting with http:// or https://'),
    ).toBeInTheDocument();
    expect(screen.getByText('Avatar URL must be a link starting with http:// or https://')).toBeInTheDocument();
    expect(screen.getByLabelText('Website')).toHaveAttribute('aria-invalid', 'true');
    expect(api.updateMe).not.toHaveBeenCalled();
  });

  it('keeps the form open and reports why when the API refuses the save', async () => {
    api.updateMe.mockRejectedValueOnce(new UsersApiError(403, 'Inactive user'));
    await startEditing();

    type(/Display name/, 'Night Owl');
    save();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your profile was not saved: Inactive user');
    expect(screen.getByRole('form', { name: 'Edit profile' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Display name/)).toHaveValue('Night Owl'); // the input is not lost
    expect(screen.getByRole('heading', { level: 1, name: 'Sole Scout' })).toBeInTheDocument();
    expect(within(region('Edit Profile')).getByRole('status')).toBeEmptyDOMElement();

    // Saving again works, and the error is gone.
    save();
    expect(await screen.findByRole('heading', { level: 1, name: 'Night Owl' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.updateMe).toHaveBeenCalledTimes(2);
  });

  it('shows the validation messages of the API next to the fields they are about', async () => {
    api.updateMe.mockRejectedValueOnce(
      new UsersApiError(422, 'website_url: URL must start with http:// or https://', {
        website_url: 'URL must start with http:// or https://',
      }),
    );
    await startEditing();

    type('Website', 'https://night-owl.example.com');
    save();

    const website = screen.getByLabelText('Website');
    await waitFor(() => expect(website).toHaveAttribute('aria-invalid', 'true'));
    expect(website).toHaveAccessibleDescription('URL must start with http:// or https://');
    expect(screen.getByText(/some fields were not accepted/)).toHaveAttribute('role', 'alert');
    expect(screen.getByLabelText('Bio')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByRole('form', { name: 'Edit profile' })).toBeInTheDocument();
    expect(within(region('Profile')).queryByText('Anonymous to others')).not.toBeInTheDocument();
  });
});

describe('Profile: privacy', () => {
  it('shows the saved setting and turns anonymity on through the API', async () => {
    await renderProfile();
    openTab('Settings');

    const anonymous = screen.getByRole('switch', { name: 'Appear as anonymous' });
    expect(anonymous).toHaveAttribute('aria-checked', 'false');
    expect(within(region('Privacy Settings')).getByRole('status')).toBeEmptyDOMElement();

    fireEvent.click(anonymous);

    expect(await screen.findByText('Saved. Other members now see you as anonymous.')).toHaveAttribute(
      'role',
      'status',
    );
    expect(api.updateMe).toHaveBeenCalledTimes(1);
    expect(api.updateMe).toHaveBeenCalledWith({ is_anonymous: true });
    expect(anonymous).toHaveAttribute('aria-checked', 'true');
    expect(anonymous).toBeEnabled();
    expect(within(region('Profile')).getByText('Anonymous to others')).toBeInTheDocument();
  });

  it('turns anonymity off for an account that has it on', async () => {
    account = newcomer;
    await renderProfile();
    openTab('Settings');

    const anonymous = screen.getByRole('switch', { name: 'Appear as anonymous' });
    expect(anonymous).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(anonymous);

    expect(
      await screen.findByText('Saved. Other members now see your username and avatar.'),
    ).toBeInTheDocument();
    expect(api.updateMe).toHaveBeenCalledWith({ is_anonymous: false });
    expect(anonymous).toHaveAttribute('aria-checked', 'false');
    expect(within(region('Profile')).queryByText('Anonymous to others')).not.toBeInTheDocument();
  });

  it('puts the switch back and reports why when the API refuses the change', async () => {
    api.updateMe.mockRejectedValueOnce(new UsersApiError(0, 'Could not reach the server. Check your connection and try again.'));
    await renderProfile();
    openTab('Settings');

    const anonymous = screen.getByRole('switch', { name: 'Appear as anonymous' });
    fireEvent.click(anonymous);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your privacy setting was not changed: Could not reach the server.');
    expect(anonymous).toHaveAttribute('aria-checked', 'false');
    expect(anonymous).toBeEnabled();
    expect(within(region('Profile')).queryByText('Anonymous to others')).not.toBeInTheDocument();
    expect(within(region('Privacy Settings')).getByRole('status')).toBeEmptyDOMElement();
  });

  it('keeps a change that is still being saved, and its failure, while another tab is looked at', async () => {
    let fail: (reason: Error) => void = () => {};
    api.updateMe.mockReturnValueOnce(new Promise<UserProfile>((_, reject) => (fail = reject)));
    await renderProfile();
    openTab('Settings');

    fireEvent.click(screen.getByRole('switch', { name: 'Appear as anonymous' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Appear as anonymous' })).toBeDisabled());

    // Away and back while the request is on its way: still saving, still showing what was asked for.
    openTab('Posts');
    openTab('Settings');
    const pending = screen.getByRole('switch', { name: 'Appear as anonymous' });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-checked', 'true');
    expect(api.updateMe).toHaveBeenCalledTimes(1);

    // The request fails while the user is on another tab: they are told when they come back.
    openTab('Overview');
    fail(new UsersApiError(0, 'Could not reach the server. Check your connection and try again.'));
    await settle();
    openTab('Settings');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your privacy setting was not changed: Could not reach the server.',
    );
    const anonymous = screen.getByRole('switch', { name: 'Appear as anonymous' });
    expect(anonymous).toBeEnabled();
    expect(anonymous).toHaveAttribute('aria-checked', 'false');

    // Once it has been seen, leaving the tab clears it.
    openTab('Overview');
    openTab('Settings');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

/*
 * The real client, which the tests above replace. Only the network is stubbed here, so
 * these check the paths, methods, headers and bodies that are sent, and how the answers
 * of the API (copied from the running service) are read.
 */
describe('UsersAPI client', () => {
  type Client = typeof import('@/lib/api/users');
  const fetchMock = vi.fn<typeof fetch>();
  let client: Client;

  function answer(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }

  /** The n-th request that was sent. */
  function sent(index = 0) {
    const [input, init] = fetchMock.mock.calls[index];
    const url = new URL(String(input));
    return {
      path: `${url.pathname}${url.search}`,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    };
  }

  async function failure(call: Promise<unknown>) {
    const error: unknown = await call.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(client.UsersApiError);
    return error as InstanceType<Client['UsersApiError']>;
  }

  beforeEach(async () => {
    client = await vi.importActual<Client>('@/lib/api/users');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('auth_token', 'access-token-1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('reads the signed-in user from GET /auth/me with the bearer token', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, scout));

    await expect(client.UsersAPI.getMe()).resolves.toEqual(scout);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sent()).toMatchObject({ path: '/auth/me', method: 'GET' });
    expect(sent().headers.get('Authorization')).toBe('Bearer access-token-1');
  });

  it('sends the changes as JSON to PATCH /users/me and returns the updated user', async () => {
    const updated = { ...scout, display_name: 'Night Owl', website_url: null };
    fetchMock.mockResolvedValueOnce(answer(200, updated));

    await expect(client.UsersAPI.updateMe({ display_name: 'Night Owl', website_url: null })).resolves.toEqual(
      updated,
    );

    expect(sent()).toMatchObject({
      path: '/users/me',
      method: 'PATCH',
      body: { display_name: 'Night Owl', website_url: null },
    });
    expect(sent().headers.get('Content-Type')).toBe('application/json');
    expect(sent().headers.get('Authorization')).toBe('Bearer access-token-1');
  });

  it('reads the stats from GET /v1/dashboard/metrics', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, stats));

    await expect(client.UsersAPI.getStats()).resolves.toEqual(stats);

    expect(sent()).toMatchObject({ path: '/v1/dashboard/metrics', method: 'GET' });
    expect(sent().headers.get('Authorization')).toBe('Bearer access-token-1');
  });

  it("reads a user's posts from GET /posts/user/{user_id} with the paging that was asked for", async () => {
    fetchMock.mockImplementation(async () => answer(200, [pinnedPrivatePost, publicPost]));

    await expect(client.UsersAPI.getPosts(USER_ID, { limit: 5 })).resolves.toEqual([pinnedPrivatePost, publicPost]);
    await client.UsersAPI.getPosts(USER_ID, { skip: 10, limit: 5 });
    await client.UsersAPI.getPosts(USER_ID);

    expect(sent(0)).toMatchObject({ path: `/posts/user/${USER_ID}?limit=5`, method: 'GET' });
    // The author only gets their non-public posts when the token is sent.
    expect(sent(0).headers.get('Authorization')).toBe('Bearer access-token-1');
    expect(sent(1).path).toBe(`/posts/user/${USER_ID}?skip=10&limit=5`);
    expect(sent(2).path).toBe(`/posts/user/${USER_ID}`);
  });

  it('fails with the detail of the API when it is a sentence', async () => {
    fetchMock.mockResolvedValueOnce(answer(403, { detail: 'Inactive user' }));
    const forbidden = await failure(client.UsersAPI.updateMe({ bio: 'x' }));
    expect(forbidden).toMatchObject({ status: 403, message: 'Inactive user', fieldErrors: {} });

    fetchMock.mockResolvedValueOnce(
      answer(429, { detail: 'Rate limit exceeded. Try again in 12 seconds.', retry_after: 12 }),
    );
    const limited = await failure(client.UsersAPI.getStats());
    expect(limited).toMatchObject({ status: 429, message: 'Rate limit exceeded. Try again in 12 seconds.' });
  });

  it('reads the list a 422 carries into one message and a message per refused field', async () => {
    fetchMock.mockResolvedValueOnce(
      answer(422, {
        detail: [
          {
            type: 'string_too_short',
            loc: ['body', 'display_name'],
            msg: 'String should have at least 1 character',
            input: '',
          },
          {
            type: 'http_url',
            loc: ['body', 'website_url'],
            msg: 'URL must start with http:// or https://',
            input: 'javascript:alert(1)',
          },
          { type: 'extra_forbidden', loc: ['body', 'username'], msg: 'Extra inputs are not permitted', input: 'x' },
        ],
      }),
    );

    const refused = await failure(client.UsersAPI.updateMe({ display_name: '', website_url: 'javascript:alert(1)' }));

    expect(refused.status).toBe(422);
    expect(refused.message).toBe(
      'display_name: String should have at least 1 character; ' +
        'website_url: URL must start with http:// or https://; ' +
        'username: Extra inputs are not permitted',
    );
    expect(refused.fieldErrors).toEqual({
      display_name: 'String should have at least 1 character',
      website_url: 'URL must start with http:// or https://',
      username: 'Extra inputs are not permitted',
    });
  });

  it('does not treat a refused path or query value as a field of the form', async () => {
    fetchMock.mockResolvedValueOnce(
      answer(422, {
        detail: [
          {
            type: 'uuid_parsing',
            loc: ['path', 'user_id'],
            msg: 'Input should be a valid UUID',
            input: 'not-a-uuid',
          },
        ],
      }),
    );

    const refused = await failure(client.UsersAPI.getPosts('not-a-uuid'));

    expect(sent().path).toBe('/posts/user/not-a-uuid');
    expect(refused).toMatchObject({ status: 422, message: 'user_id: Input should be a valid UUID', fieldErrors: {} });
  });

  it('falls back to its own message when the answer carries no detail', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Bad Gateway</html>', { status: 502 }));
    expect(await failure(client.UsersAPI.getStats())).toMatchObject({
      status: 502,
      message: 'Could not load your stats (HTTP 502)',
    });

    fetchMock.mockResolvedValueOnce(answer(500, { error: 'boom' }));
    expect(await failure(client.UsersAPI.getMe())).toMatchObject({
      status: 500,
      message: 'Could not load your profile (HTTP 500)',
    });
  });

  it('reports an answer that says OK but cannot be read', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Welcome</html>', { status: 200 }));

    const unreadable = await failure(client.UsersAPI.getMe());

    expect(unreadable.status).toBe(200);
    expect(unreadable.message).toBe('Could not load your profile: the server sent an answer that could not be read');
  });

  it('reports an API that cannot be reached', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    expect(await failure(client.UsersAPI.updateMe({ is_anonymous: true }))).toMatchObject({
      status: 0,
      message: 'Could not reach the server. Check your connection and try again.',
    });
  });

  it('ends the session and reports the 401 when the token is no longer accepted', async () => {
    // On the login page already, so ending the session does not navigate (jsdom cannot).
    window.history.pushState({}, '', '/login');
    try {
      fetchMock.mockResolvedValueOnce(answer(401, { detail: 'Could not validate credentials' }));

      const rejected = await failure(client.UsersAPI.getMe());

      expect(rejected).toMatchObject({ status: 401, message: 'Could not validate credentials' });
      // No refresh token is stored, so nothing else was sent and the stale token is gone.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('auth_token')).toBeNull();
    } finally {
      window.history.pushState({}, '', '/');
    }
  });
});
