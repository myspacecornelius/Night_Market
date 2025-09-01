import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  TrendingUp, 
  Users, 
  Activity, 
  DollarSign, 
  Target, 
  Zap,
  Globe,
  MapPin,
  Trophy,
  Coins,
  BarChart3
} from 'lucide-react';
import { useWebSocket, useTaskUpdates, useLacesUpdates } from '../components/WebSocketProvider';
import AnimatedButton from '../components/ui/animated-button';
import { useStaggeredIntersection } from '../hooks/useIntersectionObserver';

interface MetricsData {
  active_monitors: number;
  running_tasks: number;
  completed_tasks: number;
  success_rate: number;
  avg_checkout_time_ms: number;
  total_spent?: number;
  proxy_health: {
    active: number;
    burned: number;
    health_score: number;
    cost_today: string;
  };
  top_products: Array<{
    name: string;
    sku: string;
    checkout_count: number;
  }>;
}

interface CommunityStats {
  total_users: number;
  active_users_today: number;
  total_posts: number;
  posts_today: number;
  laces_distributed_today: number;
  top_contributors: Array<{
    user_id: string;
    username: string;
    score: number;
    rank: number;
  }>;
}

export const Analytics: React.FC = () => {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [communityStats, setCommunityStats] = useState<CommunityStats | null>(null);
  const [timeframe, setTimeframe] = useState<'hour' | 'day' | 'week' | 'month'>('day');
  const [isLoading, setIsLoading] = useState(true);
  const { isConnected } = useWebSocket();

  // Real-time updates
  useTaskUpdates((task) => {
    // Update metrics when tasks complete
    fetchMetrics();
  });

  useLacesUpdates((transaction) => {
    // Update community stats when LACES transactions occur
    fetchCommunityStats();
  });

  const fetchMetrics = async () => {
    try {
      // This would call the microservices metrics endpoint
      const response = await fetch(`/api/metrics/dashboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeframe,
          include_costs: true,
        }),
      });
      const data = await response.json();
      setMetrics(data);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
  };

  const fetchCommunityStats = async () => {
    try {
      // Mock data for now - would integrate with backend APIs
      setCommunityStats({
        total_users: 1247,
        active_users_today: 89,
        total_posts: 15420,
        posts_today: 156,
        laces_distributed_today: 2840,
        top_contributors: [
          { user_id: '1', username: 'sneakerhead_mike', score: 2450, rank: 1 },
          { user_id: '2', username: 'boost_hunter', score: 2210, rank: 2 },
          { user_id: '3', username: 'jordan_collector', score: 1980, rank: 3 },
        ],
      });
    } catch (error) {
      console.error('Failed to fetch community stats:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchMetrics(), fetchCommunityStats()]);
      setIsLoading(false);
    };
    loadData();
  }, [timeframe]);

  const { setRef, isIntersecting } = useStaggeredIntersection(6);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  };

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center">
        <motion.div 
          className="text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <motion.div 
            className="w-16 h-16 bg-earth-500/20 rounded-2xl flex items-center justify-center mb-4 mx-auto"
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <BarChart3 className="w-8 h-8 text-earth-500" />
          </motion.div>
          <p className="text-earth-700 dark:text-earth-300 font-medium">Loading analytics...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div 
      className="space-y-8 p-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Enhanced Header */}
      <motion.div 
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sage-100 via-earth-100 to-sage-200 dark:from-sage-800 dark:via-earth-800 dark:to-sage-700 p-8"
        variants={itemVariants}
      >
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <motion.h1 
              className="text-4xl font-bold text-gradient-earth mb-4"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
            >
              Analytics Hub
            </motion.h1>
            <motion.p 
              className="text-lg text-earth-700 dark:text-earth-300"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
            >
              Real-time insights into community activity and performance
            </motion.p>
          </div>
          
          <motion.div 
            className="flex items-center gap-4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            <div className="flex items-center gap-2 px-4 py-2 rounded-full glass-card">
              <motion.div 
                className={`w-2 h-2 rounded-full ${isConnected ? 'bg-sage-500' : 'bg-red-500'}`}
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <Badge 
                variant={isConnected ? 'default' : 'destructive'}
                className="bg-transparent border-0 text-earth-700 dark:text-earth-300"
              >
                {isConnected ? 'Live Data' : 'Offline'}
              </Badge>
            </div>
            
            <Select value={timeframe} onValueChange={(value: any) => setTimeframe(value)}>
              <SelectTrigger className="w-32 glass-card border-earth-200 dark:border-earth-700 magnetic">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-card">
                <SelectItem value="hour">Last Hour</SelectItem>
                <SelectItem value="day">Last Day</SelectItem>
                <SelectItem value="week">Last Week</SelectItem>
                <SelectItem value="month">Last Month</SelectItem>
              </SelectContent>
            </Select>
          </motion.div>
        </div>
        
        {/* Floating background elements */}
        <div className="absolute top-6 right-6 w-24 h-24 bg-earth-400/20 rounded-full blur-2xl animate-float" />
        <div className="absolute bottom-6 left-6 w-16 h-16 bg-sage-400/20 rounded-full blur-xl float-gentle" style={{'--delay': '2s'} as any} />
      </motion.div>

      <motion.div variants={itemVariants}>
        <Tabs defaultValue="community" className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <TabsList className="glass-card p-1.5 rounded-2xl border-earth-200 dark:border-earth-700">
              <TabsTrigger 
                value="community" 
                className="rounded-xl px-6 py-3 font-medium data-[state=active]:bg-earth-500 data-[state=active]:text-earth-50 data-[state=active]:shadow-glow magnetic"
              >
                Community
              </TabsTrigger>
              <TabsTrigger 
                value="automation" 
                className="rounded-xl px-6 py-3 font-medium data-[state=active]:bg-earth-500 data-[state=active]:text-earth-50 data-[state=active]:shadow-glow magnetic"
              >
                Automation
              </TabsTrigger>
              <TabsTrigger 
                value="economy" 
                className="rounded-xl px-6 py-3 font-medium data-[state=active]:bg-earth-500 data-[state=active]:text-earth-50 data-[state=active]:shadow-glow magnetic"
              >
                Economy
              </TabsTrigger>
            </TabsList>
          </motion.div>

        <TabsContent value="community" className="space-y-6">
          <motion.div 
            className="grid gap-6 md:grid-cols-2 lg:grid-cols-4"
            variants={containerVariants}
          >
            <motion.div variants={itemVariants} className="magnetic">
              <MetricCard
                title="Total Users"
                value={communityStats?.total_users || 0}
                icon={<Users className="h-4 w-4" />}
                description="Registered community members"
              />
            </motion.div>
            <motion.div variants={itemVariants} className="magnetic">
              <MetricCard
                title="Active Today"
                value={communityStats?.active_users_today || 0}
                icon={<Activity className="h-4 w-4" />}
                description="Users active in last 24h"
              />
            </motion.div>
            <motion.div variants={itemVariants} className="magnetic">
              <MetricCard
                title="Posts Today"
                value={communityStats?.posts_today || 0}
                icon={<Globe className="h-4 w-4" />}
                description="New signals posted"
              />
            </motion.div>
            <motion.div variants={itemVariants} className="magnetic">
              <MetricCard
                title="LACES Distributed"
                value={communityStats?.laces_distributed_today || 0}
                icon={<Coins className="h-4 w-4" />}
                description="Tokens earned today"
              />
            </motion.div>
          </motion.div>

          <motion.div 
            className="grid gap-6 md:grid-cols-2"
            variants={containerVariants}
          >
            <motion.div variants={itemVariants} className="magnetic">
              <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-earth-700 dark:text-earth-300">
                    <Trophy className="h-5 w-5 text-earth-500" />
                    Top Contributors
                  </CardTitle>
                  <CardDescription className="text-earth-600 dark:text-earth-400">
                    Leading community members by LACES score
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {communityStats?.top_contributors.map((contributor, index) => (
                      <motion.div 
                        key={contributor.user_id} 
                        className="flex items-center justify-between p-3 rounded-xl hover:bg-earth-50 dark:hover:bg-earth-800/50 transition-colors magnetic"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        whileHover={{ scale: 1.02 }}
                      >
                        <div className="flex items-center gap-3">
                          <Badge 
                            variant="secondary" 
                            className="w-8 h-8 rounded-full flex items-center justify-center bg-earth-500 text-earth-50 border-0"
                          >
                            {contributor.rank}
                          </Badge>
                          <span className="font-medium text-earth-700 dark:text-earth-300">
                            @{contributor.username}
                          </span>
                        </div>
                        <span className="text-sm text-earth-600 dark:text-earth-400 font-mono">
                          {contributor.score.toLocaleString()} LACES
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={itemVariants} className="magnetic">
              <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300">
                <CardHeader>
                  <CardTitle className="text-earth-700 dark:text-earth-300">Community Health</CardTitle>
                  <CardDescription className="text-earth-600 dark:text-earth-400">
                    Platform engagement metrics
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-earth-700 dark:text-earth-300">
                      <span>Daily Active Users</span>
                      <span>{Math.round((communityStats?.active_users_today || 0) / (communityStats?.total_users || 1) * 100)}%</span>
                    </div>
                    <Progress 
                      value={(communityStats?.active_users_today || 0) / (communityStats?.total_users || 1) * 100} 
                      className="h-2 bg-earth-200 dark:bg-earth-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-earth-700 dark:text-earth-300">
                      <span>Posts per Active User</span>
                      <span>{((communityStats?.posts_today || 0) / (communityStats?.active_users_today || 1)).toFixed(1)}</span>
                    </div>
                    <Progress 
                      value={Math.min(100, (communityStats?.posts_today || 0) / (communityStats?.active_users_today || 1) * 20)} 
                      className="h-2 bg-earth-200 dark:bg-earth-700"
                    />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </TabsContent>

        <TabsContent value="automation" className="space-y-6">
          {metrics && (
            <>
              <motion.div 
                className="grid gap-6 md:grid-cols-2 lg:grid-cols-4"
                variants={containerVariants}
              >
                <MetricCard
                  title="Active Monitors"
                  value={metrics.active_monitors}
                  icon={<Target className="h-4 w-4" />}
                  description="Currently tracking products"
                />
                <MetricCard
                  title="Running Tasks"
                  value={metrics.running_tasks}
                  icon={<Zap className="h-4 w-4" />}
                  description="Checkout attempts in progress"
                />
                <MetricCard
                  title="Success Rate"
                  value={`${metrics.success_rate}%`}
                  icon={<TrendingUp className="h-4 w-4" />}
                  description="Successful checkouts"
                />
                <MetricCard
                  title="Avg Time"
                  value={`${(metrics.avg_checkout_time_ms / 1000).toFixed(1)}s`}
                  icon={<Activity className="h-4 w-4" />}
                  description="Average checkout time"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Proxy Health</CardTitle>
                    <CardDescription>Network infrastructure status</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>Health Score</span>
                      <Badge variant={metrics.proxy_health.health_score > 80 ? 'default' : 'destructive'}>
                        {metrics.proxy_health.health_score}%
                      </Badge>
                    </div>
                    <Progress value={metrics.proxy_health.health_score} />
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Active:</span>
                        <span className="ml-2 font-mono">{metrics.proxy_health.active}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Burned:</span>
                        <span className="ml-2 font-mono">{metrics.proxy_health.burned}</span>
                      </div>
                    </div>
                    <div className="pt-2 border-t">
                      <span className="text-muted-foreground">Cost Today:</span>
                      <span className="ml-2 font-mono font-bold">{metrics.proxy_health.cost_today}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Top Products</CardTitle>
                    <CardDescription>Most monitored items</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {metrics.top_products.slice(0, 5).map((product, index) => (
                        <div key={product.sku} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="w-6 h-6 rounded-full flex items-center justify-center text-xs">
                              {index + 1}
                            </Badge>
                            <span className="text-sm font-medium truncate">{product.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">
                            {product.checkout_count} attempts
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="economy" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="LACES in Circulation"
              value="247K"
              icon={<Coins className="h-4 w-4" />}
              description="Total tokens distributed"
            />
            <MetricCard
              title="Daily Volume"
              value="12.4K"
              icon={<Activity className="h-4 w-4" />}
              description="LACES transferred today"
            />
            <MetricCard
              title="Average Balance"
              value="198"
              icon={<DollarSign className="h-4 w-4" />}
              description="Per active user"
            />
            <MetricCard
              title="Top Holder"
              value="8.9K"
              icon={<Trophy className="h-4 w-4" />}
              description="Highest balance"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Token Distribution</CardTitle>
              <CardDescription>How LACES are earned across the platform</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Daily Stipend (40%)</span>
                    <span>98.8K LACES</span>
                  </div>
                  <Progress value={40} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Signal Rewards (35%)</span>
                    <span>86.5K LACES</span>
                  </div>
                  <Progress value={35} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Boost Network (20%)</span>
                    <span>49.4K LACES</span>
                  </div>
                  <Progress value={20} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Contest Rewards (5%)</span>
                    <span>12.3K LACES</span>
                  </div>
                  <Progress value={5} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        </Tabs>
      </motion.div>
    </motion.div>
  );
};

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description: string;
  trend?: {
    value: number;
    label: string;
  };
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon, description, trend }) => {
  return (
    <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300 group">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-earth-700 dark:text-earth-300">
          {title}
        </CardTitle>
        <motion.div 
          className="p-2 rounded-xl bg-earth-500/10 group-hover:bg-earth-500/20 transition-colors"
          whileHover={{ scale: 1.1, rotate: 5 }}
        >
          {React.cloneElement(icon as React.ReactElement, {
            className: "h-4 w-4 text-earth-500"
          })}
        </motion.div>
      </CardHeader>
      <CardContent>
        <motion.div 
          className="text-2xl font-bold text-earth-800 dark:text-earth-200"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          {value}
        </motion.div>
        <p className="text-xs text-earth-600 dark:text-earth-400 mt-1">{description}</p>
        {trend && (
          <motion.div 
            className="flex items-center pt-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <TrendingUp className={`h-3 w-3 ${trend.value > 0 ? 'text-sage-500' : 'text-red-500'}`} />
            <span className={`text-xs ml-1 font-medium ${trend.value > 0 ? 'text-sage-500' : 'text-red-500'}`}>
              {trend.value > 0 ? '+' : ''}{trend.value}% {trend.label}
            </span>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
};

export default Analytics;