import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { 
  User, 
  Edit3, 
  Settings, 
  Trophy, 
  Calendar,
  MapPin,
  Mail,
  Globe,
  Shield,
  Bell,
  Eye,
  Camera,
  Save,
  X,
  Check,
  Star,
  Activity,
  Award,
  TrendingUp
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { FormField } from '@/components/forms/FormField'
import { cn } from '@/lib/cn'
import { apiClient } from '@/lib/api-client'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'

interface UserProfile {
  id: string
  username: string
  displayName: string
  email: string
  avatar?: string
  bio?: string
  location?: string
  website?: string
  joinedAt: string
  lastActive: string
  stats: {
    totalScore: number
    rank: number
    achievements: number
    connections: number
  }
  achievements: Array<{
    id: string
    name: string
    description: string
    iconName: string
    earnedAt: string
    rarity: 'common' | 'rare' | 'epic' | 'legendary'
  }>
  settings: {
    privacy: {
      profileVisibility: 'public' | 'friends' | 'private'
      showEmail: boolean
      showActivity: boolean
    }
    notifications: {
      email: boolean
      push: boolean
      achievements: boolean
      social: boolean
    }
  }
}

interface ProfileFormData {
  displayName: string
  bio: string
  location: string
  website: string
}

export default function Profile() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [formData, setFormData] = useState<ProfileFormData>({
    displayName: '',
    bio: '',
    location: '',
    website: ''
  })

  // Fetch user profile
  const { data: profile, isLoading } = useQuery({
    queryKey: ['userProfile', user?.id],
    queryFn: async (): Promise<UserProfile> => {
      // Mock data - would come from API
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      return {
        id: user?.id || 'user-1',
        username: user?.username || 'johndoe',
        displayName: user?.displayName || 'John Doe',
        email: user?.email || 'john@example.com',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`,
        bio: 'Full-stack developer passionate about creating amazing user experiences. Love working with React, TypeScript, and modern web technologies.',
        location: 'San Francisco, CA',
        website: 'https://johndoe.dev',
        joinedAt: '2023-01-15T00:00:00Z',
        lastActive: new Date().toISOString(),
        stats: {
          totalScore: 1250,
          rank: 15,
          achievements: 12,
          connections: 89
        },
        achievements: [
          {
            id: 'first-login',
            name: 'Welcome Aboard',
            description: 'Complete your first login',
            iconName: 'star',
            earnedAt: '2023-01-15T10:30:00Z',
            rarity: 'common'
          },
          {
            id: 'profile-complete',
            name: 'Profile Master',
            description: 'Complete your profile information',
            iconName: 'user',
            earnedAt: '2023-01-16T14:20:00Z',
            rarity: 'rare'
          },
          {
            id: 'top-contributor',
            name: 'Top Contributor',
            description: 'Rank in the top 20 contributors',
            iconName: 'trophy',
            earnedAt: '2023-02-28T09:15:00Z',
            rarity: 'epic'
          }
        ],
        settings: {
          privacy: {
            profileVisibility: 'public',
            showEmail: false,
            showActivity: true
          },
          notifications: {
            email: true,
            push: true,
            achievements: true,
            social: false
          }
        }
      }
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      return { ...profile, ...data }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] })
      toast.success('Profile updated successfully!')
      setIsEditing(false)
    },
    onError: () => {
      toast.error('Failed to update profile. Please try again.')
    }
  })

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: Partial<UserProfile['settings']>) => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500))
      return settings
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] })
      toast.success('Settings updated!')
    },
    onError: () => {
      toast.error('Failed to update settings.')
    }
  })

  React.useEffect(() => {
    if (profile && !isEditing) {
      setFormData({
        displayName: profile.displayName,
        bio: profile.bio || '',
        location: profile.location || '',
        website: profile.website || ''
      })
    }
  }, [profile, isEditing])

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleCancel = () => {
    setIsEditing(false)
    if (profile) {
      setFormData({
        displayName: profile.displayName,
        bio: profile.bio || '',
        location: profile.location || '',
        website: profile.website || ''
      })
    }
  }

  const handleSave = () => {
    updateProfileMutation.mutate(formData)
  }

  const handleInputChange = (field: keyof ProfileFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSettingChange = (category: 'privacy' | 'notifications', setting: string, value: boolean | string) => {
    if (profile) {
      const updatedSettings = {
        ...profile.settings,
        [category]: {
          ...profile.settings[category],
          [setting]: value
        }
      }
      updateSettingsMutation.mutate(updatedSettings)
    }
  }

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'common': return 'text-gray-600 bg-gray-100'
      case 'rare': return 'text-blue-600 bg-blue-100'
      case 'epic': return 'text-purple-600 bg-purple-100'
      case 'legendary': return 'text-yellow-600 bg-yellow-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getAchievementIcon = (iconName: string) => {
    switch (iconName) {
      case 'star': return <Star className="h-4 w-4" />
      case 'user': return <User className="h-4 w-4" />
      case 'trophy': return <Trophy className="h-4 w-4" />
      default: return <Award className="h-4 w-4" />
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 bg-muted rounded-full animate-pulse" />
          <div className="space-y-2">
            <div className="w-48 h-8 bg-muted rounded animate-pulse" />
            <div className="w-32 h-4 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-full h-32 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!profile) {
    return <div>Profile not found</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative"
      >
        <Card className="overflow-hidden">
          <div className="h-32 bg-gradient-to-r from-primary/20 via-primary/10 to-secondary/20" />
          <CardContent className="relative pt-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 -mt-10">
              <div className="relative">
                <Avatar className="w-20 h-20 border-4 border-background">
                  <AvatarImage src={profile.avatar} alt={profile.displayName} />
                  <AvatarFallback className="text-lg">
                    {profile.displayName.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full p-0"
                >
                  <Camera className="h-3 w-3" />
                </Button>
              </div>
              
              <div className="flex-1 space-y-1">
                {isEditing ? (
                  <FormField
                    value={formData.displayName}
                    onChange={(e) => handleInputChange('displayName', e.target.value)}
                    className="text-2xl font-bold"
                  />
                ) : (
                  <h1 className="text-2xl font-bold text-foreground">{profile.displayName}</h1>
                )}
                <p className="text-muted-foreground">@{profile.username}</p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>Joined {new Date(profile.joinedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Activity className="h-4 w-4" />
                    <span>Active {new Date(profile.lastActive).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancel}
                      disabled={updateProfileMutation.isPending}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={updateProfileMutation.isPending}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={handleEdit}>
                    <Edit3 className="h-4 w-4 mr-2" />
                    Edit Profile
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{profile.stats.totalScore.toLocaleString()}</div>
              <p className="text-sm text-muted-foreground">Total Score</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">#{profile.stats.rank}</div>
              <p className="text-sm text-muted-foreground">Global Rank</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{profile.stats.achievements}</div>
              <p className="text-sm text-muted-foreground">Achievements</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{profile.stats.connections}</div>
              <p className="text-sm text-muted-foreground">Connections</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="achievements">Achievements</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>About</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <FormField
                    label="Bio"
                    value={formData.bio}
                    onChange={(e) => handleInputChange('bio', e.target.value)}
                    placeholder="Tell us about yourself..."
                    type="textarea"
                  />
                ) : (
                  <p className="text-muted-foreground">
                    {profile.bio || 'No bio provided yet.'}
                  </p>
                )}

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Location</label>
                    {isEditing ? (
                      <FormField
                        value={formData.location}
                        onChange={(e) => handleInputChange('location', e.target.value)}
                        placeholder="City, Country"
                      />
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{profile.location || 'Not specified'}</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Website</label>
                    {isEditing ? (
                      <FormField
                        value={formData.website}
                        onChange={(e) => handleInputChange('website', e.target.value)}
                        placeholder="https://yourwebsite.com"
                      />
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        {profile.website ? (
                          <a
                            href={profile.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {profile.website}
                          </a>
                        ) : (
                          <span>Not specified</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="achievements" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  Achievements ({profile.achievements.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {profile.achievements.map((achievement) => (
                    <motion.div
                      key={achievement.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ scale: 1.02 }}
                      className="p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          'p-2 rounded-lg',
                          getRarityColor(achievement.rarity)
                        )}>
                          {getAchievementIcon(achievement.iconName)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-foreground">{achievement.name}</h3>
                          <p className="text-sm text-muted-foreground">{achievement.description}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className={cn('text-xs', getRarityColor(achievement.rarity))}>
                              {achievement.rarity}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(achievement.earnedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Activity tracking coming soon!</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Privacy Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-medium">Profile Visibility</label>
                    <p className="text-sm text-muted-foreground">Who can see your profile</p>
                  </div>
                  <select
                    value={profile.settings.privacy.profileVisibility}
                    onChange={(e) => handleSettingChange('privacy', 'profileVisibility', e.target.value)}
                    className="border rounded-md px-3 py-1"
                  >
                    <option value="public">Public</option>
                    <option value="friends">Friends Only</option>
                    <option value="private">Private</option>
                  </select>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-medium">Show Email</label>
                    <p className="text-sm text-muted-foreground">Display email on profile</p>
                  </div>
                  <Switch
                    checked={profile.settings.privacy.showEmail}
                    onCheckedChange={(checked) => handleSettingChange('privacy', 'showEmail', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-medium">Show Activity</label>
                    <p className="text-sm text-muted-foreground">Display recent activity</p>
                  </div>
                  <Switch
                    checked={profile.settings.privacy.showActivity}
                    onCheckedChange={(checked) => handleSettingChange('privacy', 'showActivity', checked)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" />
                  Notification Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-medium">Email Notifications</label>
                    <p className="text-sm text-muted-foreground">Receive updates via email</p>
                  </div>
                  <Switch
                    checked={profile.settings.notifications.email}
                    onCheckedChange={(checked) => handleSettingChange('notifications', 'email', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-medium">Push Notifications</label>
                    <p className="text-sm text-muted-foreground">Receive browser notifications</p>
                  </div>
                  <Switch
                    checked={profile.settings.notifications.push}
                    onCheckedChange={(checked) => handleSettingChange('notifications', 'push', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-medium">Achievement Alerts</label>
                    <p className="text-sm text-muted-foreground">Notify when you earn achievements</p>
                  </div>
                  <Switch
                    checked={profile.settings.notifications.achievements}
                    onCheckedChange={(checked) => handleSettingChange('notifications', 'achievements', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-medium">Social Updates</label>
                    <p className="text-sm text-muted-foreground">Notify about social interactions</p>
                  </div>
                  <Switch
                    checked={profile.settings.notifications.social}
                    onCheckedChange={(checked) => handleSettingChange('notifications', 'social', checked)}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  )
}
