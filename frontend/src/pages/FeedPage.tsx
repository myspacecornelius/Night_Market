import { useCallback, useId, useMemo, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import { CircleAlert, MapPin, RefreshCw } from "lucide-react";

import { PostComposer } from "@/components/composer/PostComposer";
import type { ViewerLocation } from "@/components/composer/PostComposer";
import { PostCard } from "@/components/posts/PostCard";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { PostsAPI, SCAN_MAX_RADIUS_KM, distanceKm } from "@/lib/api/posts";
import type { Post, PostBoostResult } from "@/lib/api/posts";

type FeedView = "top" | "latest" | "nearby";

const VIEWS: { value: FeedView; label: string }[] = [
    { value: "top", label: "Top" },
    { value: "latest", label: "Latest" },
    { value: "nearby", label: "Nearby" },
];

/** Every posts query starts with this key; the lists shown on this page start with FEED_KEY. */
const POSTS_KEY = ["posts"] as const;
const FEED_KEY = ["posts", "feed"] as const;
/**
 * What other pages have loaded that a new post, a deleted post or a boost changes: the LACES
 * balance, ledger and earning summary, the dashboard, the heatmap, the profile (its statistics
 * and list of posts), the leaderboards (LACES held, signals posted) and quest progress (posts
 * and boosts are counted). Queries are kept as fresh for a minute, so without this those pages
 * would go on showing the figures from before.
 */
const DEPENDENT_KEYS = [["laces"], ["dashboard"], ["heatmap"], ["profile"], ["leaderboard"], ["quests"]] as const;

const PAGE_SIZE = 20;
/** Offered scan radii; the last one is the widest the API accepts. */
const RADIUS_OPTIONS_KM = [1, 5, 25, SCAN_MAX_RADIUS_KM];
const DEFAULT_RADIUS_KM = 5;

type FeedData = InfiniteData<Post[], number>;

function describeLocationError(error: GeolocationPositionError): string {
    if (error.code === 1) {
        return "Location permission was denied. Allow location access for this site and try again.";
    }
    if (error.code === 3) return "Finding your location took too long. Try again.";
    return "Your location is not available right now. Try again.";
}

function LoadingPosts() {
    return (
        <div role="status" aria-label="Loading posts" className="space-y-4">
            {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="space-y-4 rounded-lg border p-6">
                    <div className="flex items-center space-x-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                </div>
            ))}
        </div>
    );
}

function ErrorNotice({
    title,
    error,
    onRetry,
    isRetrying,
}: {
    title: string;
    error: Error;
    onRetry: () => void;
    isRetrying: boolean;
}) {
    return (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div role="alert" className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                <div>
                    <p className="font-medium">{title}</p>
                    <p className="text-sm text-muted-foreground">{error.message}</p>
                </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
                Retry
            </Button>
        </div>
    );
}

export const FeedPage = () => {
    const { user, refreshUser } = useAuth();
    const queryClient = useQueryClient();
    const radiusId = useId();

    const [view, setView] = useState<FeedView>("top");
    const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
    const [location, setLocation] = useState<ViewerLocation>({ status: "idle" });
    const [notice, setNotice] = useState<string | null>(null);
    // Posts the viewer published during this visit, newest first: they stay on top of the list
    // (the Top order would otherwise put a post without boosts below every boosted one).
    const [ownNewPosts, setOwnNewPosts] = useState<Post[]>([]);
    // Scores the boost endpoint reported. The API caches feed pages for up to a minute and a
    // boost does not clear that cache, so a refetch can still carry the score from before.
    const [boostedScores, setBoostedScores] = useState<Record<string, number>>({});

    const latitude = location.status === "ready" ? location.latitude : null;
    const longitude = location.status === "ready" ? location.longitude : null;
    const hasPosition = latitude !== null && longitude !== null;

    const requestLocation = useCallback(() => {
        if (!("geolocation" in navigator)) {
            setLocation({ status: "error", message: "This browser cannot share its location." });
            return;
        }
        setLocation({ status: "locating" });
        navigator.geolocation.getCurrentPosition(
            ({ coords }) =>
                setLocation({
                    status: "ready",
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
                }),
            (error) => setLocation({ status: "error", message: describeLocationError(error) }),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
        );
    }, []);

    const feedQuery = useInfiniteQuery({
        queryKey:
            view === "nearby" ? [...FEED_KEY, "nearby", latitude, longitude, radiusKm] : [...FEED_KEY, view],
        queryFn: ({ pageParam }): Promise<Post[]> => {
            if (view === "top") return PostsAPI.getFeed({ skip: pageParam, limit: PAGE_SIZE });
            if (view === "latest") return PostsAPI.getGlobalFeed({ skip: pageParam, limit: PAGE_SIZE });
            if (latitude === null || longitude === null) {
                return Promise.reject(new Error("Share your location to see posts near you."));
            }
            return PostsAPI.scanNearby({ latitude, longitude, radius: radiusKm });
        },
        initialPageParam: 0,
        // A full page may be followed by more; the nearby scan is not paged.
        getNextPageParam: (lastPage, _pages, lastPageParam) =>
            view !== "nearby" && lastPage.length === PAGE_SIZE ? lastPageParam + PAGE_SIZE : undefined,
        enabled: view !== "nearby" || hasPosition,
    });

    const posts = useMemo(() => {
        const fetched = feedQuery.data?.pages.flat() ?? [];
        const fetchedById = new Map(fetched.map((post) => [post.post_id, post]));
        // Nearby lists what is pinned within the radius: a new post without a location, or one
        // pinned further away (the viewer has moved since), does not belong there.
        const ownHere =
            view !== "nearby"
                ? ownNewPosts
                : ownNewPosts.filter(
                      (post) =>
                          post.geo_tag_lat !== null &&
                          post.geo_tag_long !== null &&
                          latitude !== null &&
                          longitude !== null &&
                          distanceKm(
                              { latitude, longitude },
                              { latitude: post.geo_tag_lat, longitude: post.geo_tag_long },
                          ) <= radiusKm,
                  );
        // Prefer the copy the feed returned: it is the more recent of the two.
        const ownFirst = ownHere.map((post) => fetchedById.get(post.post_id) ?? post);

        const seen = new Set<string>();
        const merged: Post[] = [];
        for (const post of [...ownFirst, ...fetched]) {
            // Pages are cut by position, so a post can repeat when the feed moved between two requests.
            if (seen.has(post.post_id)) continue;
            seen.add(post.post_id);
            // A score only ever grows, so the larger of the two values is the newer one.
            const boosted = boostedScores[post.post_id];
            merged.push(boosted !== undefined && boosted > post.boost_score ? { ...post, boost_score: boosted } : post);
        }
        return merged;
    }, [feedQuery.data, ownNewPosts, boostedScores, view, latitude, longitude, radiusKm]);

    const selectView = (next: FeedView) => {
        setView(next);
        setNotice(null);
        // Choosing Nearby is the request to use the location, so ask for it right away.
        if (next === "nearby" && location.status === "idle") requestLocation();
    };

    /** Take a post off the screen right away, in every list that holds it. */
    const dropPost = (postId: string) => {
        setOwnNewPosts((current) => current.filter((post) => post.post_id !== postId));
        queryClient.setQueriesData<FeedData>({ queryKey: FEED_KEY }, (data) =>
            data && { ...data, pages: data.pages.map((page) => page.filter((post) => post.post_id !== postId)) },
        );
    };

    const refreshDependentPages = () => {
        for (const queryKey of DEPENDENT_KEYS) {
            void queryClient.invalidateQueries({ queryKey });
        }
    };

    const handleCreated = (post: Post) => {
        setOwnNewPosts((current) => [post, ...current]);
        setNotice(
            post.geo_tag_lat !== null && post.geo_tag_long !== null
                ? "Your signal is live and pinned to your location."
                : "Your post is live.",
        );
        void queryClient.invalidateQueries({ queryKey: POSTS_KEY });
        refreshDependentPages();
    };

    const handleDeleted = (post: Post) => {
        dropPost(post.post_id);
        setNotice("Post deleted.");
        void queryClient.invalidateQueries({ queryKey: POSTS_KEY });
        refreshDependentPages();
    };

    const handleGone = (post: Post) => {
        dropPost(post.post_id);
        setNotice("That post no longer exists, so it was taken off the feed.");
        void queryClient.invalidateQueries({ queryKey: POSTS_KEY });
    };

    const handleBoosted = (post: Post, result: PostBoostResult) => {
        setBoostedScores((current) => ({
            ...current,
            [post.post_id]: Math.max(current[post.post_id] ?? 0, result.new_boost_score),
        }));
        // The lists are out of date now, but refetching at once would only return the page the API
        // has cached (or reorder the list under the reader): mark them stale for the next refresh.
        void queryClient.invalidateQueries({ queryKey: POSTS_KEY, refetchType: "none" });
        // The boost moved LACES from the viewer to the author.
        refreshDependentPages();
        // The signed-in user's balance (shown in the top bar) changed too. The boost itself
        // succeeded, so a failed refresh of the account is not an error to report here.
        refreshUser().catch(() => undefined);
    };

    const viewer = user
        ? { user_id: user.user_id, display_name: user.display_name?.trim() || user.username, avatar_url: user.avatar_url }
        : null;
    const viewerPosition = latitude !== null && longitude !== null ? { latitude, longitude } : null;
    const needsLocation = view === "nearby" && !hasPosition;

    let errorTitle = "Could not load the feed";
    if (feedQuery.isFetchNextPageError) errorTitle = "Could not load more posts";
    else if (feedQuery.data) errorTitle = "Could not refresh the feed. Showing the posts loaded earlier.";

    return (
        <div className="space-y-4">
            <h1 className="sr-only">Community feed</h1>
            <div className="sticky top-0 z-10 space-y-3 bg-background/95 pb-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <PostComposer location={location} onRequestLocation={requestLocation} onCreated={handleCreated} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div role="group" aria-label="Feed view" className="inline-flex items-center gap-1 rounded-md bg-muted p-1">
                        {VIEWS.map((option) => (
                            <Button
                                key={option.value}
                                type="button"
                                size="sm"
                                variant={view === option.value ? "secondary" : "ghost"}
                                aria-pressed={view === option.value}
                                onClick={() => selectView(option.value)}
                            >
                                {option.label}
                            </Button>
                        ))}
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
                        onClick={() => void feedQuery.refetch()}
                        disabled={needsLocation || feedQuery.isFetching}
                    >
                        {feedQuery.isRefetching ? "Refreshing…" : "Refresh"}
                    </Button>
                </div>
            </div>

            {/* Kept mounted, so that screen readers announce a message when it arrives. */}
            <p role="status" className={notice ? "rounded-md border bg-muted/50 px-4 py-2 text-sm" : "sr-only"}>
                {notice}
            </p>

            {view === "nearby" && (
                <div className="space-y-3 rounded-lg border p-4 text-sm">
                    {(location.status === "idle" || location.status === "locating") && (
                        <p role="status" className="text-muted-foreground">
                            Finding your location…
                        </p>
                    )}
                    {location.status === "error" && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p role="alert" className="text-destructive">
                                {location.message}
                            </p>
                            <Button type="button" variant="outline" size="sm" onClick={requestLocation}>
                                Try again
                            </Button>
                        </div>
                    )}
                    {location.status === "ready" && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="flex items-center gap-1 text-muted-foreground">
                                <MapPin className="h-4 w-4" aria-hidden="true" />
                                Posts pinned around {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <Label htmlFor={radiusId}>Radius</Label>
                                <select
                                    id={radiusId}
                                    value={radiusKm}
                                    onChange={(event) => setRadiusKm(Number(event.target.value))}
                                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                                >
                                    {RADIUS_OPTIONS_KM.map((km) => (
                                        <option key={km} value={km}>
                                            {km} km
                                        </option>
                                    ))}
                                </select>
                                <Button type="button" variant="ghost" size="sm" onClick={requestLocation}>
                                    Update location
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {!needsLocation && (
                <>
                    {feedQuery.isError && (
                        <ErrorNotice
                            title={errorTitle}
                            error={feedQuery.error}
                            onRetry={() =>
                                void (feedQuery.isFetchNextPageError ? feedQuery.fetchNextPage() : feedQuery.refetch())
                            }
                            isRetrying={feedQuery.isFetching}
                        />
                    )}

                    {posts.length > 0 && (
                        <ul aria-label="Posts" className="space-y-4">
                            {posts.map((post) => (
                                <li key={post.post_id}>
                                    <PostCard
                                        post={post}
                                        viewer={viewer}
                                        viewerPosition={viewerPosition}
                                        onBoosted={handleBoosted}
                                        onDeleted={handleDeleted}
                                        onGone={handleGone}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* Also below the viewer's own new posts, which show while the rest of a list loads. */}
                    {feedQuery.isLoading && <LoadingPosts />}

                    {feedQuery.isSuccess && posts.length === 0 && (
                        <div className="py-8 text-center text-muted-foreground">
                            {view === "nearby"
                                ? `No posts are pinned within ${radiusKm} km of you yet. Pin one to put this spot on the map.`
                                : "No posts yet. Be the first to share something!"}
                        </div>
                    )}

                    {feedQuery.hasNextPage && !feedQuery.isFetchNextPageError && (
                        <div className="flex justify-center">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void feedQuery.fetchNextPage()}
                                disabled={feedQuery.isFetchingNextPage}
                            >
                                {feedQuery.isFetchingNextPage ? "Loading more…" : "Load more"}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default FeedPage;
