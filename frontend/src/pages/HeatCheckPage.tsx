import { HeatCheckCard } from "@/components/posts/HeatCheckCard";
import { PostComposer } from "@/components/composer/PostComposer";
import {
    Dialog,
    DialogContent,
    DialogTrigger,
} from "@/components/ui/dialog";
import { posts as mockPosts } from "@/mocks/posts";
import { motion } from "framer-motion";
import { useState } from "react";

// TODO(api): Fetch posts from the API instead of using mock data.
// The expected data shape is defined in docs/FRONTEND_HANDOFF.md.

export const HeatCheckPage = () => {
    const [posts, setPosts] = useState(
        mockPosts.filter((post) => post.post_type === "heat_check") as any[]
    );

    const handleSavePost = (newPost: any) => {
        if (newPost.type === "heat-check") {
            setPosts(prevPosts => [newPost, ...prevPosts]);
        }
    };

    return (
        <div>
            <div className="mb-4">
                <PostComposer onSave={handleSavePost} />
            </div>
            <div className="columns-2 gap-4 sm:columns-3">
                {posts.map((post) => (
                    <Dialog key={post.id}>
                        <DialogTrigger asChild>
                            <div className="mb-4 break-inside-avoid">
                                <HeatCheckCard post={post} />
                            </div>
                        </DialogTrigger>
                        <DialogContent className="p-0">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.3 }}
                            >
                                <HeatCheckCard post={post} />
                            </motion.div>
                        </DialogContent>
                    </Dialog>
                ))}
            </div>
        </div>
    );
};
