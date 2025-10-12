import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { 
  Zap, 
  MapPin, 
  Users, 
  TrendingUp, 
  Target,
  Activity,
  Coins,
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
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'

// Mock data for demonstration
const generateMockActivityData = () => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return days.map(day => ({
    date: day,
    signals: Math.floor(Math.random() * 20) + 5,
    laces: Math.floor(Math.random() * 100) + 20,
    posts: Math.floor(Math.random() * 15) + 3
  }))
}

interface DashboardMetrics {
  lacesBalance: number
  lacesEarnedToday: number
  activeSignals: number
  nearbyActivity: number
  communityRank: number
  totalViews: number
  weeklyGrowth: number
}

export default function Dashboard() {
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d'>('7d')
  const [activityData, setActivityData] = useState(generateMockActivityData())

  // Fetch user data
  const { data: currentUser, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => apiClient.getCurrentUser(),
    retry: false,
    staleTime: 5 * 60 * 1000 // 5 minutes
  })

  // Mock metrics - in real app, this would come from API
  const metrics: DashboardMetrics = {
    lacesBalance: currentUser?.laces_balance || 1250,
    lacesEarnedToday: 45,
    activeSignals: 12,
    nearbyActivity: 8,
    communityRank: 247,
    totalViews: 1420,
    weeklyGrowth: 12.5
  }

  // Health check to test backend connectivity
  const { data: healthData } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.healthCheck(),
    refetchInterval: 30000, // Check every 30 seconds
    retry: 1
  })

  const handleTimeframeChange = (newTimeframe: '7d' | '30d' | '90d') => {
    setTimeframe(newTimeframe)
    // In real app, fetch new data based on timeframe
    setActivityData(generateMockActivityData())
    toast.success(`Switched to ${newTimeframe} view`)
  }

  const handleRefreshData = () => {
    setActivityData(generateMockActivityData())
    toast.success('Dashboard data refreshed')
  }

  if (userLoading) {
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
          value={metrics.lacesBalance}
          subtitle="Your reputation currency"
          icon={Zap}
          trend={{
            value: 8.2,
            label: 'vs last week',
            isPositive: true
          }}
          delay={0}
        />
        
        <MetricsCard
          title="Active Signals"
          value={metrics.activeSignals}
          subtitle="In your area"
          icon={MapPin}
          trend={{
            value: 15.3,
            label: 'vs yesterday',
            isPositive: true
          }}
          delay={0.1}
        />
        
        <MetricsCard
          title="Community Rank"
          value={`#${metrics.communityRank}`}
          subtitle="Out of 12,847 users"
          icon={Target}
          trend={{
            value: 3.1,
            label: 'positions up',
            isPositive: true
          }}
          delay={0.2}
        />
        
        <MetricsCard
          title="Total Views"
          value={metrics.totalViews}
          subtitle="Your signals reached"
          icon={Eye}
          trend={{
            value: metrics.weeklyGrowth,
            label: 'this week',
            isPositive: true
          }}
          delay={0.3}
        />
      </div>

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
          <RecentActivity />
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