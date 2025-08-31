import { PostCard } from "@/components/posts/PostCard";
import { PostComposer } from "@/components/composer/PostComposer";
import { useEffect, useState } from "react";

// This is a temporary data transformation function.
// We will need to update this once we have the full data from the backend.
const transformPostData = (post: any) => {
    return {
        id: post.post_id,
        author: {
            name: post.user_id, // Using user_id as a placeholder for author name
            avatarUrl: "",
        },
        distance: "1.0 km", // Placeholder
        timestamp: post.timestamp,
        content: post.content_text,
        karma: 0, // Placeholder
        post_type: post.content_type,
    };
};

export const FeedPage = () => {
    const [posts, setPosts] = useState([]);

    useEffect(() => {
        const fetchPosts = async () => {
            try {
                const response = await fetch(`${import.meta.env.VITE_API_URL}/api/posts/global`);
                if (!response.ok) {
                    throw new Error("Network response was not ok");
                }
                const data = await response.json();
                setPosts(data.map(transformPostData));
            } catch (error) {
                console.error("Error fetching posts:", error);
            }
        };

        fetchPosts();
    }, []);

    const handleSavePost = (newPost: any) => {
        setPosts(prevPosts => [transformPostData(newPost), ...prevPosts]);
    };

    return (
        <div className="space-y-4">
            <div className="sticky top-0 z-10 bg-background/95 pb-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <PostComposer onSave={handleSavePost} />
            </div>
            {posts.map((post) => (
                <PostCard key={post.id} post={post} />
            ))}
        </div>
    );
};
