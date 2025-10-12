import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { 
  Trophy, 
  Medal, 
  Award, 
  Search, 
  Filter, 
  Calendar,
  TrendingUp,
  Users,
  Crown,
  Star,
  Zap
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/cn'
import { apiClient } from '@/lib/api-client'
import { useAuth } from '@/hooks/useAuth'
import { useWebSocket } from '@/hooks/useWebSocket'

interface LeaderboardEntry {
  id: string
  rank: number
  user: {
    id: string
    username: string
    displayName: string
    avatar?: string
  }
  score: number
  change: number
  streak: number
  badges: string[]
  lastActive: string
}

interface LeaderboardData {
  entries: LeaderboardEntry[]
  totalUsers: number
  userRank?: number
}

type TimeFrame = '24h' | '7d' | '30d' | 'all'
type LeaderboardType = 'overall' | 'activity' | 'achievements' | 'contributions'

export default function Leaderboard() {
  const { user } = useAuth()
  const { subscribe } = useWebSocket()
  const [searchTerm, setSearchTerm] = useState('')
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('7d')
  const [leaderboardType, setLeaderboardType] = useState<LeaderboardType>('overall')
  const [showFilters, setShowFilters] = useState(false)

  // Mock data - would come from API
  const { data: leaderboardData, isLoading } = useQuery({
    queryKey: ['leaderboard', leaderboardType, timeFrame],
    queryFn: async (): Promise<LeaderboardData> => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const mockEntries: LeaderboardEntry[] = Array.from({ length: 50 }, (_, i) => ({
        id: `user-${i + 1}`,
        rank: i + 1,
        user: {
          id: `user-${i + 1}`,
          username: `user${i + 1}`,
          displayName: `User ${i + 1}`,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=user${i + 1}`
        },
        score: Math.max(1000 - i * 20 + Math.random() * 100, 10),
        change: Math.floor(Math.random() * 20) - 10,
        streak: Math.floor(Math.random() * 30),
        badges: ['contributor', 'explorer', 'achiever'].slice(0, Math.floor(Math.random() * 3) + 1),
        lastActive: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString()
      }))

      return {
        entries: mockEntries,
        totalUsers: mockEntries.length,
        userRank: user ? Math.floor(Math.random() * 50) + 1 : undefined
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  // Filter entries based on search term
  const filteredEntries = useMemo(() => {
    if (!leaderboardData?.entries) return []
    
    return leaderboardData.entries.filter(entry =>
      entry.user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.user.username.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [leaderboardData?.entries, searchTerm])

  // Subscribe to real-time leaderboard updates
  React.useEffect(() => {
    const unsubscribe = subscribe('leaderboard_update', (data) => {
      // Handle real-time leaderboard updates
      console.log('Leaderboard update:', data)
    })

    return unsubscribe
  }, [subscribe])

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="h-5 w-5 text-yellow-500" />
      case 2:
        return <Medal className="h-5 w-5 text-gray-400" />
      case 3:
        return <Award className="h-5 w-5 text-amber-600" />
      default:
        return <span className="text-sm font-bold text-muted-foreground">#{rank}</span>
    }
  }

  const getBadgeIcon = (badge: string) => {
    switch (badge) {
      case 'contributor':
        return <Star className="h-3 w-3" />
      case 'explorer':
        return <TrendingUp className="h-3 w-3" />
      case 'achiever':
        return <Zap className="h-3 w-3" />
      default:
        return <Trophy className="h-3 w-3" />
    }
  }

  const timeFrameLabels = {
    '24h': 'Last 24 Hours',
    '7d': 'Last 7 Days',
    '30d': 'Last 30 Days',
    'all': 'All Time'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Leaderboard</h1>
          <p className="text-muted-foreground">
            See how you rank among {leaderboardData?.totalUsers || 0} users
          </p>
        </div>
        
        {/* User's Current Rank */}
        {user && leaderboardData?.userRank && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-lg"
          >
            <Trophy className="h-4 w-4" />
            <span className="font-medium">Your Rank: #{leaderboardData.userRank}</span>
          </motion.div>
        )}
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Time Frame */}
            <Select value={timeFrame} onValueChange={(value: TimeFrame) => setTimeFrame(value)}>
              <SelectTrigger className="w-[180px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(timeFrameLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filters Toggle */}
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(showFilters && 'bg-muted')}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
          </div>

          {/* Advanced Filters */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 pt-4 border-t"
              >
                <Tabs value={leaderboardType} onValueChange={(value: LeaderboardType) => setLeaderboardType(value)}>
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="overall">Overall</TabsTrigger>
                    <TabsTrigger value="activity">Activity</TabsTrigger>
                    <TabsTrigger value="achievements">Achievements</TabsTrigger>
                    <TabsTrigger value="contributions">Contributions</TabsTrigger>
                  </TabsList>
                </Tabs>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            {timeFrameLabels[timeFrame]} Rankings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 animate-pulse">
                  <div className="w-8 h-8 bg-muted rounded-full" />
                  <div className="w-10 h-10 bg-muted rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="w-32 h-4 bg-muted rounded" />
                    <div className="w-24 h-3 bg-muted rounded" />
                  </div>
                  <div className="w-16 h-6 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {filteredEntries.map((entry, index) => (
                  <motion.div
                    key={entry.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.2, delay: index * 0.02 }}
                    className={cn(
                      'flex items-center gap-4 p-4 rounded-lg transition-all duration-200 hover:bg-muted/50',
                      entry.rank <= 3 && 'bg-gradient-to-r from-primary/5 to-transparent border border-primary/20',
                      user?.id === entry.user.id && 'ring-2 ring-primary/50 bg-primary/5'
                    )}
                  >
                    {/* Rank */}
                    <div className="flex items-center justify-center w-8">
                      {getRankIcon(entry.rank)}
                    </div>

                    {/* Avatar */}
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={entry.user.avatar} alt={entry.user.displayName} />
                      <AvatarFallback>
                        {entry.user.displayName.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-foreground truncate">
                          {entry.user.displayName}
                        </h3>
                        {user?.id === entry.user.id && (
                          <Badge variant="secondary" className="text-xs">You</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>@{entry.user.username}</span>
                        {entry.streak > 0 && (
                          <div className="flex items-center gap-1">
                            <Zap className="h-3 w-3 text-orange-500" />
                            <span>{entry.streak} day streak</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Badges */}
                    <div className="hidden sm:flex items-center gap-1">
                      {entry.badges.map((badge) => (
                        <Badge
                          key={badge}
                          variant="outline"
                          className="text-xs flex items-center gap-1"
                        >
                          {getBadgeIcon(badge)}
                          <span className="capitalize">{badge}</span>
                        </Badge>
                      ))}
                    </div>

                    {/* Score and Change */}
                    <div className="text-right">
                      <div className="font-bold text-foreground">
                        {entry.score.toLocaleString()}
                      </div>
                      {entry.change !== 0 && (
                        <div className={cn(
                          'text-xs flex items-center gap-1',
                          entry.change > 0 ? 'text-green-600' : 'text-red-600'
                        )}>
                          <TrendingUp className={cn(
                            'h-3 w-3',
                            entry.change < 0 && 'rotate-180'
                          )} />
                          {entry.change > 0 ? '+' : ''}{entry.change}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {filteredEntries.length === 0 && searchTerm && (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No users found matching "{searchTerm}"</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
