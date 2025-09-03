import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// TODO(api): Fetch drop zones from the API instead of using mock data.
// The expected data shape is defined in docs/FRONTEND_HANDOFF.md.
// TODO(websocket): Connect to WebSocket for real-time event feed updates.

const dropZones = [
    {
        id: "1",
        name: "Downtown Drop",
        radius: "1 mi",
        activeWindow: "12:00 PM - 2:00 PM",
        distance: "0.2 mi",
    },
    {
        id: "2",
        name: "Uptown Haul",
        radius: "2 mi",
        activeWindow: "3:00 PM - 5:00 PM",
        distance: "1.5 mi",
    },
];

export const DropZonesPage = () => {
    return (
        <div className="space-y-4">
            {dropZones.map((zone) => (
                <Card key={zone.id}>
                    <CardHeader>
                        <CardTitle>{zone.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">Radius</p>
                            <p>{zone.radius}</p>
                        </div>
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">Active Window</p>
                            <p>{zone.activeWindow}</p>
                        </div>
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">Distance</p>
                            <Badge variant="secondary">{zone.distance}</Badge>
                        </div>
                        <Button className="w-full">Join Zone</Button>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
};
