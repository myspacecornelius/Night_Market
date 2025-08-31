import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { motion } from "framer-motion";
import { KarmaBar } from "./KarmaBar";
import { PostMetaBar } from "./PostMetaBar";

type HeatCheckCardProps = {
    post: {
        author: {
            name: string;
            avatarUrl?: string;
        };
        distance: string;
        timestamp: string;
        images: string[];
        karma: number;
    };
};

export const HeatCheckCard = ({ post }: HeatCheckCardProps) => {
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
                    <motion.div className="mt-4 overflow-hidden rounded-lg">
                        <motion.div
                            className="flex"
                            drag="x"
                            dragConstraints={{ left: -post.images.length * 100, right: 0 }}
                        >
                            {post.images.map((image, index) => (
                                <motion.div key={index} className="flex-shrink-0">
                                    <img
                                        src={image}
                                        alt={`Heat Check Image ${index + 1}`}
                                        className="h-full w-full object-cover"
                                    />
                                </motion.div>
                            ))}
                        </motion.div>
                    </motion.div>
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
