import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '../components/ui/dialog';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { 
  Users, 
  Shield, 
  Settings, 
  TrendingUp, 
  AlertTriangle,
  Coins,
  Eye,
  Ban,
  CheckCircle,
  XCircle
} from 'lucide-react';

interface AdminUser {
  user_id: string;
  username: string;
  email: string;
  display_name: string;
  laces_balance: number;
  total_posts: number;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
  last_active_at: string;
}

interface AdminPost {
  post_id: string;
  user_id: string;
  username: string;
  content_text: string;
  post_type: string;
  boost_score: number;
  timestamp: string;
  visibility: string;
  is_flagged?: boolean;
}

interface SystemSettings {
  daily_laces_stipend: number;
  boost_cost: number;
  max_posts_per_hour: number;
  enable_auto_moderation: boolean;
  maintenance_mode: boolean;
}

export const Admin: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    daily_laces_stipend: 100,
    boost_cost: 10,
    max_posts_per_hour: 20,
    enable_auto_moderation: true,
    maintenance_mode: false,
  });
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [lacesAmount, setLacesAmount] = useState<number>(0);
  const [lacesReason, setLacesReason] = useState<string>('');

  useEffect(() => {
    loadUsers();
    loadPosts();
    loadSettings();
  }, []);

  const loadUsers = async () => {
    try {
      // This would call the admin users endpoint
      const mockUsers: AdminUser[] = [
        {
          user_id: '1',
          username: 'sneakerhead_mike',
          email: 'mike@example.com',
          display_name: 'Mike Johnson',
          laces_balance: 2450,
          total_posts: 89,
          is_verified: true,
          is_active: true,
          created_at: '2024-01-15T10:30:00Z',
          last_active_at: '2024-09-01T04:30:00Z',
        },
        {
          user_id: '2',
          username: 'boost_hunter',
          email: 'hunter@example.com',
          display_name: 'Boost Hunter',
          laces_balance: 2210,
          total_posts: 156,
          is_verified: false,
          is_active: true,
          created_at: '2024-02-01T14:20:00Z',
          last_active_at: '2024-09-01T03:45:00Z',
        },
      ];
      setUsers(mockUsers);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const loadPosts = async () => {
    try {
      // This would call the admin posts endpoint with moderation flags
      const mockPosts: AdminPost[] = [
        {
          post_id: '1',
          user_id: '1',
          username: 'sneakerhead_mike',
          content_text: 'Travis Scott Jordan 4s spotted at Footlocker downtown!',
          post_type: 'SPOTTED',
          boost_score: 45,
          timestamp: '2024-09-01T04:20:00Z',
          visibility: 'public',
          is_flagged: false,
        },
        {
          post_id: '2',
          user_id: '2',
          username: 'boost_hunter',
          content_text: 'Possible bot activity at Nike store - unusually long lines',
          post_type: 'INTEL_REPORT',
          boost_score: 23,
          timestamp: '2024-09-01T04:15:00Z',
          visibility: 'public',
          is_flagged: true,
        },
      ];
      setPosts(mockPosts);
    } catch (error) {
      console.error('Failed to load posts:', error);
    }
  };

  const loadSettings = async () => {
    // Load system settings from backend
  };

  const adjustLacesBalance = async () => {
    if (!selectedUser || lacesAmount === 0) return;
    
    try {
      // Call admin endpoint to adjust LACES balance
      const response = await fetch('/admin/laces/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedUser.user_id,
          amount: lacesAmount,
          reason: lacesReason || 'Admin adjustment',
        }),
      });
      
      if (response.ok) {
        // Refresh users list
        loadUsers();
        setSelectedUser(null);
        setLacesAmount(0);
        setLacesReason('');
      }
    } catch (error) {
      console.error('Failed to adjust LACES balance:', error);
    }
  };

  const toggleUserStatus = async (userId: string, active: boolean) => {
    try {
      const response = await fetch(`/admin/users/${userId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: active }),
      });
      
      if (response.ok) {
        loadUsers();
      }
    } catch (error) {
      console.error('Failed to toggle user status:', error);
    }
  };

  const moderatePost = async (postId: string, action: 'approve' | 'remove') => {
    try {
      const response = await fetch(`/admin/posts/${postId}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      
      if (response.ok) {
        loadPosts();
      }
    } catch (error) {
      console.error('Failed to moderate post:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground">Community management and system configuration</p>
        </div>
        <Badge variant="secondary" className="flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Administrator
        </Badge>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="economy">Economy</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>Manage community members and their permissions</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>LACES</TableHead>
                    <TableHead>Posts</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.user_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-medium">@{user.username}</div>
                            <div className="text-sm text-muted-foreground">{user.display_name}</div>
                          </div>
                          {user.is_verified && (
                            <Badge variant="secondary" className="h-5">
                              <CheckCircle className="h-3 w-3" />
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{user.laces_balance.toLocaleString()}</TableCell>
                      <TableCell>{user.total_posts}</TableCell>
                      <TableCell>
                        <Badge variant={user.is_active ? 'default' : 'destructive'}>
                          {user.is_active ? 'Active' : 'Suspended'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(user.last_active_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setSelectedUser(user)}
                              >
                                <Coins className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Adjust LACES Balance</DialogTitle>
                                <DialogDescription>
                                  Modify {user.username}'s LACES balance
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <Label htmlFor="amount">Amount</Label>
                                  <Input
                                    id="amount"
                                    type="number"
                                    value={lacesAmount}
                                    onChange={(e) => setLacesAmount(Number(e.target.value))}
                                    placeholder="Enter amount (positive to add, negative to remove)"
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="reason">Reason</Label>
                                  <Textarea
                                    id="reason"
                                    value={lacesReason}
                                    onChange={(e) => setLacesReason(e.target.value)}
                                    placeholder="Reason for adjustment..."
                                  />
                                </div>
                                <Button onClick={adjustLacesBalance} className="w-full">
                                  Apply Changes
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                          <Button
                            variant={user.is_active ? 'destructive' : 'default'}
                            size="sm"
                            onClick={() => toggleUserStatus(user.user_id, !user.is_active)}
                          >
                            {user.is_active ? <Ban className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="posts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Content Moderation</CardTitle>
              <CardDescription>Review and moderate community posts</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Author</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posts.map((post) => (
                    <TableRow key={post.post_id}>
                      <TableCell>
                        <div className="font-medium">@{post.username}</div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate">{post.content_text}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{post.post_type}</Badge>
                      </TableCell>
                      <TableCell className="font-mono">{post.boost_score}</TableCell>
                      <TableCell>
                        {post.is_flagged ? (
                          <Badge variant="destructive" className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Flagged
                          </Badge>
                        ) : (
                          <Badge variant="default">
                            <CheckCircle className="h-3 w-3" />
                            Clean
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => moderatePost(post.post_id, 'approve')}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => moderatePost(post.post_id, 'remove')}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="economy" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Coins className="h-5 w-5" />
                  LACES Economy
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Daily Stipend Amount</Label>
                  <Input
                    type="number"
                    value={settings.daily_laces_stipend}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      daily_laces_stipend: Number(e.target.value)
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Boost Cost</Label>
                  <Input
                    type="number"
                    value={settings.boost_cost}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      boost_cost: Number(e.target.value)
                    }))}
                  />
                </div>
                <Button className="w-full">Update Economy Settings</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Token Distribution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">247,582</div>
                  <div className="text-sm text-muted-foreground">Total LACES in circulation</div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Held by Users</span>
                    <span>89.2%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Treasury Reserve</span>
                    <span>10.8%</span>
                  </div>
                </div>
                <Button variant="outline" className="w-full">
                  View Full Report
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Generate Economy Report
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Users className="h-4 w-4 mr-2" />
                  Export User Data
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Eye className="h-4 w-4 mr-2" />
                  View Audit Log
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  System Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Max Posts per Hour</Label>
                  <Input
                    type="number"
                    value={settings.max_posts_per_hour}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      max_posts_per_hour: Number(e.target.value)
                    }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Auto Moderation</Label>
                  <Button
                    variant={settings.enable_auto_moderation ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSettings(prev => ({
                      ...prev,
                      enable_auto_moderation: !prev.enable_auto_moderation
                    }))}
                  >
                    {settings.enable_auto_moderation ? 'Enabled' : 'Disabled'}
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Maintenance Mode</Label>
                  <Button
                    variant={settings.maintenance_mode ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => setSettings(prev => ({
                      ...prev,
                      maintenance_mode: !prev.maintenance_mode
                    }))}
                  >
                    {settings.maintenance_mode ? 'ON' : 'OFF'}
                  </Button>
                </div>
                <Button className="w-full">Save Settings</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>System Health</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>API Status</span>
                    <Badge variant="default">Healthy</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Database</span>
                    <Badge variant="default">Connected</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Redis Cache</span>
                    <Badge variant="default">Connected</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>WebSocket</span>
                    <Badge variant="default">Active</Badge>
                  </div>
                </div>
                <Button variant="outline" className="w-full">
                  Run System Diagnostics
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;