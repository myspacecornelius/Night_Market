import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { PostsAPI, PostsApiError, distanceKm } from "@/lib/api/posts";
import type { Post, PostBoostResult } from "@/lib/api/posts";
import { KarmaBar } from "./KarmaBar";
import { PostMetaBar } from "./PostMetaBar";

/** What the card needs to know about the signed-in user. */
export type PostViewer = {
    user_id: string;
    display_name: string;
    avatar_url?: string | null;
};

export type ViewerPosition = {
    latitude: number;
    longitude: number;
};

type PostCardProps = {
    post: Post;
    /** The signed-in user: their own posts carry their name and can be deleted, not boosted. */
    viewer: PostViewer | null;
    /** Where the viewer is, if they shared it: a pinned post then says how far away it is. */
    viewerPosition?: ViewerPosition | null;
    onBoosted: (post: Post, result: PostBoostResult) => void;
    onDeleted: (post: Post) => void;
    /** The API answered that the post no longer exists. */
    onGone: (post: Post) => void;
};

function describeLocation(post: Post, viewerPosition: ViewerPosition | null | undefined): string | null {
    if (post.geo_tag_lat === null || post.geo_tag_long === null) return null;
    if (!viewerPosition) {
        return `Pinned at ${post.geo_tag_lat.toFixed(4)}, ${post.geo_tag_long.toFixed(4)}`;
    }
    const km = distanceKm(viewerPosition, { latitude: post.geo_tag_lat, longitude: post.geo_tag_long });
    if (km < 0.05) return "Less than 50 m away";
    // Below a kilometer, to the nearest 10 m; above it, one decimal until 10 km.
    const meters = Math.round(km * 100) * 10;
    if (meters < 1000) return `${meters} m away`;
    // Compare after rounding, so that 9.97 km reads "10 km" and not "10.0 km".
    const tenths = Math.round(km * 10) / 10;
    return `${tenths < 10 ? tenths.toFixed(1) : Math.round(km)} km away`;
}

function initialsOf(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join("");
}

function describeAuthor(post: Post, viewer: PostViewer | null) {
    if (viewer && viewer.user_id.toLowerCase() === post.user_id.toLowerCase()) {
        const name = viewer.display_name.trim() || "You";
        return { isOwn: true, name, initials: initialsOf(name), avatarUrl: viewer.avatar_url ?? null };
    }
    // The API's post carries the author's id but not their name or picture,
    // so other people are shown by a short form of that id.
    const shortId = post.user_id.slice(0, 8);
    return { isOwn: false, name: `User ${shortId}`, initials: shortId.slice(0, 2).toUpperCase(), avatarUrl: null };
}

/** media_url is free text on the API side: only treat it as a link when it is an http(s) URL. */
function mediaLink(mediaUrl: string | null): string | null {
    if (!mediaUrl) return null;
    try {
        const url = new URL(mediaUrl);
        return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
    } catch {
        return null;
    }
}

function isGone(error: Error): boolean {
    return error instanceof PostsApiError && error.status === 404;
}

export const PostCard = ({ post, viewer, viewerPosition, onBoosted, onDeleted, onGone }: PostCardProps) => {
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);

    // When the confirmation is called off, the keyboard focus returns to the Delete button.
    const deleteButtonRef = useRef<HTMLButtonElement>(null);
    const wasConfirmingDelete = useRef(false);
    useEffect(() => {
        if (wasConfirmingDelete.current && !isConfirmingDelete) deleteButtonRef.current?.focus();
        wasConfirmingDelete.current = isConfirmingDelete;
    }, [isConfirmingDelete]);

    const remove = useMutation({
        mutationFn: () => PostsAPI.deletePost(post.post_id),
        onSuccess: () => onDeleted(post),
        onError: (error) => {
            if (isGone(error)) onGone(post);
        },
    });

    const author = describeAuthor(post, viewer);
    const text = post.content_text?.trim() ?? "";
    const media = mediaLink(post.media_url);
    const tags = post.tags ?? [];

    return (
        <motion.article
            aria-label={`Post by ${author.name}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <Card>
                <CardContent className="p-4">
                    <PostMetaBar
                        authorName={author.name}
                        authorInitials={author.initials}
                        avatarUrl={author.avatarUrl}
                        isOwn={author.isOwn}
                        postType={post.post_type}
                        timestamp={post.timestamp}
                        locationLabel={describeLocation(post, viewerPosition)}
                    />
                    {text && <p className="mt-4 whitespace-pre-wrap break-words">{text}</p>}
                    {!text && !media && <p className="mt-4 italic text-muted-foreground">This post has no text.</p>}
                    {media && !imageFailed && (
                        <img
                            src={media}
                            alt="Image attached to this post"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={() => setImageFailed(true)}
                            className="mt-4 max-h-96 w-full rounded-md object-cover"
                        />
                    )}
                    {media && imageFailed && (
                        <a
                            href={media}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-4 inline-block break-all text-sm text-primary underline-offset-4 hover:underline"
                        >
                            Open the attached link
                        </a>
                    )}
                    {tags.length > 0 && (
                        <ul aria-label="Tags" className="mt-4 flex flex-wrap gap-2">
                            {tags.map((tag, index) => (
                                <li key={`${tag}-${index}`}>
                                    <Badge variant="secondary">#{tag}</Badge>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
                <CardFooter className="flex-col items-stretch gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                        <KarmaBar
                            postId={post.post_id}
                            score={post.boost_score}
                            canBoost={!author.isOwn}
                            onBoosted={(result) => onBoosted(post, result)}
                            onBoostFailed={(error) => {
                                if (isGone(error)) onGone(post);
                            }}
                        />
                        {author.isOwn && !isConfirmingDelete && (
                            <Button
                                ref={deleteButtonRef}
                                type="button"
                                variant="ghost"
                                size="sm"
                                leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                                onClick={() => {
                                    remove.reset();
                                    setIsConfirmingDelete(true);
                                }}
                            >
                                Delete
                            </Button>
                        )}
                    </div>

                    {author.isOwn && isConfirmingDelete && (
                        <div
                            role="group"
                            aria-label="Confirm deleting this post"
                            className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 p-3 text-sm"
                        >
                            <span className="mr-auto">Delete this post? This cannot be undone.</span>
                            <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => remove.mutate()}
                                disabled={remove.isPending}
                            >
                                {remove.isPending ? "Deleting…" : "Delete post"}
                            </Button>
                            <Button
                                autoFocus
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsConfirmingDelete(false)}
                                disabled={remove.isPending}
                            >
                                Keep post
                            </Button>
                        </div>
                    )}

                    {remove.isError && (
                        <p role="alert" className="text-sm text-destructive">
                            {remove.error.message}
                        </p>
                    )}
                </CardFooter>
            </Card>
        </motion.article>
    );
};
