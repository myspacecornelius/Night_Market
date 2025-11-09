import { PostCard } from "@/components/posts/PostCard";
import { PostComposer } from "@/components/composer/PostComposer";
import { useEffect, useState } from "react";
import { apiClient, type Post } from "@/lib/api-client";

// This is a temporary data transformation function.
// We will need to update this once we have the full data from the backend.
const transformPostData = (post: Post) => {
    return {
        id: post.post_id,
        author: {
            name: post.user_id, // Using user_id as a placeholder for author name
            avatarUrl: "",
        },
        distance: "1.0 km", // Placeholder
        timestamp: post.timestamp,
        content: post.content_text,
        karma: post.boost_score || 0,
        post_type: post.post_type,
    };
};

export const FeedPage = () => {
    const [posts, setPosts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchPosts = async () => {
            try {
                setIsLoading(true);
                setError(null);
                // Use the new getUserFeed endpoint which requires authentication
                const data = await apiClient.getUserFeed(0, 20);
                setPosts(data.map(transformPostData));
            } catch (error) {
                console.error("Error fetching posts:", error);
                setError("Failed to load feed. Please try again.");
                // Fallback to global feed if user feed fails (e.g., not authenticated)
                try {
                    const globalData = await apiClient.getGlobalFeed(0, 20);
                    setPosts(globalData.map(transformPostData));
                    setError(null);
                } catch (globalError) {
                    console.error("Error fetching global feed:", globalError);
                }
            } finally {
                setIsLoading(false);
            }
        };

        fetchPosts();
    }, []);

    const handleSavePost = async (newPost: any) => {
        try {
            const createdPost = await apiClient.createPost(newPost);
            setPosts(prevPosts => [transformPostData(createdPost), ...prevPosts]);
        } catch (error) {
            console.error("Error creating post:", error);
        }
    };

    return (
        <div className="space-y-4">
            <div className="sticky top-0 z-10 bg-background/95 pb-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <PostComposer onSave={handleSavePost} />
            </div>
            {isLoading && (
                <div className="text-center py-8 text-muted-foreground">
                    Loading feed...
                </div>
            )}
            {error && (
                <div className="text-center py-8 text-destructive">
                    {error}
                </div>
            )}
            {!isLoading && posts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                    No posts yet. Be the first to share something!
                </div>
            )}
            {posts.map((post) => (
                <PostCard key={post.id} post={post} />
            ))}
        </div>
    );
};
