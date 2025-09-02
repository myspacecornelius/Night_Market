import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { 
  MapPin, 
  Plus, 
  Users, 
  Clock, 
  Target, 
  Calendar, 
  CheckCircle, 
  AlertCircle, 
  Map,
  Navigation,
  Trophy,
  Share2
} from 'lucide-react';
import { Dropzones } from '@/lib/api-experiments';

interface DropZone {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  status: 'scheduled' | 'active' | 'ended' | 'cancelled';
  starts_at?: string;
  ends_at?: string;
  member_count: number;
  check_in_count: number;
  created_at: string;
}

interface DropZoneDetails extends DropZone {
  check_in_radius: number;
  rules?: string;
  tags?: string[];
  is_public: boolean;
  stats: {
    member_count: number;
    total_checkins: number;
    today_checkins: number;
  };
  recent_checkins: Array<{
    id: string;
    user_id: string;
    message?: string;
    streak_count: number;
    points_earned: number;
    checked_in_at: string;
  }>;
}

export default function DropzonesPage() {
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCheckInDialog, setShowCheckInDialog] = useState(false);
  const [checkInLocation, setCheckInLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [checkInMessage, setCheckInMessage] = useState('');
  
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    center_lat: 0,
    center_lng: 0,
    radius_meters: 100,
    check_in_radius: 50,
    starts_at: '',
    ends_at: '',
    rules: '',
    tags: [] as string[],
  });

  const queryClient = useQueryClient();

  // Fetch drop zones list
  const { data: dropzones, isLoading: zonesLoading } = useQuery<DropZone[]>({
    queryKey: ['dropzones'],
    queryFn: () => Dropzones.list({ active: true }),
    refetchInterval: 60000, // Refetch every minute
  });

  // Fetch selected zone details
  const { data: zoneDetails, isLoading: detailsLoading } = useQuery<DropZoneDetails>({
    queryKey: ['dropzone', selectedZone],
    queryFn: () => selectedZone ? Dropzones.get(selectedZone) : null,
    enabled: !!selectedZone,
  });

  // Create drop zone mutation
  const createZoneMutation = useMutation({
    mutationFn: (data: typeof createForm) => Dropzones.create(data),
    onSuccess: (data) => {
      toast.success('Drop zone created successfully!');
      setShowCreateDialog(false);
      setCreateForm({
        name: '',
        description: '',
        center_lat: 0,
        center_lng: 0,
        radius_meters: 100,
        check_in_radius: 50,
        starts_at: '',
        ends_at: '',
        rules: '',
        tags: [],
      });
      queryClient.invalidateQueries({ queryKey: ['dropzones'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create drop zone');
    },
  });

  // Join zone mutation
  const joinZoneMutation = useMutation({
    mutationFn: (zoneId: string) => Dropzones.join(zoneId),
    onSuccess: () => {
      toast.success('Successfully joined drop zone!');
      queryClient.invalidateQueries({ queryKey: ['dropzones'] });
      queryClient.invalidateQueries({ queryKey: ['dropzone', selectedZone] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to join zone');
    },
  });

  // Check-in mutation
  const checkInMutation = useMutation({
    mutationFn: ({ zoneId, data }: { zoneId: string; data: any }) => 
      Dropzones.checkin(zoneId, data),
    onSuccess: (data) => {
      toast.success(data.message || 'Successfully checked in!');
      setShowCheckInDialog(false);
      setCheckInMessage('');
      setCheckInLocation(null);
      queryClient.invalidateQueries({ queryKey: ['dropzones'] });
      queryClient.invalidateQueries({ queryKey: ['dropzone', selectedZone] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Check-in failed');
    },
  });

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by this browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCheckInLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        toast.success('Location acquired!');
      },
      (error) => {
        toast.error('Unable to get your location');
        console.error('Geolocation error:', error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleCheckIn = () => {
    if (!selectedZone || !checkInLocation) {
      toast.error('Location required for check-in');
      return;
    }

    checkInMutation.mutate({
      zoneId: selectedZone,
      data: {
        lat: checkInLocation.lat,
        lng: checkInLocation.lng,
        message: checkInMessage || undefined,
      },
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'scheduled': return 'bg-blue-500';
      case 'ended': return 'bg-gray-500';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const canCheckIn = (zone: DropZoneDetails) => {
    if (!checkInLocation) return false;
    const distance = calculateDistance(
      checkInLocation.lat, 
      checkInLocation.lng,
      zone.center_lat, 
      zone.center_lng
    );
    return distance <= zone.check_in_radius;
  };

  if (zonesLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <MapPin className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Drop Zones</h1>
        </div>
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Drop Zones</h1>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Zone
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Drop Zone</DialogTitle>
              <DialogDescription>
                Set up a new location-based gathering spot
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Zone Name</Label>
                <Input
                  id="name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Coffee meetup, Park hangout..."
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={createForm.description}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="What's this zone about?"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="lat">Latitude</Label>
                  <Input
                    id="lat"
                    type="number"
                    step="0.000001"
                    value={createForm.center_lat}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, center_lat: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div>
                  <Label htmlFor="lng">Longitude</Label>
                  <Input
                    id="lng"
                    type="number"
                    step="0.000001"
                    value={createForm.center_lng}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, center_lng: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="radius">Zone Radius (m)</Label>
                  <Input
                    id="radius"
                    type="number"
                    value={createForm.radius_meters}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, radius_meters: parseInt(e.target.value) || 100 }))}
                  />
                </div>
                <div>
                  <Label htmlFor="checkin_radius">Check-in Radius (m)</Label>
                  <Input
                    id="checkin_radius"
                    type="number"
                    value={createForm.check_in_radius}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, check_in_radius: parseInt(e.target.value) || 50 }))}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button 
                onClick={() => createZoneMutation.mutate(createForm)}
                disabled={createZoneMutation.isPending || !createForm.name}
              >
                {createZoneMutation.isPending ? 'Creating...' : 'Create Zone'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Zone List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {dropzones?.map((zone) => (
          <Card key={zone.id} className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg">{zone.name}</CardTitle>
                <Badge className={`${getStatusColor(zone.status)} text-white text-xs`}>
                  {zone.status}
                </Badge>
              </div>
              {zone.description && (
                <CardDescription>{zone.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  <span>{zone.member_count} members</span>
                </div>
                <div className="flex items-center gap-1">
                  <Target className="h-4 w-4" />
                  <span>{zone.check_in_count} check-ins</span>
                </div>
              </div>
              
              {zone.starts_at && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Starts: {formatDate(zone.starts_at)}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <div className="text-xs text-muted-foreground">
                  {zone.radius_meters}m radius
                </div>
                <Button 
                  size="sm" 
                  onClick={() => setSelectedZone(zone.id)}
                >
                  View Details
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* No zones state */}
      {dropzones?.length === 0 && (
        <Card className="py-12">
          <CardContent className="text-center">
            <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No active drop zones</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create the first drop zone to get people gathering!
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Zone
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Zone Details Modal */}
      {selectedZone && (
        <Dialog open={!!selectedZone} onOpenChange={() => setSelectedZone(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            {detailsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : zoneDetails && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {zoneDetails.name}
                    <Badge className={`${getStatusColor(zoneDetails.status)} text-white`}>
                      {zoneDetails.status}
                    </Badge>
                  </DialogTitle>
                  {zoneDetails.description && (
                    <DialogDescription>{zoneDetails.description}</DialogDescription>
                  )}
                </DialogHeader>

                <div className="space-y-6">
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-blue-600">{zoneDetails.stats.member_count}</div>
                      <div className="text-sm text-muted-foreground">Members</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">{zoneDetails.stats.total_checkins}</div>
                      <div className="text-sm text-muted-foreground">Total Check-ins</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-orange-600">{zoneDetails.stats.today_checkins}</div>
                      <div className="text-sm text-muted-foreground">Today</div>
                    </div>
                  </div>

                  {/* Location Info */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <strong>Location:</strong> {zoneDetails.center_lat.toFixed(4)}, {zoneDetails.center_lng.toFixed(4)}
                    </div>
                    <div>
                      <strong>Check-in Radius:</strong> {zoneDetails.check_in_radius}m
                    </div>
                  </div>

                  {/* Rules */}
                  {zoneDetails.rules && (
                    <div>
                      <h4 className="font-semibold mb-2">Rules & Guidelines</h4>
                      <p className="text-sm bg-muted p-3 rounded">{zoneDetails.rules}</p>
                    </div>
                  )}

                  {/* Tags */}
                  {zoneDetails.tags && zoneDetails.tags.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2">Tags</h4>
                      <div className="flex flex-wrap gap-2">
                        {zoneDetails.tags.map((tag, index) => (
                          <Badge key={index} variant="outline">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent Check-ins */}
                  {zoneDetails.recent_checkins.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2">Recent Check-ins</h4>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {zoneDetails.recent_checkins.map((checkin) => (
                          <div key={checkin.id} className="flex items-center justify-between p-2 border rounded">
                            <div className="flex-1">
                              {checkin.message && <p className="text-sm">{checkin.message}</p>}
                              <div className="text-xs text-muted-foreground">
                                {formatDate(checkin.checked_in_at)}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <Badge variant="secondary">
                                <Trophy className="h-3 w-3 mr-1" />
                                {checkin.streak_count}
                              </Badge>
                              <Badge variant="outline">
                                +{checkin.points_earned}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => joinZoneMutation.mutate(selectedZone)}
                    disabled={joinZoneMutation.isPending}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    {joinZoneMutation.isPending ? 'Joining...' : 'Join Zone'}
                  </Button>
                  
                  <Dialog open={showCheckInDialog} onOpenChange={setShowCheckInDialog}>
                    <DialogTrigger asChild>
                      <Button onClick={getCurrentLocation}>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Check In
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Check In to Zone</DialogTitle>
                        <DialogDescription>
                          Verify your location and check in to earn points and maintain your streak
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Navigation className="h-5 w-5" />
                          <span className="text-sm">
                            {checkInLocation ? (
                              <span className="text-green-600">
                                Location acquired ✓ 
                                {canCheckIn(zoneDetails) ? 
                                  ' (Within check-in range)' : 
                                  ' (Too far from zone)'
                                }
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Getting location...</span>
                            )}
                          </span>
                        </div>
                        
                        <div>
                          <Label htmlFor="checkin-message">Message (optional)</Label>
                          <Textarea
                            id="checkin-message"
                            value={checkInMessage}
                            onChange={(e) => setCheckInMessage(e.target.value)}
                            placeholder="Share what you're up to..."
                            maxLength={200}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button 
                          onClick={handleCheckIn}
                          disabled={checkInMutation.isPending || !checkInLocation || !canCheckIn(zoneDetails)}
                        >
                          {checkInMutation.isPending ? 'Checking In...' : 'Check In'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
