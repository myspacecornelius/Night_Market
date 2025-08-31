import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { KarmaBar } from "./KarmaBar";
import { PostMetaBar } from "./PostMetaBar";

type IntelReportCardProps = {
    post: {
        author: {
            name: string;
            avatarUrl?: string;
        };
        distance: string;
        timestamp: string;
        store: string;
        model: string;
        sizes: string;
        price: string;
        karma: number;
    };
};

export const IntelReportCard = ({ post }: IntelReportCardProps) => {
    return (
        <Card>
            <CardContent className="p-4">
                <PostMetaBar
                    author={post.author}
                    distance={post.distance}
                    timestamp={post.timestamp}
                />
                <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Store</p>
                        <p>{post.store}</p>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Model</p>
                        <p>{post.model}</p>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Sizes</p>
                        <p>{post.sizes}</p>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Price</p>
                        <p>{post.price}</p>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="p-4">
                <KarmaBar
                    karma={post.karma}
                    onUpvote={() => { }}
                    onDownvote={() => { }}
                />
            </CardFooter>
        </Card>
    );
};
