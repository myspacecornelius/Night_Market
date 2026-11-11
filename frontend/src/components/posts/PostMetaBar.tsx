import { formatDistanceToNow } from "date-fns";
import { MapPin } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { POST_TYPE_LABELS } from "@/lib/api/posts";
import type { PostType } from "@/lib/api/posts";

type PostMetaBarProps = {
    authorName: string;
    /** Shown in the avatar when there is no picture. */
    authorInitials: string;
    avatarUrl?: string | null;
    /** True when the signed-in user wrote the post. */
    isOwn: boolean;
    postType: PostType;
    /** ISO 8601 time the post was published. */
    timestamp: string;
    /** Where the post is pinned, worded for display; leave out for a post without a location. */
    locationLabel?: string | null;
};

/** "5 minutes ago", with the exact local time for the tooltip; the raw value if it is not a date. */
function describeTime(timestamp: string): { relative: string; exact: string | undefined } {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return { relative: timestamp, exact: undefined };
    // The API stamps posts with its own clock. When this device's clock runs behind it, a new
    // post would read "in 1 minute": nothing was posted in the future, so that counts as now.
    const shown = date.getTime() > Date.now() ? new Date() : date;
    return { relative: formatDistanceToNow(shown, { addSuffix: true }), exact: date.toLocaleString() };
}

export const PostMetaBar = ({
    authorName,
    authorInitials,
    avatarUrl,
    isOwn,
    postType,
    timestamp,
    locationLabel,
}: PostMetaBarProps) => {
    const time = describeTime(timestamp);

    return (
        <div className="flex items-center space-x-3">
            <Avatar>
                {/* The name is right next to the picture, so the picture itself is decorative. */}
                {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
                <AvatarFallback>{authorInitials}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{authorName}</span>
                    {isOwn && <Badge variant="secondary">You</Badge>}
                    <Badge variant="outline">{POST_TYPE_LABELS[postType] ?? postType}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                    <time dateTime={timestamp} title={time.exact}>
                        {time.relative}
                    </time>
                    {locationLabel && (
                        <>
                            <span aria-hidden="true">&middot;</span>
                            <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" aria-hidden="true" />
                                {locationLabel}
                            </span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
