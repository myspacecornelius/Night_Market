import { Button } from '@/components/ui/Button';
import { AlertTriangle } from 'lucide-react';

type ErrorStateProps = {
    title?: string;
    message?: string;
    onRetry?: () => void;
};

export const ErrorState = ({
    title = "Something went wrong",
    message = "We couldn't load this content. Please try again.",
    onRetry,
}: ErrorStateProps) => {
    return (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-destructive/50 bg-destructive/5 p-12 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-background">
                <AlertTriangle className="h-10 w-10 text-destructive" />
            </div>
            <h3 className="mt-6 text-xl font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            {onRetry && (
                <Button onClick={onRetry} variant="destructive" className="mt-6">
                    Try Again
                </Button>
            )}
        </div>
    );
};
