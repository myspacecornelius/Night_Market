import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/Badge";

type PostMetaBarProps = {
    author: {
        name: string;
        avatarUrl?: string;
    };
    distance: string;
    timestamp: string;
    isAnon?: boolean;
};

export const PostMetaBar = ({
    author,
    distance,
    timestamp,
    isAnon = false,
}: PostMetaBarProps) => {
    return (
        <div className="flex items-center space-x-3">
            <Avatar>
                <AvatarImage src={author.avatarUrl} alt={author.name} />
                <AvatarFallback>{author.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
                <div className="flex items-center space-x-2">
                    <span className="font-semibold">{isAnon ? "Anon" : author.name}</span>
                    {isAnon && <Badge variant="secondary">Anon</Badge>}
                </div>
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <span>{distance}</span>
                    <span>&middot;</span>
                    <span>{timestamp}</span>
                </div>
            </div>
        </div>
    );
};
