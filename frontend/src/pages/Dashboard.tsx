import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Zap, Users, MapPin, Coins, Activity, Target, Eye, Calendar } from 'lucide-react';
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface DashboardMetrics {
  lacesBalance: number;
  lacesEarnedToday: number;
  activeSignals: number;
  nearbyActivity: number;
  communityRank: number;
  totalViews: number;
}

const Dashboard = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    lacesBalance: 2450,
    lacesEarnedToday: 85,
    activeSignals: 12,
    nearbyActivity: 23,
    communityRank: 47,
    totalViews: 1240,
  });

  const [recentActivity] = useState([
    { id: 1, type: 'signal', message: 'Travis Scott 4s spotted at Footlocker', time: '2m ago', urgent: true },
    { id: 2, type: 'laces', message: 'Earned 15 LACES from signal boost', time: '5m ago', urgent: false },
    { id: 3, type: 'community', message: 'New member joined your area', time: '8m ago', urgent: false },
  ]);

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

  return (
    <motion.div 
      className="space-y-8 p-6 min-h-screen"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Hero Header */}
      <motion.div 
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-earth-100 via-earth-200 to-sage-100 dark:from-earth-800 dark:via-earth-700 dark:to-sage-800 p-8"
        variants={itemVariants}
        whileHover={{ scale: 1.01 }}
      >
        <div className="relative z-10">
          <motion.h1 
            className="text-5xl font-bold text-gradient-earth mb-4"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            Welcome back
          </motion.h1>
          <motion.p 
            className="text-xl text-earth-700 dark:text-earth-300 mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          >
            Your hyperlocal sneaker intelligence hub
          </motion.p>
          
          <motion.div 
            className="flex items-center gap-4"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
          >
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 dark:bg-earth-900/80 backdrop-blur-sm">
              <motion.div 
                className="w-3 h-3 bg-sage-500 rounded-full"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-sm font-medium text-earth-700 dark:text-earth-300">
                Live Network Active
              </span>
            </div>
            
            <Button className="btn-earth magnetic">
              <Target className="w-4 h-4" />
              Quick Signal
            </Button>
          </motion.div>
        </div>
        
        {/* Floating background elements */}
        <div className="absolute top-4 right-4 w-32 h-32 bg-sage-300/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-4 left-4 w-24 h-24 bg-earth-400/20 rounded-full blur-2xl float-gentle" style={{'--delay': '1s'} as any} />
      </motion.div>

      {/* Metrics Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <motion.div variants={itemVariants}>
          <Card className="glass-card magnetic group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Coins className="w-8 h-8 text-earth-500 group-hover:text-earth-600 transition-colors" />
                <motion.div 
                  className="text-xs bg-sage-100 dark:bg-sage-900 text-sage-700 dark:text-sage-300 px-2 py-1 rounded-full"
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  +{metrics.lacesEarnedToday} today
                </motion.div>
              </div>
              <div className="text-3xl font-bold text-earth-700 dark:text-earth-300 mb-1">
                {metrics.lacesBalance.toLocaleString()}
              </div>
              <p className="text-sm text-muted-foreground">LACES Balance</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="glass-card magnetic group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <MapPin className="w-8 h-8 text-sage-500 group-hover:text-sage-600 transition-colors" />
                <div className="w-2 h-2 bg-sage-500 rounded-full animate-pulse" />
              </div>
              <div className="text-3xl font-bold text-sage-700 dark:text-sage-300 mb-1">
                {metrics.activeSignals}
              </div>
              <p className="text-sm text-muted-foreground">Active Signals</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="glass-card magnetic group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Activity className="w-8 h-8 text-stone-500 group-hover:text-stone-600 transition-colors" />
                <TrendingUp className="w-4 h-4 text-green-500" />
              </div>
              <div className="text-3xl font-bold text-stone-700 dark:text-stone-300 mb-1">
                {metrics.nearbyActivity}
              </div>
              <p className="text-sm text-muted-foreground">Nearby Activity</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="glass-card magnetic group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Users className="w-8 h-8 text-earth-600 group-hover:text-earth-700 transition-colors" />
                <span className="text-xs bg-earth-100 dark:bg-earth-800 text-earth-700 dark:text-earth-300 px-2 py-1 rounded-full">
                  Top 5%
                </span>
              </div>
              <div className="text-3xl font-bold text-earth-700 dark:text-earth-300 mb-1">
                #{metrics.communityRank}
              </div>
              <p className="text-sm text-muted-foreground">Community Rank</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Feature Cards */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="magnetic group hover:shadow-glow transition-all duration-400">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2 rounded-xl bg-earth-100 dark:bg-earth-800 group-hover:bg-earth-200 dark:group-hover:bg-earth-700 transition-colors">
                    <MapPin className="w-6 h-6 text-earth-500" />
                  </div>
                  HeatMap
                </CardTitle>
                <CardDescription>Visualize drop zones and community hot spots in real-time</CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  className="btn-earth w-full magnetic"
                  onClick={() => toast.info('Navigating to HeatMap...')}
                >
                  <Eye className="w-4 h-4" />
                  Explore Heat Map
                </Button>
              </CardContent>
            </Card>

            <Card className="magnetic group hover:shadow-glow-sage transition-all duration-400">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2 rounded-xl bg-sage-100 dark:bg-sage-800 group-hover:bg-sage-200 dark:group-hover:bg-sage-700 transition-colors">
                    <Coins className="w-6 h-6 text-sage-500" />
                  </div>
                  LACES Economy
                </CardTitle>
                <CardDescription>Manage tokens, transfers, and track your earning history</CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  className="btn-sage w-full magnetic"
                  onClick={() => toast.info('Navigating to LACES...')}
                >
                  <Coins className="w-4 h-4" />
                  Manage LACES
                </Button>
              </CardContent>
            </Card>

            <Card className="magnetic group hover:shadow-medium transition-all duration-400">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2 rounded-xl bg-stone-100 dark:bg-stone-800 group-hover:bg-stone-200 dark:group-hover:bg-stone-700 transition-colors">
                    <Target className="w-6 h-6 text-stone-500" />
                  </div>
                  DropZones
                </CardTitle>
                <CardDescription>Discover premium release locations and intel networks</CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  variant="outline" 
                  className="w-full magnetic border-earth-300 hover:bg-earth-50 dark:hover:bg-earth-800"
                  onClick={() => toast.info('Navigating to DropZones...')}
                >
                  <Target className="w-4 h-4" />
                  Explore Zones
                </Button>
              </CardContent>
            </Card>

            <Card className="magnetic group hover:shadow-medium transition-all duration-400">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2 rounded-xl bg-earth-100 dark:bg-earth-800 group-hover:bg-earth-200 dark:group-hover:bg-earth-700 transition-colors">
                    <Calendar className="w-6 h-6 text-earth-500" />
                  </div>
                  Upcoming Drops
                </CardTitle>
                <CardDescription>Track release calendars and set intelligent alerts</CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  variant="outline" 
                  className="w-full magnetic border-sage-300 hover:bg-sage-50 dark:hover:bg-sage-800"
                  onClick={() => toast.info('Navigating to Releases...')}
                >
                  <Calendar className="w-4 h-4" />
                  View Calendar
                </Button>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        {/* Activity Feed */}
        <motion.div variants={itemVariants}>
          <Card className="glass-card h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <motion.div 
                  className="w-3 h-3 bg-sage-500 rounded-full"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                Live Activity
              </CardTitle>
              <CardDescription>Real-time community signals and updates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentActivity.map((activity, index) => (
                <motion.div
                  key={activity.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border-interactive hover:bg-earth-50/50 dark:hover:bg-earth-800/30 transition-all duration-300 ${
                    activity.urgent ? 'border-earth-500/30 bg-earth-50/30 dark:bg-earth-800/20' : ''
                  }`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 + 0.5 }}
                  whileHover={{ x: 4, scale: 1.01 }}
                >
                  <motion.div 
                    className={`w-2 h-2 rounded-full mt-2 ${
                      activity.urgent ? 'bg-earth-500' : 'bg-sage-500'
                    }`}
                    animate={activity.urgent ? { scale: [1, 1.3, 1] } : {}}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  
                  <div className="flex-1">
                    <p className="text-sm font-medium text-earth-800 dark:text-earth-200">
                      {activity.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
                  </div>
                  
                  {activity.urgent && (
                    <motion.div
                      className="px-2 py-1 bg-earth-500/10 text-earth-700 dark:text-earth-300 text-xs rounded-full"
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      Hot
                    </motion.div>
                  )}
                </motion.div>
              ))}
              
              <div className="pt-4 border-t border-earth-200 dark:border-earth-700">
                <Button variant="ghost" className="w-full magnetic hover:bg-earth-100 dark:hover:bg-earth-800">
                  View All Activity
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Quick Stats Bar */}
      <motion.div 
        variants={itemVariants}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <div className="text-center p-4 rounded-2xl glass-card magnetic">
          <Eye className="w-6 h-6 text-stone-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-stone-700 dark:text-stone-300">
            {metrics.totalViews.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Profile Views</div>
        </div>
        
        <div className="text-center p-4 rounded-2xl glass-card magnetic">
          <TrendingUp className="w-6 h-6 text-green-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-green-700 dark:text-green-400">
            +12%
          </div>
          <div className="text-xs text-muted-foreground">Weekly Growth</div>
        </div>
        
        <div className="text-center p-4 rounded-2xl glass-card magnetic">
          <Zap className="w-6 h-6 text-earth-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-earth-700 dark:text-earth-300">
            89
          </div>
          <div className="text-xs text-muted-foreground">Signals Posted</div>
        </div>
        
        <div className="text-center p-4 rounded-2xl glass-card magnetic">
          <Users className="w-6 h-6 text-sage-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-sage-700 dark:text-sage-300">
            156
          </div>
          <div className="text-xs text-muted-foreground">Network Size</div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Dashboard;
