import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { KarmaBar } from "./KarmaBar";
import { PostMetaBar } from "./PostMetaBar";
import { motion } from "framer-motion";

type PostCardProps = {
    post: {
        author: {
            name: string;
            avatarUrl?: string;
        };
        distance: string;
        timestamp: string;
        content: string;
        karma: number;
    };
};

export const PostCard = ({ post }: PostCardProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <Card>
                <CardContent className="p-4">
                    <PostMetaBar
                        author={post.author}
                        distance={post.distance}
                        timestamp={post.timestamp}
                    />
                    <p className="mt-4">{post.content}</p>
                </CardContent>
                <CardFooter className="p-4">
                    <KarmaBar
                        karma={post.karma}
                        onUpvote={() => { }}
                        onDownvote={() => { }}
                    />
                </CardFooter>
            </Card>
        </motion.div>
    );
};
