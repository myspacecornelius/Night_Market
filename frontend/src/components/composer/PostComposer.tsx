import { useId, useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    POST_MAX_TAGS,
    POST_MEDIA_URL_MAX_LENGTH,
    POST_TAG_MAX_LENGTH,
    POST_TEXT_MAX_LENGTH,
    POST_TYPES,
    POST_TYPE_LABELS,
    PostsAPI,
} from "@/lib/api/posts";
import type { CreatePostRequest, Post, PostType } from "@/lib/api/posts";

/** Where the browser says the viewer is, or how far along finding that out is. */
export type ViewerLocation =
    | { status: "idle" }
    | { status: "locating" }
    | { status: "ready"; latitude: number; longitude: number; accuracy: number | null }
    | { status: "error"; message: string };

interface PostComposerProps {
    /** The viewer's position. The page owns it so the feed and the composer share one lookup. */
    location: ViewerLocation;
    /** Ask the browser for the current position; the user may be prompted for permission. */
    onRequestLocation: () => void;
    /** The API accepted the post: this is the post it returned. */
    onCreated: (post: Post) => void;
}

interface Submission {
    draft: CreatePostRequest;
    /** Set when the post is pinned to the viewer's position, which makes it a hyperlocal signal. */
    pin: { latitude: number; longitude: number } | null;
}

const DEFAULT_POST_TYPE: PostType = "GENERAL";

const SELECT_CLASS =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

/** "jordan, #restock, jordan" becomes ["jordan", "restock"]. */
function parseTags(input: string): string[] {
    const tags: string[] = [];
    for (const piece of input.split(",")) {
        const tag = piece.trim().replace(/^#+/, "").trim();
        if (tag && !tags.includes(tag)) tags.push(tag);
    }
    return tags;
}

function isHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}

export const PostComposer = ({ location, onRequestLocation, onCreated }: PostComposerProps) => {
    const typeId = useId();
    const textId = useId();
    const tagsId = useId();
    const tagsHintId = useId();
    const mediaId = useId();
    const pinId = useId();
    const pinHintId = useId();

    const [isOpen, setIsOpen] = useState(false);
    const [postType, setPostType] = useState<PostType>(DEFAULT_POST_TYPE);
    const [text, setText] = useState("");
    const [tagsInput, setTagsInput] = useState("");
    const [mediaUrl, setMediaUrl] = useState("");
    const [isPinned, setIsPinned] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const publish = useMutation({
        mutationFn: ({ draft, pin }: Submission) =>
            pin
                ? PostsAPI.createSignal({ ...draft, geo_tag_lat: pin.latitude, geo_tag_long: pin.longitude })
                : PostsAPI.createPost(draft),
        onSuccess: (post) => {
            setPostType(DEFAULT_POST_TYPE);
            setText("");
            setTagsInput("");
            setMediaUrl("");
            setIsPinned(false);
            setIsOpen(false);
            onCreated(post);
        },
    });

    const changeOpen = (next: boolean) => {
        // While a post is on its way the dialog stays open: closing it would hide how the request
        // ended, and opening it again would offer to send the same draft a second time.
        if (publish.isPending) return;
        setIsOpen(next);
        // The draft is kept when the dialog is closed; only an old error message is dropped.
        setFormError(null);
        publish.reset();
        // A draft that was left pinned comes back pinned: look up where the viewer is by now.
        if (next && isPinned && location.status !== "locating") onRequestLocation();
    };

    const togglePin = (checked: boolean) => {
        setIsPinned(checked);
        // The pin is for where the viewer is now. A position found earlier in the visit may be
        // from somewhere else by now, so every time the pin is switched on it is looked up again.
        if (checked && location.status !== "locating") onRequestLocation();
    };

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        // The API would accept an empty or blank post, so that is checked here.
        const content = text.trim();
        if (!content) {
            setFormError("Write something before posting.");
            return;
        }
        const tags = parseTags(tagsInput);
        if (tags.length > POST_MAX_TAGS) {
            setFormError(`Use at most ${POST_MAX_TAGS} tags.`);
            return;
        }
        const longTag = tags.find((tag) => tag.length > POST_TAG_MAX_LENGTH);
        if (longTag !== undefined) {
            setFormError(
                `A tag can be at most ${POST_TAG_MAX_LENGTH} characters long: "${longTag.slice(0, 20)}…" is longer.`,
            );
            return;
        }
        const media = mediaUrl.trim();
        if (media && !isHttpUrl(media)) {
            setFormError("The image link must be a web address starting with http:// or https://.");
            return;
        }
        if (media.length > POST_MEDIA_URL_MAX_LENGTH) {
            setFormError(`The image link can be at most ${POST_MEDIA_URL_MAX_LENGTH} characters long.`);
            return;
        }
        if (isPinned && location.status !== "ready") {
            setFormError("Your location is not known yet. Wait for it, or turn the pin off.");
            return;
        }
        setFormError(null);

        const draft: CreatePostRequest = { post_type: postType, content_text: content };
        if (tags.length > 0) draft.tags = tags;
        if (media) draft.media_url = media;
        publish.mutate({
            draft,
            pin:
                isPinned && location.status === "ready"
                    ? { latitude: location.latitude, longitude: location.longitude }
                    : null,
        });
    };

    const problem = formError ?? (publish.isError ? publish.error.message : null);
    const isWaitingForLocation = isPinned && location.status !== "ready";

    return (
        <Dialog open={isOpen} onOpenChange={changeOpen}>
            <DialogTrigger asChild>
                <Button className="w-full">Create Post</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create a new post</DialogTitle>
                    <DialogDescription>Share what you are seeing with the community.</DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} noValidate className="grid gap-4">
                    <div className="space-y-2">
                        <Label htmlFor={typeId}>Post type</Label>
                        <select
                            id={typeId}
                            value={postType}
                            onChange={(event) => setPostType(event.target.value as PostType)}
                            disabled={publish.isPending}
                            className={SELECT_CLASS}
                        >
                            {POST_TYPES.map((type) => (
                                <option key={type} value={type}>
                                    {POST_TYPE_LABELS[type]}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor={textId}>What's on your mind?</Label>
                        <Textarea
                            id={textId}
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            maxLength={POST_TEXT_MAX_LENGTH}
                            disabled={publish.isPending}
                            className="min-h-[120px]"
                        />
                        <p className="text-right text-xs text-muted-foreground">
                            {text.length} / {POST_TEXT_MAX_LENGTH}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor={tagsId}>Tags (optional)</Label>
                        <Input
                            id={tagsId}
                            value={tagsInput}
                            onChange={(event) => setTagsInput(event.target.value)}
                            aria-describedby={tagsHintId}
                            disabled={publish.isPending}
                        />
                        <p id={tagsHintId} className="text-xs text-muted-foreground">
                            Separate tags with commas: up to {POST_MAX_TAGS}, each at most {POST_TAG_MAX_LENGTH}{" "}
                            characters.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor={mediaId}>Image link (optional)</Label>
                        <Input
                            id={mediaId}
                            type="url"
                            inputMode="url"
                            placeholder="https://"
                            value={mediaUrl}
                            onChange={(event) => setMediaUrl(event.target.value)}
                            maxLength={POST_MEDIA_URL_MAX_LENGTH}
                            disabled={publish.isPending}
                        />
                    </div>

                    <div className="space-y-2 rounded-md border p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="space-y-1">
                                <Label htmlFor={pinId}>Pin to my current location</Label>
                                <p id={pinHintId} className="text-xs text-muted-foreground">
                                    A pinned post is a hyperlocal signal: people scanning nearby see it.
                                </p>
                            </div>
                            <Switch
                                id={pinId}
                                checked={isPinned}
                                onCheckedChange={togglePin}
                                aria-describedby={pinHintId}
                                disabled={publish.isPending}
                            />
                        </div>

                        {isPinned && location.status === "idle" && (
                            <Button type="button" variant="outline" size="sm" onClick={onRequestLocation}>
                                Use my location
                            </Button>
                        )}
                        {isPinned && location.status === "locating" && (
                            <p role="status" className="text-sm text-muted-foreground">
                                Finding your location…
                            </p>
                        )}
                        {isPinned && location.status === "ready" && (
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">
                                    <MapPin className="mr-1 h-3 w-3" aria-hidden="true" />
                                    {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                                    {location.accuracy !== null && ` (within ${Math.round(location.accuracy)} m)`}
                                </Badge>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={onRequestLocation}
                                    disabled={publish.isPending}
                                >
                                    Update location
                                </Button>
                            </div>
                        )}
                        {isPinned && location.status === "error" && (
                            <div className="flex flex-wrap items-center gap-2">
                                <p role="alert" className="text-sm text-destructive">
                                    {location.message}
                                </p>
                                <Button type="button" variant="outline" size="sm" onClick={onRequestLocation}>
                                    Try again
                                </Button>
                            </div>
                        )}
                    </div>

                    {problem && (
                        <p role="alert" className="text-sm text-destructive">
                            {problem}
                        </p>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0">
                        <DialogClose asChild>
                            <Button type="button" variant="outline" disabled={publish.isPending}>
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button
                            type="submit"
                            disabled={publish.isPending || !text.trim() || isWaitingForLocation}
                        >
                            {publish.isPending ? "Posting…" : "Post"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
