import { Inbox } from 'lucide-react';

type EmptyStateProps = {
    title?: string;
    message?: string;
};

export const EmptyState = ({
    title = "Nothing to see here",
    message = "Check back later for new posts.",
}: EmptyStateProps) => {
    return (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted bg-muted/50 p-12 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-background">
                <Inbox className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="mt-6 text-xl font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        </div>
    );
};
