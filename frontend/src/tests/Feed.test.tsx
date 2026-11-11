import { StrictMode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import FeedPage from '../pages/FeedPage';
import { PostsAPI, PostsApiError } from '@/lib/api/posts';
import type { Post, PostBoostResult } from '@/lib/api/posts';
import { clearTokens, storeTokens } from '@/lib/auth-tokens';
import { renderWithProviders } from './test-utils';

// Only the network calls are replaced; the error class, the limits and the types stay the real ones.
vi.mock('@/lib/api/posts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/posts')>();
  return {
    ...actual,
    PostsAPI: {
      getFeed: vi.fn(),
      getGlobalFeed: vi.fn(),
      getUserPosts: vi.fn(),
      scanNearby: vi.fn(),
      createPost: vi.fn(),
      createSignal: vi.fn(),
      deletePost: vi.fn(),
      boostPost: vi.fn(),
      boostSignal: vi.fn(),
    },
  };
});

const api = vi.mocked(PostsAPI);

/** The signed-in user that renderWithProviders supplies ("Test User"). */
const ME = '00000000-0000-0000-0000-000000000000';
const SOMEONE_ELSE = 'a5da7234-d479-4e32-8a1d-5f1c08e9e6eb';

const MINE_ID = '52b368c4-dfce-422e-822b-4d83257a6dee';
const THEIRS_ID = '3bd95e7b-bc08-41ea-ac9e-1349a1dd9423';
/** The id of a post that is not in any feed yet: one the viewer is about to publish. */
const NEW_ID = '7f0c7a52-5d0e-4b53-9a43-0d2f4f0a8f11';

function post(overrides: Partial<Post> = {}): Post {
  return {
    post_id: THEIRS_ID,
    user_id: SOMEONE_ELSE,
    post_type: 'SPOTTED',
    content_text: 'Restock on the wall at the Newbury St store',
    media_url: null,
    tags: null,
    visibility: 'public',
    timestamp: '2024-03-05T09:30:00.123456Z',
    boost_score: 37,
    geo_tag_lat: 40.7306,
    geo_tag_long: -73.9866,
    ...overrides,
  };
}

const theirs = post();

const mine = post({
  post_id: MINE_ID,
  user_id: ME,
  post_type: 'GENERAL',
  content_text: 'Selling my spare pair of Dunks',
  tags: ['dunks', 'forsale'],
  boost_score: 4,
  geo_tag_lat: null,
  geo_tag_long: null,
});

const boostResult: PostBoostResult = {
  success: true,
  boost_amount: 25,
  author_reward: 12,
  new_boost_score: 62,
  remaining_balance: 1175,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

type Locator = (onSuccess: PositionCallback, onError?: PositionErrorCallback | null) => void;

const locatedAt =
  (latitude: number, longitude: number, accuracy = 12): Locator =>
  (onSuccess) =>
    onSuccess({ coords: { latitude, longitude, accuracy } } as GeolocationPosition);

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

/** The card of the post with this text. */
function cardOf(text: string) {
  const card = screen.getByText(text).closest('article');
  if (!card) throw new Error(`"${text}" is not inside a post card`);
  return within(card as HTMLElement);
}

function postCards() {
  return within(screen.getByRole('list', { name: 'Posts' })).getAllByRole('article');
}

/** The feed shows exactly these posts, top to bottom. */
function expectPostsInOrder(texts: string[]) {
  const cards = postCards();
  expect(cards).toHaveLength(texts.length);
  texts.forEach((text, index) => expect(within(cards[index]).getByText(text)).toBeInTheDocument());
}

async function openComposer() {
  fireEvent.click(await screen.findByRole('button', { name: 'Create Post' }));
  return within(await screen.findByRole('dialog', { name: 'Create a new post' }));
}

function fill(scope: ReturnType<typeof within>, label: string, value: string) {
  fireEvent.change(scope.getByLabelText(label), { target: { value } });
}

/** Stands in for a query another page has loaded: it lives in the same query cache as the feed. */
function OtherPageQuery({ queryKey, read }: { queryKey: readonly unknown[]; read: () => Promise<number> }) {
  useQuery({ queryKey, queryFn: read });
  return null;
}

/** Query keys of the other pages whose figures a post, a deletion or a boost changes. */
const DEPENDENT_PAGES: (readonly unknown[])[] = [
  ['laces', 'balance'],
  ['laces', 'opportunities'],
  ['dashboard', 'metrics'],
  ['heatmap', 'bins'],
  ['profile', 'stats'],
  ['profile', 'posts', ME],
  ['leaderboard', 'laces', 10],
  ['quests'],
];

/** The feed next to queries of other pages; tells how often each of those was read. */
function renderFeedBesideOtherPages(options: Parameters<typeof renderWithProviders>[1] = {}) {
  const dependent = DEPENDENT_PAGES.map((queryKey) => ({ queryKey, read: vi.fn(async () => 1) }));
  // Nothing on the feed changes notifications for the viewer: this one must be left alone.
  const unrelated = vi.fn(async () => 1);
  renderWithProviders(
    <>
      {dependent.map(({ queryKey, read }) => (
        <OtherPageQuery key={JSON.stringify(queryKey)} queryKey={queryKey} read={read} />
      ))}
      <OtherPageQuery queryKey={['notifications', 'list']} read={unrelated} />
      <FeedPage />
    </>,
    options,
  );
  return {
    timesDependentRead: () => dependent.map(({ read }) => read.mock.calls.length),
    timesUnrelatedRead: () => unrelated.mock.calls.length,
    once: DEPENDENT_PAGES.map(() => 1),
    twice: DEPENDENT_PAGES.map(() => 2),
  };
}

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  api.getFeed.mockResolvedValue([theirs, mine]);
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
});

describe('Feed page: reading', () => {
  it('shows a loading state, then the posts the API returns', async () => {
    const feed = deferred<Post[]>();
    api.getFeed.mockReturnValue(feed.promise);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    renderWithProviders(<FeedPage />);
    expect(await screen.findByRole('status', { name: 'Loading posts' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Posts' })).not.toBeInTheDocument();

    feed.resolve([theirs, { ...mine, timestamp: fiveMinutesAgo }]);

    await screen.findByText('Restock on the wall at the Newbury St store');
    expect(screen.queryByRole('status', { name: 'Loading posts' })).not.toBeInTheDocument();
    expect(api.getFeed).toHaveBeenCalledWith({ skip: 0, limit: 20 });
    expect(api.getGlobalFeed).not.toHaveBeenCalled();
    expect(api.scanNearby).not.toHaveBeenCalled();
    expectPostsInOrder(['Restock on the wall at the Newbury St store', 'Selling my spare pair of Dunks']);

    // Someone else's post: the API sends no name, so a short form of the author's id stands in.
    const other = cardOf('Restock on the wall at the Newbury St store');
    expect(other.getByText('User a5da7234')).toBeInTheDocument();
    expect(other.queryByText('You')).not.toBeInTheDocument();
    expect(other.getByText('Spotted')).toBeInTheDocument();
    expect(other.getByText('Pinned at 40.7306, -73.9866')).toBeInTheDocument();
    expect(other.getByText('37').parentElement).toHaveTextContent('37 LACES boosted');
    expect(other.getByText(/ago$/)).toHaveAttribute('datetime', '2024-03-05T09:30:00.123456Z');

    // The viewer's own post carries their name.
    const own = cardOf('Selling my spare pair of Dunks');
    expect(own.getByText('Test User')).toBeInTheDocument();
    expect(own.getByText('You')).toBeInTheDocument();
    expect(own.getByText('General')).toBeInTheDocument();
    expect(own.getByText('5 minutes ago')).toHaveAttribute('datetime', fiveMinutesAgo);
    expect(own.getByText('4').parentElement).toHaveTextContent('4 LACES boosted');
    expect(within(own.getByRole('list', { name: 'Tags' })).getAllByRole('listitem').map((tag) => tag.textContent)).toEqual([
      '#dunks',
      '#forsale',
    ]);
    expect(own.queryByText(/Pinned at/)).not.toBeInTheDocument();
  });

  it('shows the attached image and says so when a post has no text', async () => {
    api.getFeed.mockResolvedValue([
      post({ content_text: 'Fresh pair, fresh laces', media_url: 'https://cdn.example.com/kicks.jpg', post_type: 'HEAT_CHECK' }),
      post({ post_id: MINE_ID, content_text: null, media_url: 'not a link' }),
      post({ post_id: NEW_ID, content_text: 'The box they came in', media_url: 'http://images.example.org/box.png?size=l' }),
      post({ post_id: 'c1e850e8-9577-47b7-8a06-ce4b5a81f4e4', content_text: null, media_url: 'https://cdn.example.com/only-a-picture.jpg' }),
    ]);

    renderWithProviders(<FeedPage />);
    await screen.findByText('Fresh pair, fresh laces');

    const withImage = cardOf('Fresh pair, fresh laces');
    expect(withImage.getByText('Heat check')).toBeInTheDocument();
    const image = withImage.getByRole('img', { name: 'Image attached to this post' });
    expect(image).toHaveAttribute('src', 'https://cdn.example.com/kicks.jpg');
    expect(cardOf('The box they came in').getByRole('img', { name: 'Image attached to this post' })).toHaveAttribute(
      'src',
      'http://images.example.org/box.png?size=l',
    );

    // A picture on its own is a post too: nothing is said about the missing text.
    const pictureOnly = screen
      .getAllByRole('img', { name: 'Image attached to this post' })
      .find((picture) => picture.getAttribute('src') === 'https://cdn.example.com/only-a-picture.jpg');
    expect(pictureOnly).toBeDefined();
    expect(pictureOnly?.closest('article')).not.toHaveTextContent('This post has no text.');
    expect(screen.getAllByText('This post has no text.')).toHaveLength(1);

    // media_url is free text on the API side: something that is not a web address is not shown as one.
    const empty = cardOf('This post has no text.');
    expect(empty.queryByRole('img')).not.toBeInTheDocument();
    expect(empty.queryByRole('link')).not.toBeInTheDocument();

    // A link that does not load as an image stays reachable as a link.
    fireEvent.error(image);
    expect(withImage.queryByRole('img')).not.toBeInTheDocument();
    expect(withImage.getByRole('link', { name: 'Open the attached link' })).toHaveAttribute(
      'href',
      'https://cdn.example.com/kicks.jpg',
    );
  });

  it('does not load or link an attachment that is not a web address', async () => {
    api.getFeed.mockResolvedValue([
      post({ content_text: 'A script for a picture', media_url: 'javascript:alert(document.cookie)' }),
      post({ post_id: MINE_ID, content_text: 'A page for a picture', media_url: 'data:text/html,<script>alert(1)</script>' }),
    ]);

    renderWithProviders(<FeedPage />);
    await screen.findByText('A script for a picture');

    expect(postCards()).toHaveLength(2);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('counts a post stamped ahead of this clock as posted just now, not in the future', async () => {
    // The API stamps posts with its own clock, which can run ahead of this device's.
    const aheadOfThisClock = new Date(Date.now() + 40 * 1000).toISOString();
    api.getFeed.mockResolvedValue([post({ content_text: 'Fresh from the server', timestamp: aheadOfThisClock })]);

    renderWithProviders(<FeedPage />);
    await screen.findByText('Fresh from the server');

    const card = cardOf('Fresh from the server');
    expect(card.getByText('less than a minute ago')).toHaveAttribute('datetime', aheadOfThisClock);
    expect(card.queryByText(/^in /)).not.toBeInTheDocument();
  });

  it('behaves the same under React strict mode: one lookup, one scan, one post', async () => {
    const getCurrentPosition = stubGeolocation(locatedAt(42.3601, -71.0589));
    api.scanNearby.mockResolvedValue([post({ content_text: 'Right at the door' })]);
    api.createPost.mockResolvedValue(
      post({ post_id: NEW_ID, user_id: ME, content_text: 'Posted once', geo_tag_lat: null, geo_tag_long: null }),
    );

    renderWithProviders(
      <StrictMode>
        <FeedPage />
      </StrictMode>,
    );
    await screen.findByText('Selling my spare pair of Dunks');
    expect(api.getFeed).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Nearby' }));
    expect(await screen.findByText('Right at the door')).toBeInTheDocument();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(api.scanNearby).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Top' }));
    const dialog = await openComposer();
    fill(dialog, "What's on your mind?", 'Posted once');
    fireEvent.click(dialog.getByRole('button', { name: 'Post' }));

    expect(await screen.findByText('Your post is live.')).toBeInTheDocument();
    expect(api.createPost).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Posted once')).toHaveLength(1);
  });

  it("names the viewer's own posts after the signed-in account, whoever that is", async () => {
    const collector = {
      user_id: 'c0ffee00-1234-4abc-8def-000000000042',
      username: 'sole_collector',
      display_name: 'Sole Collector',
      email: 'collector@example.com',
      laces_balance: 15,
      is_verified: false,
      created_at: '2024-01-01T00:00:00Z',
    };
    api.getFeed.mockResolvedValue([
      // The API may write the same id in another case.
      post({ user_id: collector.user_id.toUpperCase(), content_text: 'Posted by the collector' }),
      mine,
    ]);

    const view = renderWithProviders(<FeedPage />, { auth: { user: collector } });
    await screen.findByText('Posted by the collector');

    let own = cardOf('Posted by the collector');
    expect(own.getByText('Sole Collector')).toBeInTheDocument();
    expect(own.getByText('You')).toBeInTheDocument();
    expect(own.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(own.queryByRole('button', { name: 'Boost' })).not.toBeInTheDocument();
    // The post of the account the other tests sign in with is someone else's here.
    const other = cardOf('Selling my spare pair of Dunks');
    expect(other.getByText('User 00000000')).toBeInTheDocument();
    expect(other.queryByText('Test User')).not.toBeInTheDocument();
    expect(other.getByRole('button', { name: 'Boost' })).toBeInTheDocument();
    expect(other.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    view.unmount();

    // Without a display name the username stands in.
    renderWithProviders(<FeedPage />, { auth: { user: { ...collector, display_name: ' ' } } });
    await screen.findByText('Posted by the collector');
    own = cardOf('Posted by the collector');
    expect(own.getByText('sole_collector')).toBeInTheDocument();
    expect(own.queryByText('Sole Collector')).not.toBeInTheDocument();
  });

  it('offers neither a delete nor the viewer\'s name when nobody is signed in', async () => {
    renderWithProviders(<FeedPage />, { auth: { user: null, isAuthenticated: false } });
    await screen.findByText('Selling my spare pair of Dunks');

    const card = cardOf('Selling my spare pair of Dunks');
    expect(card.getByText('User 00000000')).toBeInTheDocument();
    expect(card.queryByText('Test User')).not.toBeInTheDocument();
    expect(card.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('says so when there are no posts yet', async () => {
    api.getFeed.mockResolvedValue([]);

    renderWithProviders(<FeedPage />);

    expect(await screen.findByText('No posts yet. Be the first to share something!')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Posts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it("shows the API's error and loads the feed on retry", async () => {
    api.getFeed.mockRejectedValueOnce(new PostsApiError(503, 'Feed is warming up'));

    renderWithProviders(<FeedPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load the feed');
    expect(alert).toHaveTextContent('Feed is warming up');
    expect(screen.queryByText('No posts yet. Be the first to share something!')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Selling my spare pair of Dunks')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.getFeed).toHaveBeenCalledTimes(2);
  });

  it('keeps the loaded posts on screen when a refresh fails', async () => {
    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');

    api.getFeed.mockRejectedValueOnce(new PostsApiError(0, 'Could not reach the server. Check your connection and try again.'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not refresh the feed. Showing the posts loaded earlier.');
    expect(alert).toHaveTextContent('Could not reach the server. Check your connection and try again.');
    expect(screen.getByText('Selling my spare pair of Dunks')).toBeInTheDocument();
  });

  it('loads the next page when asked and stops offering more after a short page', async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) =>
      post({ post_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, content_text: `Signal number ${index + 1}` }),
    );
    const secondPage = [
      // The feed moved between the two requests: the last post of page one comes back first.
      firstPage[19],
      post({ post_id: MINE_ID, content_text: 'The one on page two' }),
    ];
    api.getFeed.mockImplementation(async ({ skip = 0 } = {}) => (skip === 0 ? firstPage : secondPage));

    renderWithProviders(<FeedPage />);
    await screen.findByText('Signal number 20');
    expect(screen.queryByText('The one on page two')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('The one on page two')).toBeInTheDocument();
    expect(api.getFeed).toHaveBeenLastCalledWith({ skip: 20, limit: 20 });
    expect(screen.getAllByText('Signal number 20')).toHaveLength(1);
    expect(postCards()).toHaveLength(21);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('says so when the next page cannot be loaded and tries that page again', async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) =>
      post({ post_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, content_text: `Signal number ${index + 1}` }),
    );
    let failNextPage = true;
    api.getFeed.mockImplementation(async ({ skip = 0 } = {}) => {
      if (skip === 0) return firstPage;
      if (failNextPage) throw new PostsApiError(503, 'Feed is warming up');
      return [post({ post_id: MINE_ID, content_text: 'The one on page two' })];
    });

    renderWithProviders(<FeedPage />);
    await screen.findByText('Signal number 20');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load more posts');
    expect(alert).toHaveTextContent('Feed is warming up');
    expect(postCards()).toHaveLength(20);

    failNextPage = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('The one on page two')).toBeInTheDocument();
    expect(api.getFeed).toHaveBeenLastCalledWith({ skip: 20, limit: 20 });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(postCards()).toHaveLength(21);
  });

  it('does not offer more posts when the first page is not full', async () => {
    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');

    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('lists the newest posts from the global feed under Latest', async () => {
    api.getGlobalFeed.mockResolvedValue([post({ post_id: MINE_ID, content_text: 'Fresh off the truck', boost_score: 0 })]);

    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');
    expect(screen.getByRole('button', { name: 'Top' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Latest' }));

    expect(await screen.findByText('Fresh off the truck')).toBeInTheDocument();
    expect(api.getGlobalFeed).toHaveBeenCalledWith({ skip: 0, limit: 20 });
    expect(screen.getByRole('button', { name: 'Latest' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Top' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Selling my spare pair of Dunks')).not.toBeInTheDocument();
  });
});

describe('Feed page: nearby', () => {
  it('scans around the position the browser reports and says how far each post is', async () => {
    const getCurrentPosition = stubGeolocation(locatedAt(42.3601, -71.0589));
    api.scanNearby.mockImplementation(async ({ radius }) =>
      radius === 5
        ? [
            post({ content_text: 'Right at the door', geo_tag_lat: 42.3601, geo_tag_long: -71.0589 }),
            post({ post_id: MINE_ID, content_text: 'Two blocks over', geo_tag_lat: 42.3625, geo_tag_long: -71.057 }),
            post({ post_id: 'c1e850e8-9577-47b7-8a06-ce4b5a81f4e4', content_text: 'By the ballpark', geo_tag_lat: 42.3467, geo_tag_long: -71.0972 }),
          ]
        : [],
    );

    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');
    expect(getCurrentPosition).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Nearby' }));

    expect(await screen.findByText('Right at the door')).toBeInTheDocument();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(api.scanNearby).toHaveBeenCalledWith({ latitude: 42.3601, longitude: -71.0589, radius: 5 });
    expect(screen.getByText('Posts pinned around 42.3601, -71.0589')).toBeInTheDocument();
    expect(cardOf('Right at the door').getByText('Less than 50 m away')).toBeInTheDocument();
    expect(cardOf('Two blocks over').getByText('310 m away')).toBeInTheDocument();
    expect(cardOf('By the ballpark').getByText('3.5 km away')).toBeInTheDocument();
    expect(screen.queryByText('Selling my spare pair of Dunks')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Radius'), { target: { value: '25' } });

    expect(
      await screen.findByText('No posts are pinned within 25 km of you yet. Pin one to put this spot on the map.'),
    ).toBeInTheDocument();
    expect(api.scanNearby).toHaveBeenLastCalledWith({ latitude: 42.3601, longitude: -71.0589, radius: 25 });
    expect(screen.queryByText('Right at the door')).not.toBeInTheDocument();
  });

  it('explains a refused location, scans nothing, and tries again on request', async () => {
    stubGeolocation(locationFailure(1));
    api.scanNearby.mockResolvedValue([post({ content_text: 'Right at the door' })]);

    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');
    fireEvent.click(screen.getByRole('button', { name: 'Nearby' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Location permission was denied. Allow location access for this site and try again.',
    );
    expect(api.scanNearby).not.toHaveBeenCalled();
    expect(screen.queryByRole('list', { name: 'Posts' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();

    stubGeolocation(locatedAt(42.3601, -71.0589));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Right at the door')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.scanNearby).toHaveBeenCalledWith({ latitude: 42.3601, longitude: -71.0589, radius: 5 });
  });

  it.each([
    [2, 'Your location is not available right now. Try again.'],
    [3, 'Finding your location took too long. Try again.'],
  ])('explains why the position could not be found (browser error code %i)', async (code, message) => {
    stubGeolocation(locationFailure(code));

    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');
    fireEvent.click(screen.getByRole('button', { name: 'Nearby' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(api.scanNearby).not.toHaveBeenCalled();
  });

  it('says so when the browser cannot share a location', async () => {
    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');
    fireEvent.click(screen.getByRole('button', { name: 'Nearby' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This browser cannot share its location.');
    expect(api.scanNearby).not.toHaveBeenCalled();
  });

  it('lists a new post of the viewer only when it is pinned within the radius', async () => {
    stubGeolocation(locatedAt(42.3601, -71.0589));
    // Posts by others exist around the first spot only.
    api.scanNearby.mockImplementation(async ({ latitude }) =>
      latitude === 42.3601 ? [post({ content_text: 'Right at the door' })] : [],
    );
    api.createPost.mockResolvedValue(
      post({ post_id: NEW_ID, user_id: ME, content_text: 'Nowhere in particular', geo_tag_lat: null, geo_tag_long: null }),
    );
    api.createSignal.mockResolvedValue(
      post({
        post_id: 'fad66eab-11c8-4b4a-b476-c51f0634fcb2',
        user_id: ME,
        content_text: 'Right here',
        geo_tag_lat: 42.3601,
        geo_tag_long: -71.0589,
      }),
    );

    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');

    let dialog = await openComposer();
    fill(dialog, "What's on your mind?", 'Nowhere in particular');
    fireEvent.click(dialog.getByRole('button', { name: 'Post' }));
    await screen.findByText('Nowhere in particular');

    dialog = await openComposer();
    fill(dialog, "What's on your mind?", 'Right here');
    fireEvent.click(dialog.getByRole('switch', { name: 'Pin to my current location' }));
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Post' })).toBeEnabled());
    fireEvent.click(dialog.getByRole('button', { name: 'Post' }));
    await screen.findByText('Right here');

    fireEvent.click(screen.getByRole('button', { name: 'Nearby' }));

    expect(await screen.findByText('Right at the door')).toBeInTheDocument();
    expectPostsInOrder(['Right here', 'Right at the door']);
    expect(screen.queryByText('Nowhere in particular')).not.toBeInTheDocument();
    // A message about the other view does not follow the viewer here.
    expect(screen.queryByText('Your signal is live and pinned to your location.')).not.toBeInTheDocument();

    // The viewer moves about 10 km north: the pinned post is outside the 5 km radius now.
    stubGeolocation(locatedAt(42.45, -71.0589));
    fireEvent.click(screen.getByRole('button', { name: 'Update location' }));

    expect(
      await screen.findByText('No posts are pinned within 5 km of you yet. Pin one to put this spot on the map.'),
    ).toBeInTheDocument();
    expect(api.scanNearby).toHaveBeenLastCalledWith({ latitude: 42.45, longitude: -71.0589, radius: 5 });
    expect(screen.queryByText('Right here')).not.toBeInTheDocument();

    // A wider radius takes it in again.
    fireEvent.change(screen.getByLabelText('Radius'), { target: { value: '25' } });

    expect(await screen.findByText('Right here')).toBeInTheDocument();
    expect(cardOf('Right here').getByText('10 km away')).toBeInTheDocument();
    expect(api.scanNearby).toHaveBeenLastCalledWith({ latitude: 42.45, longitude: -71.0589, radius: 25 });
  });

  it('does not offer more posts after a scan, however many it found', async () => {
    stubGeolocation(locatedAt(42.3601, -71.0589));
    // As many as a full page of the other views: the scan is not paged, so there is no next page.
    api.scanNearby.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) =>
        post({ post_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, content_text: `Signal number ${index + 1}` }),
      ),
    );

    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');
    fireEvent.click(screen.getByRole('button', { name: 'Nearby' }));

    expect(await screen.findByText('Signal number 20')).toBeInTheDocument();
    expect(postCards()).toHaveLength(20);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it("shows the scan's error with a retry", async () => {
    stubGeolocation(locatedAt(42.3601, -71.0589));
    api.scanNearby
      .mockRejectedValueOnce(new PostsApiError(500, 'Could not load posts near you (HTTP 500)'))
      .mockResolvedValue([post({ content_text: 'Right at the door' })]);

    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');
    fireEvent.click(screen.getByRole('button', { name: 'Nearby' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load posts near you (HTTP 500)');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Right at the door')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Feed page: writing a post', () => {
  it('publishes a plain post and puts the post the API returned on top', async () => {
    const created = post({
      post_id: 'ea9b5c63-00e2-49a1-8640-599d06d3bf2c',
      user_id: ME,
      post_type: 'LINE_UPDATE',
      content_text: 'Line is around the block (as stored)',
      tags: ['queue', 'boston'],
      boost_score: 0,
      geo_tag_lat: null,
      geo_tag_long: null,
    });
    api.createPost.mockResolvedValue(created);

    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');

    const dialog = await openComposer();
    expect(dialog.getByRole('button', { name: 'Post' })).toBeDisabled();
    expect(within(dialog.getByLabelText('Post type')).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Spotted',
      'Stock check',
      'Line update',
      'General',
      'Heat check',
      'Intel report',
    ]);
    expect(dialog.getByLabelText('Post type')).toHaveValue('GENERAL');

    fill(dialog, 'Post type', 'LINE_UPDATE');
    fill(dialog, "What's on your mind?", '  Line is around the block  ');
    fill(dialog, 'Tags (optional)', 'queue, #boston, queue, ');
    expect(dialog.getByText('28 / 5000')).toBeInTheDocument();

    // The refetch that follows the post is still on its way: the new post must show without it.
    api.getFeed.mockReturnValue(new Promise<Post[]>(() => undefined));
    fireEvent.click(dialog.getByRole('button', { name: 'Post' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.createPost).toHaveBeenCalledTimes(1);
    expect(api.createPost).toHaveBeenCalledWith({
      post_type: 'LINE_UPDATE',
      content_text: 'Line is around the block',
      tags: ['queue', 'boston'],
    });
    expect(api.createSignal).not.toHaveBeenCalled();

    expect(await screen.findByText('Your post is live.')).toHaveAttribute('role', 'status');
    expectPostsInOrder([
      'Line is around the block (as stored)',
      'Restock on the wall at the Newbury St store',
      'Selling my spare pair of Dunks',
    ]);
    const card = cardOf('Line is around the block (as stored)');
    expect(card.getByText('Line update')).toBeInTheDocument();
    expect(card.getByText('You')).toBeInTheDocument();
    expect(card.getByText('#boston')).toBeInTheDocument();
    await waitFor(() => expect(api.getFeed).toHaveBeenCalledTimes(2));

    // The form is blank for the next post.
    const next = await openComposer();
    expect(next.getByLabelText('Post type')).toHaveValue('GENERAL');
    expect(next.getByLabelText("What's on your mind?")).toHaveValue('');
    expect(next.getByLabelText('Tags (optional)')).toHaveValue('');
    expect(next.getByLabelText('Image link (optional)')).toHaveValue('');
    expect(next.getByText('0 / 5000')).toBeInTheDocument();
  });

  it('has other pages load their figures again after a new post', async () => {
    api.createPost.mockResolvedValue(
      post({ post_id: NEW_ID, user_id: ME, content_text: 'Counted everywhere', geo_tag_lat: null, geo_tag_long: null }),
    );

    const otherPages = renderFeedBesideOtherPages();
    await screen.findByText('Selling my spare pair of Dunks');
    await waitFor(() => expect(otherPages.timesDependentRead()).toEqual(otherPages.once));

    const dialog = await openComposer();
    fill(dialog, "What's on your mind?", 'Counted everywhere');
    fireEvent.click(dialog.getByRole('button', { name: 'Post' }));
    await screen.findByText('Your post is live.');

    // The post counts toward the dashboard, the profile, the "posts" leaderboard and the posting quests.
    await waitFor(() => expect(otherPages.timesDependentRead()).toEqual(otherPages.twice));
    expect(otherPages.timesUnrelatedRead()).toBe(1);
    await waitFor(() => expect(api.getFeed).toHaveBeenCalledTimes(2));
  });

  it('sends the image link with the post', async () => {
    api.createPost.mockResolvedValue(
      post({ post_id: MINE_ID, user_id: ME, content_text: 'Heat check', media_url: 'https://cdn.example.com/kicks.jpg' }),
    );

    renderWithProviders(<FeedPage />);
    const dialog = await openComposer();
    fill(dialog, "What's on your mind?", 'Heat check');
    fill(dialog, 'Image link (optional)', ' https://cdn.example.com/kicks.jpg ');
    fireEvent.click(dialog.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(api.createPost).toHaveBeenCalledWith({
        post_type: 'GENERAL',
        content_text: 'Heat check',
        media_url: 'https://cdn.example.com/kicks.jpg',
      }),
    );

    // The link does not carry over to the next post.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const next = await openComposer();
    expect(next.getByLabelText('Image link (optional)')).toHaveValue('');
  });

  it('pins a post to the current location, which publishes it as a hyperlocal signal', async () => {
    const getCurrentPosition = stubGeolocation(locatedAt(42.3601, -71.0589, 12.4));
    api.createSignal.mockResolvedValue(
      post({
        post_id: 'fad66eab-11c8-4b4a-b476-c51f0634fcb2',
        user_id: ME,
        post_type: 'GENERAL',
        content_text: 'Pair spotted in the window',
        boost_score: 0,
        geo_tag_lat: 42.3601,
        geo_tag_long: -71.0589,
      }),
    );

    renderWithProviders(<FeedPage />);
    const dialog = await openComposer();
    fill(dialog, "What's on your mind?", 'Pair spotted in the window');

    const pin = dialog.getByRole('switch', { name: 'Pin to my current location' });
    expect(pin).toHaveAttribute('aria-checked', 'false');
    expect(getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(pin);

    expect(pin).toHaveAttribute('aria-checked', 'true');
    expect(await dialog.findByText('42.36010, -71.05890 (within 12 m)')).toBeInTheDocument();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);

    fireEvent.click(dialog.getByRole('button', { name: 'Post' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.createSignal).toHaveBeenCalledWith({
      post_type: 'GENERAL',
      content_text: 'Pair spotted in the window',
      geo_tag_lat: 42.3601,
      geo_tag_long: -71.0589,
    });
    expect(api.createPost).not.toHaveBeenCalled();
    expect(await screen.findByText('Your signal is live and pinned to your location.')).toHaveAttribute('role', 'status');
    // The viewer's position is known now, so the pinned post says how close it is.
    expect(cardOf('Pair spotted in the window').getByText('Less than 50 m away')).toBeInTheDocument();

    // The next draft starts empty and unpinned, so nothing is looked up for it.
    const next = await openComposer();
    expect(next.getByLabelText("What's on your mind?")).toHaveValue('');
    expect(next.getByRole('switch', { name: 'Pin to my current location' })).toHaveAttribute('aria-checked', 'false');
    expect(next.getByRole('button', { name: 'Post' })).toBeDisabled();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('cannot pin without a location, and posts normally once the pin is turned off', async () => {
    stubGeolocation(locationFailure(1));
    api.createPost.mockResolvedValue(post({ post_id: MINE_ID, user_id: ME, content_text: 'No pin after all' }));

    renderWithProviders(<FeedPage />);
    const dialog = await openComposer();
    fill(dialog, "What's on your mind?", 'No pin after all');
    fireEvent.click(dialog.getByRole('switch', { name: 'Pin to my current location' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Location permission was denied. Allow location access for this site and try again.',
    );
    expect(dialog.getByRole('button', { name: 'Post' })).toBeDisabled();

    fireEvent.click(dialog.getByRole('switch', { name: 'Pin to my current location' }));
    expect(dialog.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(api.createPost).toHaveBeenCalledWith({ post_type: 'GENERAL', content_text: 'No pin after all' }),
    );
    expect(api.createSignal).not.toHaveBeenCalled();
  });

  it('shows that a list is still loading under a post the viewer just published', async () => {
    api.createPost.mockResolvedValue(
      post({ post_id: NEW_ID, user_id: ME, content_text: 'Mine, just now', geo_tag_lat: null, geo_tag_long: null }),
    );

    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');
    const dialog = await openComposer();
    fill(dialog, "What's on your mind?", 'Mine, just now');
    fireEvent.click(dialog.getByRole('button', { name: 'Post' }));
    await screen.findByText('Your post is live.');

    const latest = deferred<Post[]>();
    api.getGlobalFeed.mockReturnValue(latest.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }));

    // The new post is known already; the rest of the Latest list is not.
    expect(await screen.findByRole('status', { name: 'Loading posts' })).toBeInTheDocument();
    expectPostsInOrder(['Mine, just now']);

    latest.resolve([theirs]);

    expect(await screen.findByText('Restock on the wall at the Newbury St store')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading posts' })).not.toBeInTheDocument();
    expectPostsInOrder(['Mine, just now', 'Restock on the wall at the Newbury St store']);
  });

  it('stays open while the post is on its way, so it cannot be sent twice or fail unseen', async () => {
    const sending = deferred<Post>();
    api.createPost.mockReturnValue(sending.promise);

    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');
    const dialog = await openComposer();
    fill(dialog, "What's on your mind?", 'Only once, please');
    fireEvent.click(dialog.getByRole('button', { name: 'Post' }));

    expect(await dialog.findByRole('button', { name: 'Posting…' })).toBeDisabled();
    expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    // Neither Escape nor the close button gets rid of the dialog for now.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(dialog.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('dialog', { name: 'Create a new post' })).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Posting…' })).toBeDisabled();

    sending.reject(new PostsApiError(503, 'Posting is paused for maintenance'));

    expect(await dialog.findByRole('alert')).toHaveTextContent('Posting is paused for maintenance');
    expect(dialog.getByLabelText("What's on your mind?")).toHaveValue('Only once, please');
    expect(api.createPost).toHaveBeenCalledTimes(1);

    // Now that the outcome is known the dialog closes again.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Only once, please')).not.toBeInTheDocument();
  });

  it('looks up the position again each time the pin is switched on', async () => {
    stubGeolocation(locatedAt(42.3601, -71.0589));
    api.scanNearby.mockResolvedValue([]);
    api.createSignal.mockResolvedValue(
      post({ post_id: NEW_ID, user_id: ME, content_text: 'Moved on', geo_tag_lat: 42.37, geo_tag_long: -71.06 }),
    );

    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');
    fireEvent.click(screen.getByRole('button', { name: 'Nearby' }));
    await screen.findByText('Posts pinned around 42.3601, -71.0589');

    // The viewer has walked on since the feed found them.
    const lookUpAgain = stubGeolocation(locatedAt(42.37, -71.06, 8));
    const dialog = await openComposer();
    fill(dialog, "What's on your mind?", 'Moved on');
    fireEvent.click(dialog.getByRole('switch', { name: 'Pin to my current location' }));

    expect(lookUpAgain).toHaveBeenCalledTimes(1);
    expect(await dialog.findByText('42.37000, -71.06000 (within 8 m)')).toBeInTheDocument();
    expect(dialog.queryByText(/42\.36010/)).not.toBeInTheDocument();

    fireEvent.click(dialog.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(api.createSignal).toHaveBeenCalledWith({
        post_type: 'GENERAL',
        content_text: 'Moved on',
        geo_tag_lat: 42.37,
        geo_tag_long: -71.06,
      }),
    );
  });

  it('does not start a second lookup while one is under way', async () => {
    // A browser that takes its time: the answer is given by hand below.
    let answer: PositionCallback = () => undefined;
    const getCurrentPosition = stubGeolocation((onSuccess) => {
      answer = onSuccess;
    });
    api.scanNearby.mockResolvedValue([]);

    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');
    fireEvent.click(screen.getByRole('button', { name: 'Nearby' }));
    expect(await screen.findByText('Finding your location…')).toHaveAttribute('role', 'status');
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);

    const dialog = await openComposer();
    fill(dialog, "What's on your mind?", 'Waiting for a fix');
    fireEvent.click(dialog.getByRole('switch', { name: 'Pin to my current location' }));

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(dialog.getByRole('button', { name: 'Post' })).toBeDisabled();

    // The one lookup answers for both the feed and the draft.
    act(() => answer({ coords: { latitude: 42.3601, longitude: -71.0589, accuracy: 30 } } as GeolocationPosition));

    expect(await dialog.findByText('42.36010, -71.05890 (within 30 m)')).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Post' })).toBeEnabled();
    await waitFor(() =>
      expect(api.scanNearby).toHaveBeenCalledWith({ latitude: 42.3601, longitude: -71.0589, radius: 5 }),
    );
  });

  it('looks up the position again when a draft that was left pinned is opened again', async () => {
    const firstLookUp = stubGeolocation(locatedAt(42.3601, -71.0589));

    renderWithProviders(<FeedPage />);
    let dialog = await openComposer();
    fill(dialog, "What's on your mind?", 'For later');
    fireEvent.click(dialog.getByRole('switch', { name: 'Pin to my current location' }));
    await dialog.findByText('42.36010, -71.05890 (within 12 m)');
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(firstLookUp).toHaveBeenCalledTimes(1);

    const lookUpAgain = stubGeolocation(locatedAt(42.37, -71.06, 8));
    dialog = await openComposer();

    expect(dialog.getByLabelText("What's on your mind?")).toHaveValue('For later');
    expect(dialog.getByRole('switch', { name: 'Pin to my current location' })).toHaveAttribute('aria-checked', 'true');
    expect(lookUpAgain).toHaveBeenCalledTimes(1);
    expect(await dialog.findByText('42.37000, -71.06000 (within 8 m)')).toBeInTheDocument();
  });

  it("keeps the draft open with the API's reason when publishing fails", async () => {
    api.createPost.mockRejectedValue(new PostsApiError(422, 'content_text: String should have at most 5000 characters'));

    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');
    const dialog = await openComposer();
    fill(dialog, "What's on your mind?", 'This one will bounce');
    fireEvent.click(dialog.getByRole('button', { name: 'Post' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent('content_text: String should have at most 5000 characters');
    expect(dialog.getByLabelText("What's on your mind?")).toHaveValue('This one will bounce');
    expect(dialog.getByRole('button', { name: 'Post' })).toBeEnabled();
    expect(api.getFeed).toHaveBeenCalledTimes(1);

    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('This one will bounce')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('does not send a post with an image link that is not a web address', async () => {
    renderWithProviders(<FeedPage />);
    const dialog = await openComposer();
    fill(dialog, "What's on your mind?", 'Look at these');
    fill(dialog, 'Image link (optional)', 'kicks.jpg');
    fireEvent.click(dialog.getByRole('button', { name: 'Post' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'The image link must be a web address starting with http:// or https://.',
    );
    expect(api.createPost).not.toHaveBeenCalled();
  });

  it('does not send an image link longer than the API accepts', async () => {
    api.createPost.mockResolvedValue(post({ post_id: NEW_ID, user_id: ME, content_text: 'Long link' }));
    const base = 'https://cdn.example.com/';

    renderWithProviders(<FeedPage />);
    const dialog = await openComposer();
    fill(dialog, "What's on your mind?", 'Long link');
    // Pasted text can get past the field's own length limit; 501 characters is one too many.
    fill(dialog, 'Image link (optional)', base + 'k'.repeat(501 - base.length));
    fireEvent.click(dialog.getByRole('button', { name: 'Post' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent('The image link can be at most 500 characters long.');
    expect(api.createPost).not.toHaveBeenCalled();

    fill(dialog, 'Image link (optional)', base + 'k'.repeat(500 - base.length));
    fireEvent.click(dialog.getByRole('button', { name: 'Post' }));

    await waitFor(() => expect(api.createPost).toHaveBeenCalledTimes(1));
    expect(api.createPost.mock.calls[0][0].media_url).toHaveLength(500);
  });

  it('does not send more tags than the API accepts', async () => {
    renderWithProviders(<FeedPage />);
    const dialog = await openComposer();
    fill(dialog, "What's on your mind?", 'Tag storm');
    fill(dialog, 'Tags (optional)', Array.from({ length: 21 }, (_, index) => `tag${index}`).join(','));
    fireEvent.click(dialog.getByRole('button', { name: 'Post' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent('Use at most 20 tags.');
    expect(api.createPost).not.toHaveBeenCalled();
  });

  it('does not send a tag longer than the API accepts', async () => {
    api.createPost.mockResolvedValue(post({ post_id: NEW_ID, user_id: ME, content_text: 'Long tag' }));

    renderWithProviders(<FeedPage />);
    const dialog = await openComposer();
    fill(dialog, "What's on your mind?", 'Long tag');
    fill(dialog, 'Tags (optional)', `ok, #${'t'.repeat(51)}`);
    fireEvent.click(dialog.getByRole('button', { name: 'Post' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      `A tag can be at most 50 characters long: "${'t'.repeat(20)}…" is longer.`,
    );
    expect(api.createPost).not.toHaveBeenCalled();

    // 50 characters is still fine.
    fill(dialog, 'Tags (optional)', `ok, #${'t'.repeat(50)}`);
    fireEvent.click(dialog.getByRole('button', { name: 'Post' }));

    await waitFor(() =>
      expect(api.createPost).toHaveBeenCalledWith({
        post_type: 'GENERAL',
        content_text: 'Long tag',
        tags: ['ok', 't'.repeat(50)],
      }),
    );
  });
});

describe('Feed page: boosting', () => {
  it("boosts someone else's post with the chosen amount and shows the score the API reports", async () => {
    const refreshUser = vi.fn(async () => undefined);
    api.boostPost.mockResolvedValue(boostResult);

    renderWithProviders(<FeedPage />, { auth: { refreshUser } });
    await screen.findByText('Restock on the wall at the Newbury St store');
    const card = cardOf('Restock on the wall at the Newbury St store');

    fireEvent.click(card.getByRole('button', { name: 'Boost' }));
    expect(card.getByLabelText('LACES to spend')).toHaveValue(10);
    expect(card.getByLabelText('LACES to spend')).toHaveFocus();
    fill(card, 'LACES to spend', '25');
    fireEvent.click(card.getByRole('button', { name: 'Confirm boost' }));

    expect(await card.findByRole('status')).toHaveTextContent(
      'Boosted with 25 LACES: 12 went to the author. You have 1,175 LACES left.',
    );
    expect(api.boostPost).toHaveBeenCalledTimes(1);
    expect(api.boostPost).toHaveBeenCalledWith(THEIRS_ID, 25);
    expect(card.getByText('62').parentElement).toHaveTextContent('62 LACES boosted');
    expect(card.queryByText('37')).not.toBeInTheDocument();
    expect(card.queryByLabelText('LACES to spend')).not.toBeInTheDocument();
    expect(card.getByRole('button', { name: 'Boost' })).toHaveFocus();
    expect(refreshUser).toHaveBeenCalledTimes(1);
    // The other post is untouched.
    expect(cardOf('Selling my spare pair of Dunks').getByText('4').parentElement).toHaveTextContent('4 LACES boosted');

    // The API caches feed pages: a refresh can still carry the score from before the boost.
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(api.getFeed).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
    expect(cardOf('Restock on the wall at the Newbury St store').getByText('62')).toBeInTheDocument();

    // Once the feed reports a higher score, that one is shown.
    api.getFeed.mockResolvedValue([post({ boost_score: 80 }), mine]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await cardOf('Restock on the wall at the Newbury St store').findByText('80')).toBeInTheDocument();
  });

  it('reports each boost with the figures the API sent for it', async () => {
    api.boostPost
      .mockResolvedValueOnce(boostResult)
      .mockResolvedValueOnce({ success: true, boost_amount: 1, author_reward: 0, new_boost_score: 63, remaining_balance: 1174 });

    renderWithProviders(<FeedPage />);
    await screen.findByText('Restock on the wall at the Newbury St store');
    const card = cardOf('Restock on the wall at the Newbury St store');

    fireEvent.click(card.getByRole('button', { name: 'Boost' }));
    fill(card, 'LACES to spend', '25');
    fireEvent.click(card.getByRole('button', { name: 'Confirm boost' }));
    expect(await card.findByRole('status')).toHaveTextContent(
      'Boosted with 25 LACES: 12 went to the author. You have 1,175 LACES left.',
    );

    fireEvent.click(card.getByRole('button', { name: 'Boost' }));
    // The earlier report is gone while the next boost is being chosen; the amount is still the last one.
    expect(card.queryByRole('status')).not.toBeInTheDocument();
    expect(card.getByLabelText('LACES to spend')).toHaveValue(25);
    fill(card, 'LACES to spend', '1');
    fireEvent.click(card.getByRole('button', { name: 'Confirm boost' }));

    expect(await card.findByRole('status')).toHaveTextContent(
      'Boosted with 1 LACES: 0 went to the author. You have 1,174 LACES left.',
    );
    expect(api.boostPost).toHaveBeenLastCalledWith(THEIRS_ID, 1);
    expect(card.getByText('63').parentElement).toHaveTextContent('63 LACES boosted');
  });

  it('shows why the API refused a boost and leaves the score alone', async () => {
    api.boostPost.mockRejectedValue(new PostsApiError(400, 'Insufficient LACES balance'));

    renderWithProviders(<FeedPage />);
    await screen.findByText('Restock on the wall at the Newbury St store');
    const card = cardOf('Restock on the wall at the Newbury St store');

    fireEvent.click(card.getByRole('button', { name: 'Boost' }));
    fireEvent.click(card.getByRole('button', { name: 'Confirm boost' }));

    expect(await card.findByRole('alert')).toHaveTextContent('Insufficient LACES balance');
    expect(api.boostPost).toHaveBeenCalledWith(THEIRS_ID, 10);
    expect(card.getByText('37').parentElement).toHaveTextContent('37 LACES boosted');
    expect(card.queryByRole('status')).not.toBeInTheDocument();
    // The amount can be lowered and sent again.
    expect(card.getByLabelText('LACES to spend')).toBeEnabled();

    fireEvent.click(card.getByRole('button', { name: 'Cancel' }));
    expect(card.queryByRole('alert')).not.toBeInTheDocument();
    expect(card.getByRole('button', { name: 'Boost' })).toHaveFocus();
  });

  it.each(['0', '101', '2.5', ''])('does not send a boost of "%s" LACES', async (amount) => {
    renderWithProviders(<FeedPage />);
    await screen.findByText('Restock on the wall at the Newbury St store');
    const card = cardOf('Restock on the wall at the Newbury St store');

    fireEvent.click(card.getByRole('button', { name: 'Boost' }));
    fill(card, 'LACES to spend', amount);
    fireEvent.click(card.getByRole('button', { name: 'Confirm boost' }));

    expect(await card.findByRole('alert')).toHaveTextContent('Enter a whole number from 1 to 100.');
    expect(api.boostPost).not.toHaveBeenCalled();
    // The field itself says what is wrong with it, for someone who cannot see the message next to it.
    expect(card.getByLabelText('LACES to spend')).toBeInvalid();
    expect(card.getByLabelText('LACES to spend')).toHaveAccessibleDescription('Enter a whole number from 1 to 100.');
  });

  it('has other pages load their figures again after a boost, but does not reload the feed under the reader', async () => {
    const refreshUser = vi.fn(async () => undefined);
    api.boostPost.mockResolvedValue(boostResult);

    const otherPages = renderFeedBesideOtherPages({ auth: { refreshUser } });
    await screen.findByText('Restock on the wall at the Newbury St store');
    await waitFor(() => expect(otherPages.timesDependentRead()).toEqual(otherPages.once));
    const card = cardOf('Restock on the wall at the Newbury St store');

    fireEvent.click(card.getByRole('button', { name: 'Boost' }));
    expect(card.getByLabelText('LACES to spend')).toBeValid();
    fireEvent.click(card.getByRole('button', { name: 'Confirm boost' }));
    await card.findByRole('status');

    // LACES balance and earning summary, dashboard, heatmap, profile, leaderboards and quest progress.
    await waitFor(() => expect(otherPages.timesDependentRead()).toEqual(otherPages.twice));
    expect(otherPages.timesUnrelatedRead()).toBe(1);
    // The signed-in user's balance in the top bar comes from the account, which is read again too.
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(api.getFeed).toHaveBeenCalledTimes(1);
  });

  it('leaves other pages alone when a boost is refused', async () => {
    api.boostPost.mockRejectedValue(new PostsApiError(400, 'Insufficient LACES balance'));

    const otherPages = renderFeedBesideOtherPages();
    await screen.findByText('Restock on the wall at the Newbury St store');
    await waitFor(() => expect(otherPages.timesDependentRead()).toEqual(otherPages.once));
    const card = cardOf('Restock on the wall at the Newbury St store');

    fireEvent.click(card.getByRole('button', { name: 'Boost' }));
    fireEvent.click(card.getByRole('button', { name: 'Confirm boost' }));

    expect(await card.findByRole('alert')).toHaveTextContent('Insufficient LACES balance');
    expect(card.getByLabelText('LACES to spend')).toHaveAccessibleDescription('Insufficient LACES balance');
    expect(otherPages.timesDependentRead()).toEqual(otherPages.once);
    expect(api.getFeed).toHaveBeenCalledTimes(1);
  });

  it("offers a boost only on other people's posts and a delete only on the viewer's own", async () => {
    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');

    const own = cardOf('Selling my spare pair of Dunks');
    expect(own.queryByRole('button', { name: 'Boost' })).not.toBeInTheDocument();
    expect(own.getByRole('button', { name: 'Delete' })).toBeInTheDocument();

    const other = cardOf('Restock on the wall at the Newbury St store');
    expect(other.getByRole('button', { name: 'Boost' })).toBeInTheDocument();
    expect(other.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('takes a post off the feed when the API says it no longer exists', async () => {
    api.boostPost.mockRejectedValue(new PostsApiError(404, 'Post not found'));

    renderWithProviders(<FeedPage />);
    await screen.findByText('Restock on the wall at the Newbury St store');
    // The refetch that follows is still on its way: the post must leave the screen without it.
    api.getFeed.mockReturnValue(new Promise<Post[]>(() => undefined));
    const card = cardOf('Restock on the wall at the Newbury St store');
    fireEvent.click(card.getByRole('button', { name: 'Boost' }));
    fireEvent.click(card.getByRole('button', { name: 'Confirm boost' }));

    await waitFor(() => expect(screen.queryByText('Restock on the wall at the Newbury St store')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('That post no longer exists, so it was taken off the feed.');
    expect(screen.getByText('Selling my spare pair of Dunks')).toBeInTheDocument();
    await waitFor(() => expect(api.getFeed).toHaveBeenCalledTimes(2));
  });
});

describe('Feed page: deleting', () => {
  it("deletes the viewer's own post after a confirmation", async () => {
    api.deletePost.mockResolvedValue(undefined);

    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');
    const card = cardOf('Selling my spare pair of Dunks');

    fireEvent.click(card.getByRole('button', { name: 'Delete' }));
    expect(card.getByRole('group', { name: 'Confirm deleting this post' })).toHaveTextContent(
      'Delete this post? This cannot be undone.',
    );
    expect(api.deletePost).not.toHaveBeenCalled();

    // The refetch that follows is still on its way: the post must leave the screen without it.
    api.getFeed.mockReturnValue(new Promise<Post[]>(() => undefined));
    fireEvent.click(card.getByRole('button', { name: 'Delete post' }));

    await waitFor(() => expect(screen.queryByText('Selling my spare pair of Dunks')).not.toBeInTheDocument());
    expect(api.deletePost).toHaveBeenCalledTimes(1);
    expect(api.deletePost).toHaveBeenCalledWith(MINE_ID);
    expect(screen.getByRole('status')).toHaveTextContent('Post deleted.');
    expect(screen.getByText('Restock on the wall at the Newbury St store')).toBeInTheDocument();
    await waitFor(() => expect(api.getFeed).toHaveBeenCalledTimes(2));
  });

  it('takes a deleted post off the other lists that were loaded, and has other pages load again', async () => {
    api.deletePost.mockResolvedValue(undefined);
    api.getGlobalFeed.mockResolvedValue([mine, theirs]);

    const otherPages = renderFeedBesideOtherPages();
    await screen.findByText('Selling my spare pair of Dunks');
    // Load Latest too, then go back to Top.
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }));
    await waitFor(() => expect(api.getGlobalFeed).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expectPostsInOrder(['Selling my spare pair of Dunks', 'Restock on the wall at the Newbury St store']),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Top' }));
    await waitFor(() =>
      expectPostsInOrder(['Restock on the wall at the Newbury St store', 'Selling my spare pair of Dunks']),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
    await waitFor(() => expect(otherPages.timesDependentRead()).toEqual(otherPages.once));

    // From here on the API answers nothing more: what shows is what the page already holds.
    api.getFeed.mockReturnValue(new Promise<Post[]>(() => undefined));
    api.getGlobalFeed.mockReturnValue(new Promise<Post[]>(() => undefined));
    const card = cardOf('Selling my spare pair of Dunks');
    fireEvent.click(card.getByRole('button', { name: 'Delete' }));
    fireEvent.click(card.getByRole('button', { name: 'Delete post' }));
    await waitFor(() => expect(screen.queryByText('Selling my spare pair of Dunks')).not.toBeInTheDocument());

    await waitFor(() => expect(otherPages.timesDependentRead()).toEqual(otherPages.twice));
    expect(otherPages.timesUnrelatedRead()).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Latest' }));

    await waitFor(() => expectPostsInOrder(['Restock on the wall at the Newbury St store']));
    expect(screen.queryByText('Selling my spare pair of Dunks')).not.toBeInTheDocument();
    // "Post deleted." was about the other view.
    expect(screen.queryByText('Post deleted.')).not.toBeInTheDocument();
  });

  it('takes the post off the feed when the API says it was already deleted', async () => {
    api.deletePost.mockRejectedValue(new PostsApiError(404, 'Post not found'));

    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');
    // The refetch that follows is still on its way: the post must leave the screen without it.
    api.getFeed.mockReturnValue(new Promise<Post[]>(() => undefined));
    const card = cardOf('Selling my spare pair of Dunks');

    fireEvent.click(card.getByRole('button', { name: 'Delete' }));
    fireEvent.click(card.getByRole('button', { name: 'Delete post' }));

    await waitFor(() => expect(screen.queryByText('Selling my spare pair of Dunks')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('That post no longer exists, so it was taken off the feed.');
    expect(screen.queryByText('Post deleted.')).not.toBeInTheDocument();
    expect(screen.getByText('Restock on the wall at the Newbury St store')).toBeInTheDocument();
    await waitFor(() => expect(api.getFeed).toHaveBeenCalledTimes(2));
  });

  it('keeps the post when the deletion is called off', async () => {
    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');
    const card = cardOf('Selling my spare pair of Dunks');

    fireEvent.click(card.getByRole('button', { name: 'Delete' }));
    expect(card.getByRole('button', { name: 'Keep post' })).toHaveFocus();
    fireEvent.click(card.getByRole('button', { name: 'Keep post' }));

    expect(card.queryByRole('group', { name: 'Confirm deleting this post' })).not.toBeInTheDocument();
    expect(card.getByRole('button', { name: 'Delete' })).toHaveFocus();
    expect(api.deletePost).not.toHaveBeenCalled();
    expect(screen.getByText('Selling my spare pair of Dunks')).toBeInTheDocument();
  });

  it("keeps the post and shows the API's reason when the deletion fails", async () => {
    api.deletePost.mockRejectedValue(new PostsApiError(403, 'Not authorized to delete this post'));

    renderWithProviders(<FeedPage />);
    await screen.findByText('Selling my spare pair of Dunks');
    const card = cardOf('Selling my spare pair of Dunks');

    fireEvent.click(card.getByRole('button', { name: 'Delete' }));
    fireEvent.click(card.getByRole('button', { name: 'Delete post' }));

    expect(await card.findByRole('alert')).toHaveTextContent('Not authorized to delete this post');
    expect(screen.getByText('Selling my spare pair of Dunks')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(card.getByRole('button', { name: 'Delete post' })).toBeEnabled();
  });
});

describe('PostsAPI: what goes over the wire', () => {
  let real: typeof import('@/lib/api/posts');
  const fetchMock = vi.fn();

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
    real = await vi.importActual<typeof import('@/lib/api/posts')>('@/lib/api/posts');
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

  it('reads the feeds with skip and limit and the bearer token', async () => {
    fetchMock.mockImplementation(async () => json(200, [theirs]));

    await expect(real.PostsAPI.getFeed({ skip: 20, limit: 20 })).resolves.toEqual([theirs]);
    expect(lastRequest()).toMatchObject({
      path: '/posts/feed?skip=20&limit=20',
      method: 'GET',
      authorization: 'Bearer access-1',
    });

    await real.PostsAPI.getFeed();
    expect(lastRequest().path).toBe('/posts/feed');

    await real.PostsAPI.getGlobalFeed({ skip: 0, limit: 20 });
    expect(lastRequest()).toMatchObject({ path: '/posts/global?skip=0&limit=20', method: 'GET' });

    await real.PostsAPI.getUserPosts(SOMEONE_ELSE, { limit: 5 });
    expect(lastRequest()).toMatchObject({ path: `/posts/user/${SOMEONE_ELSE}?limit=5`, method: 'GET' });

    await real.PostsAPI.scanNearby({ latitude: 42.3601, longitude: -71.0589, radius: 5 });
    expect(lastRequest()).toMatchObject({
      path: '/v1/feed/scan?latitude=42.3601&longitude=-71.0589&radius=5',
      method: 'GET',
      authorization: 'Bearer access-1',
    });
  });

  it('posts a plain post to /posts/ and a pinned one to /v1/hyperlocal/signals', async () => {
    fetchMock.mockImplementation(async () => json(200, mine));

    await expect(real.PostsAPI.createPost({ post_type: 'GENERAL', content_text: 'hello', tags: ['a'] })).resolves.toEqual(mine);
    expect(lastRequest()).toEqual({
      path: '/posts/',
      method: 'POST',
      body: { post_type: 'GENERAL', content_text: 'hello', tags: ['a'] },
      authorization: 'Bearer access-1',
      contentType: 'application/json',
    });

    await real.PostsAPI.createSignal({ content_text: 'here', geo_tag_lat: 42.3601, geo_tag_long: -71.0589 });
    expect(lastRequest()).toEqual({
      path: '/v1/hyperlocal/signals',
      method: 'POST',
      body: { content_text: 'here', geo_tag_lat: 42.3601, geo_tag_long: -71.0589 },
      authorization: 'Bearer access-1',
      contentType: 'application/json',
    });
  });

  it('deletes with DELETE /posts/{id} and accepts the empty 204 answer', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(real.PostsAPI.deletePost(MINE_ID)).resolves.toBeUndefined();
    expect(lastRequest()).toMatchObject({
      path: `/posts/${MINE_ID}`,
      method: 'DELETE',
      authorization: 'Bearer access-1',
    });
  });

  it('boosts with the amount in the query string', async () => {
    fetchMock.mockImplementation(async () => json(200, boostResult));

    await expect(real.PostsAPI.boostPost(THEIRS_ID, 25)).resolves.toEqual(boostResult);
    expect(lastRequest()).toMatchObject({
      path: `/v1/laces/boost-post/${THEIRS_ID}?boost_amount=25`,
      method: 'POST',
      authorization: 'Bearer access-1',
    });

    await real.PostsAPI.boostSignal(THEIRS_ID);
    expect(lastRequest()).toMatchObject({ path: `/v1/hyperlocal/signals/${THEIRS_ID}/boost`, method: 'POST' });
  });

  it('refuses an answer it cannot read instead of handing it to the page', async () => {
    // Something in between answered 200 with a page of its own.
    fetchMock.mockResolvedValueOnce(new Response('<html>Gateway</html>', { status: 200 }));
    await expect(real.PostsAPI.getFeed()).rejects.toMatchObject({
      name: 'PostsApiError',
      status: 200,
      message: 'Could not load the feed: the server sent an answer that could not be read.',
    });

    // A list of posts is expected: anything else would break the page that maps over it.
    fetchMock.mockResolvedValueOnce(json(200, { posts: [theirs] }));
    await expect(real.PostsAPI.scanNearby({ latitude: 42.3601, longitude: -71.0589 })).rejects.toMatchObject({
      name: 'PostsApiError',
      message: 'Could not load posts near you: the server sent an answer that could not be read.',
    });
    fetchMock.mockResolvedValueOnce(json(200, null));
    await expect(real.PostsAPI.getGlobalFeed()).rejects.toMatchObject({
      message: 'Could not load the latest posts: the server sent an answer that could not be read.',
    });

    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    await expect(real.PostsAPI.createPost({ content_text: 'x' })).rejects.toMatchObject({
      name: 'PostsApiError',
      message: 'Could not publish the post: the server sent an answer that could not be read.',
    });
  });

  it("turns a refusal into an error carrying the API's detail and status", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { detail: 'Cannot boost your own post' }));
    await expect(real.PostsAPI.boostPost(MINE_ID, 10)).rejects.toMatchObject({
      name: 'PostsApiError',
      status: 400,
      message: 'Cannot boost your own post',
    });

    fetchMock.mockResolvedValueOnce(
      json(422, {
        detail: [
          { type: 'string_too_long', loc: ['body', 'content_text'], msg: 'String should have at most 5000 characters' },
        ],
      }),
    );
    await expect(real.PostsAPI.createPost({ content_text: 'x' })).rejects.toMatchObject({
      status: 422,
      message: 'content_text: String should have at most 5000 characters',
    });

    fetchMock.mockResolvedValueOnce(json(404, { detail: 'Post not found' }));
    await expect(real.PostsAPI.deletePost(MINE_ID)).rejects.toMatchObject({ status: 404, message: 'Post not found' });

    fetchMock.mockResolvedValueOnce(new Response('upstream timed out', { status: 502 }));
    await expect(real.PostsAPI.getFeed()).rejects.toMatchObject({
      status: 502,
      message: 'Could not load the feed (HTTP 502)',
    });

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(real.PostsAPI.getGlobalFeed()).rejects.toMatchObject({
      status: 0,
      message: 'Could not reach the server. Check your connection and try again.',
    });
  });
});
