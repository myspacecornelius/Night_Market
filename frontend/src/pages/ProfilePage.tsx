import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// TODO(api): Fetch profile data from the API instead of using mock data.
// The expected data shape is defined in docs/FRONTEND_HANDOFF.md.

export const ProfilePage = () => {
    return (
        <div className="space-y-4">
            <Card>
                <CardContent className="flex items-center space-x-4 p-4">
                    <Avatar className="h-24 w-24">
                        <AvatarImage src="https://github.com/shadcn.png" alt="User" />
                        <AvatarFallback>U</AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold">Username</h1>
                        <p className="text-muted-foreground">Location</p>
                        <div className="flex items-center space-x-2">
                            <Badge>Karma: 1,234</Badge>
                            <Badge variant="secondary">Pro</Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Tabs defaultValue="posts">
                <TabsList>
                    <TabsTrigger value="posts">Posts</TabsTrigger>
                    <TabsTrigger value="heat-checks">Heat Checks</TabsTrigger>
                    <TabsTrigger value="intel">Intel</TabsTrigger>
                </TabsList>
                <TabsContent value="posts">
                    <div className="text-center text-muted-foreground">
                        No posts yet.
                    </div>
                </TabsContent>
                <TabsContent value="heat-checks">
                    <div className="text-center text-muted-foreground">
                        No heat checks yet.
                    </div>
                </TabsContent>
                <TabsContent value="intel">
                    <div className="text-center text-muted-foreground">
                        No intel yet.
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
};
