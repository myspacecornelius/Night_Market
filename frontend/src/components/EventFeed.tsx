import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const EventFeed = () => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Event Feed</CardTitle>
            </CardHeader>
            <CardContent>
                <p>Event-scoped posts will be displayed here.</p>
            </CardContent>
        </Card>
    );
};
