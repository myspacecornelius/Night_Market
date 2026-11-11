import { useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { 
  Zap, 
  MapPin, 
  Users, 
  Target,
  Activity,
  Eye
} from 'lucide-react'
import { 
  MetricsCard, 
  ActivityChart, 
  QuickActions, 
  RecentActivity 
} from '@/components/dashboard'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api-client'
import type { DashboardActivityItem } from '@/lib/api-client'
import type { ActivityItem } from '@/components/dashboard/RecentActivity'
import { toast } from 'sonner'

const TIMEFRAME_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const

const POST_TYPE_TITLES: Record<DashboardActivityItem['postType'], string> = {
  SPOTTED: 'Sneaker spotted',
  STOCK_CHECK: 'Stock check',
  LINE_UPDATE: 'Line update',
  GENERAL: 'New signal',
  HEAT_CHECK: 'Heat check',
  INTEL_REPORT: 'Intel report',
}

const toActivityItem = (item: DashboardActivityItem): ActivityItem => ({
  id: item.id,
  type: 'signal',
  title: POST_TYPE_TITLES[item.postType] ?? 'New signal',
  description: item.message ?? '',
  timestamp: new Date(item.createdAt),
  user: { id: item.id, username: item.user.username, avatar: item.user.avatar ?? undefined },
  metadata: { signalType: item.postType },
  stats: { views: item.views, comments: item.replies },
})

export default function Dashboard() {
  const queryClient = useQueryClient()
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d'>('7d')

  // Fetch user data
  const { data: currentUser, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => apiClient.getCurrentUser(),
    retry: false,
    staleTime: 5 * 60 * 1000 // 5 minutes
  })

  const { data: metrics, isLoading: metricsLoading, isError: metricsFailed } = useQuery({
    queryKey: ['dashboard', 'metrics'],
    queryFn: () => apiClient.getDashboardMetrics(),
  })

  const { data: timeseries = [] } = useQuery({
    queryKey: ['dashboard', 'timeseries', timeframe],
    queryFn: () => apiClient.getDashboardTimeseries(TIMEFRAME_DAYS[timeframe]),
  })

  const { data: activity } = useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () => apiClient.getDashboardActivity(10),
  })

  const activityData = timeseries.map((point) => ({
    ...point,
    date: format(parseISO(point.date), 'MMM d'),
  }))
  const recentActivity = (activity?.items ?? []).map(toActivityItem)

  // Health check to test backend connectivity
  const { data: healthData } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.healthCheck(),
    refetchInterval: 30000, // Check every 30 seconds
    retry: 1
  })

  const handleTimeframeChange = (newTimeframe: '7d' | '30d' | '90d') => {
    setTimeframe(newTimeframe)
  }

  const handleRefreshData = async () => {
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    toast.success('Dashboard data refreshed')
  }

  if (userLoading || metricsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Welcome back{currentUser?.username ? `, ${currentUser.username}` : ''}! 🔥
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's what's happening in the underground network
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Backend Status */}
          <Badge 
            variant={healthData?.healthy ? "default" : "destructive"}
            className="text-xs"
          >
            <div className={`w-2 h-2 rounded-full mr-2 ${healthData?.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
            {healthData?.healthy ? 'API Connected' : 'API Offline'}
          </Badge>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRefreshData}
            className="gap-2"
          >
            <Activity className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricsCard
          title="LACES Balance"
          value={metrics?.lacesBalance ?? currentUser?.laces_balance ?? '—'}
          subtitle={metrics ? `+${metrics.lacesEarnedToday.toLocaleString()} earned today` : 'Your reputation currency'}
          icon={Zap}
          trend={
            metrics && metrics.weeklyGrowth !== null
              ? {
                  value: metrics.weeklyGrowth,
                  label: 'earned vs last week',
                  isPositive: metrics.weeklyGrowth >= 0
                }
              : undefined
          }
          delay={0}
        />
        
        <MetricsCard
          title="Active Signals"
          value={metrics?.activeSignals ?? '—'}
          subtitle="Public signals in the last 24 hours"
          icon={MapPin}
          delay={0.1}
        />
        
        <MetricsCard
          title="Community Rank"
          value={metrics ? `#${metrics.communityRank.toLocaleString()}` : '—'}
          subtitle={metrics ? `Out of ${metrics.totalUsers.toLocaleString()} members` : undefined}
          icon={Target}
          delay={0.2}
        />
        
        <MetricsCard
          title="Total Views"
          value={metrics?.totalViews ?? '—'}
          subtitle={metrics ? `Across your ${metrics.signalsPosted.toLocaleString()} signals` : undefined}
          icon={Eye}
          delay={0.3}
        />
      </div>

      {metricsFailed && (
        <p role="alert" className="text-sm text-destructive">
          Couldn't load your dashboard metrics. Try refreshing.
        </p>
      )}

      {/* Activity Chart */}
      <ActivityChart
        data={activityData}
        title="Your Activity"
        description="Track your engagement and LACES earnings over time"
        timeframe={timeframe}
        onTimeframeChange={handleTimeframeChange}
      />

      {/* Bottom Grid - Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <QuickActions />
        </div>
        
        <div className="xl:col-span-1">
          <RecentActivity activities={recentActivity} />
        </div>
      </div>

      {/* Welcome Card for New Users */}
      {currentUser && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          <Card className="bg-gradient-to-r from-primary/10 via-secondary/5 to-primary/10 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Join the Underground
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Connect with local sneakerheads, share intel, and earn LACES for contributing to the community.
              </p>
              <div className="flex gap-3">
                <Button size="sm" className="gap-2">
                  <MapPin className="h-4 w-4" />
                  Find Drop Zones
                </Button>
                <Button variant="outline" size="sm" className="gap-2">
                  <Zap className="h-4 w-4" />
                  Create First Signal
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  )
}