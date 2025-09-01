import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Flame, TrendingUp, MapPin, Clock, Filter, Layers, Zap, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Slider } from '../components/ui/slider';
import AnimatedButton from '../components/ui/animated-button';
import { useStaggeredIntersection } from '../hooks/useIntersectionObserver';

interface HeatZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  intensity: number;
  drop_count: number;
  avg_resale_value: number;
  trend: 'up' | 'down' | 'stable';
  last_drop: string;
}

export default function Heatmap() {
  const [heatZones] = useState<HeatZone[]>([
    {
      id: '1',
      name: 'Melrose Trading Post',
      lat: 34.0837,
      lng: -118.3615,
      intensity: 95,
      drop_count: 23,
      avg_resale_value: 245,
      trend: 'up',
      last_drop: '12 mins ago'
    },
    {
      id: '2', 
      name: 'Beverly Center',
      lat: 34.0758,
      lng: -118.3776,
      intensity: 87,
      drop_count: 18,
      avg_resale_value: 189,
      trend: 'up',
      last_drop: '28 mins ago'
    },
    {
      id: '3',
      name: 'The Grove',
      lat: 34.0719,
      lng: -118.3584,
      intensity: 72,
      drop_count: 14,
      avg_resale_value: 156,
      trend: 'stable',
      last_drop: '1 hour ago'
    },
    {
      id: '4',
      name: 'Santa Monica Place',
      lat: 34.0195,
      lng: -118.4912,
      intensity: 63,
      drop_count: 9,
      avg_resale_value: 123,
      trend: 'down',
      last_drop: '2 hours ago'
    }
  ]);

  const [intensityFilter, setIntensityFilter] = useState([0]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const { setRef, isIntersecting } = useStaggeredIntersection(heatZones.length);

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

  const getIntensityColor = (intensity: number) => {
    if (intensity >= 90) return 'from-red-500 to-orange-500';
    if (intensity >= 70) return 'from-orange-500 to-yellow-500';
    if (intensity >= 50) return 'from-yellow-500 to-earth-500';
    return 'from-earth-500 to-sage-500';
  };

  const getTrendIcon = (trend: HeatZone['trend']) => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-4 h-4 text-sage-500" />;
      case 'down': return <TrendingUp className="w-4 h-4 text-red-500 rotate-180" />;
      default: return <div className="w-4 h-4 bg-stone-400 rounded-full" />;
    }
  };

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
        <div className="relative z-10">
          <motion.h1 
            className="text-4xl font-bold text-gradient-earth mb-4"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            Heat Intelligence
          </motion.h1>
          <motion.p 
            className="text-lg text-earth-700 dark:text-earth-300 mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          >
            Real-time intensity mapping of sneaker activity
          </motion.p>
          
          <motion.div 
            className="flex items-center gap-6"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
          >
            <div className="flex items-center gap-2 px-4 py-2 rounded-full glass-card">
              <motion.div 
                className="w-2 h-2 bg-red-500 rounded-full"
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-sm font-medium text-earth-700 dark:text-earth-300">
                Live tracking {heatZones.length} zones
              </span>
            </div>
            
            <AnimatedButton variant="earth" size="sm" className="magnetic">
              <Layers className="w-4 h-4" />
              Toggle Layers
            </AnimatedButton>
          </motion.div>
        </div>
        
        {/* Floating background elements */}
        <div className="absolute top-6 right-6 w-24 h-24 bg-earth-400/20 rounded-full blur-2xl animate-float" />
        <div className="absolute bottom-6 left-6 w-16 h-16 bg-sage-400/20 rounded-full blur-xl float-gentle" style={{'--delay': '2s'} as any} />
      </motion.div>

      {/* Filter Controls */}
      <motion.div 
        className="glass-card p-6 rounded-2xl"
        variants={itemVariants}
      >
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-earth-700 dark:text-earth-300 flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Intensity Filter:
            </span>
            <div className="flex items-center gap-3 min-w-[200px]">
              <Slider
                value={intensityFilter}
                onValueChange={setIntensityFilter}
                max={100}
                step={5}
                className="flex-1"
              />
              <span className="text-sm font-mono text-earth-600 dark:text-earth-400 min-w-[3rem]">
                {intensityFilter[0]}%+
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {(['1h', '6h', '24h', '7d'] as const).map((timeframe) => (
              <motion.button
                key={timeframe}
                className={`
                  px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 magnetic
                  ${selectedTimeframe === timeframe
                    ? 'bg-earth-500 text-earth-50 shadow-glow'
                    : 'bg-earth-100 dark:bg-earth-800 text-earth-600 dark:text-earth-400 hover:bg-earth-200 dark:hover:bg-earth-700'
                  }
                `}
                onClick={() => setSelectedTimeframe(timeframe)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {timeframe}
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Heat Zones Grid */}
      <motion.div 
        className="grid gap-6 md:grid-cols-2 lg:grid-cols-2"
        variants={containerVariants}
      >
        {heatZones
          .filter(zone => zone.intensity >= intensityFilter[0])
          .map((zone, index) => (
          <motion.div
            key={zone.id}
            ref={setRef(index)}
            variants={itemVariants}
            className="magnetic"
          >
            <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300 group overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-earth-700 dark:text-earth-300">
                    <MapPin className="h-5 w-5 text-earth-500" />
                    {zone.name}
                  </CardTitle>
                  {getTrendIcon(zone.trend)}
                </div>
              </CardHeader>
              <CardContent>
                {/* Intensity Visualization */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-earth-600 dark:text-earth-400">
                      Heat Intensity
                    </span>
                    <span className="text-sm font-bold text-earth-700 dark:text-earth-300">
                      {zone.intensity}%
                    </span>
                  </div>
                  <div className="relative h-3 bg-earth-200 dark:bg-earth-700 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full bg-gradient-to-r ${getIntensityColor(zone.intensity)} rounded-full`}
                      initial={{ width: 0 }}
                      animate={{ width: `${zone.intensity}%` }}
                      transition={{ delay: index * 0.1 + 0.5, duration: 1, ease: "easeOut" }}
                    />
                  </div>
                </div>

                {/* Zone Stats */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="text-center p-3 rounded-xl bg-earth-50 dark:bg-earth-800/50">
                    <p className="text-lg font-bold text-earth-700 dark:text-earth-300">
                      {zone.drop_count}
                    </p>
                    <p className="text-xs text-earth-600 dark:text-earth-400">Recent Drops</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-sage-50 dark:bg-sage-800/50">
                    <p className="text-lg font-bold text-sage-700 dark:text-sage-300">
                      ${zone.avg_resale_value}
                    </p>
                    <p className="text-xs text-earth-600 dark:text-earth-400">Avg. Value</p>
                  </div>
                </div>

                {/* Last Activity */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-earth-600 dark:text-earth-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Last drop:
                  </span>
                  <Badge variant="outline" className="border-earth-300 dark:border-earth-600">
                    {zone.last_drop}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Map Placeholder with Interactive Elements */}
      <motion.div variants={itemVariants}>
        <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300 magnetic">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-earth-700 dark:text-earth-300">
              <Flame className="h-5 w-5 text-red-500" />
              Interactive Heat Map
            </CardTitle>
            <CardDescription className="text-earth-600 dark:text-earth-400">
              Visual representation of sneaker activity hotspots
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative h-96 bg-gradient-to-br from-earth-100 to-sage-100 dark:from-earth-800 dark:to-sage-800 rounded-2xl overflow-hidden">
              {/* Map placeholder with floating heat indicators */}
              <div className="absolute inset-0 opacity-20">
                <div className="absolute top-1/4 left-1/3 w-8 h-8 bg-red-500 rounded-full blur-sm animate-pulse" />
                <div className="absolute top-1/2 left-1/2 w-6 h-6 bg-orange-500 rounded-full blur-sm animate-pulse" style={{ animationDelay: '0.5s' }} />
                <div className="absolute top-2/3 left-2/3 w-4 h-4 bg-yellow-500 rounded-full blur-sm animate-pulse" style={{ animationDelay: '1s' }} />
                <div className="absolute top-1/3 right-1/4 w-5 h-5 bg-earth-500 rounded-full blur-sm animate-pulse" style={{ animationDelay: '1.5s' }} />
              </div>
              
              <div className="relative z-10 flex items-center justify-center h-full">
                <motion.div 
                  className="text-center"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8 }}
                >
                  <motion.div 
                    className="p-4 bg-earth-500/20 rounded-2xl mb-4 inline-block"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 3, repeat: Infinity }}
                  >
                    <MapPin className="w-8 h-8 text-earth-600 dark:text-earth-400" />
                  </motion.div>
                  <h3 className="text-xl font-bold text-earth-700 dark:text-earth-300 mb-2">
                    Interactive Map Loading
                  </h3>
                  <p className="text-earth-600 dark:text-earth-400 mb-4">
                    Geographic heat visualization will render here
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    <AnimatedButton variant="earth" size="sm" className="magnetic">
                      <Zap className="w-4 h-4" />
                      Add Location
                    </AnimatedButton>
                    <AnimatedButton variant="sage" size="sm" className="magnetic">
                      <Users className="w-4 h-4" />
                      Share Zone
                    </AnimatedButton>
                  </div>
                </motion.div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Legend and Controls */}
      <motion.div 
        className="grid gap-6 lg:grid-cols-4"
        variants={containerVariants}
      >
        <motion.div variants={itemVariants} className="lg:col-span-3">
          <Card className="glass-card border-earth-200 dark:border-earth-700 magnetic">
            <CardHeader>
              <CardTitle className="text-earth-700 dark:text-earth-300">Heat Legend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                {[
                  { range: '90-100%', color: 'bg-red-500', label: 'Extreme' },
                  { range: '70-89%', color: 'bg-orange-500', label: 'High' },
                  { range: '50-69%', color: 'bg-yellow-500', label: 'Medium' },
                  { range: '0-49%', color: 'bg-earth-500', label: 'Low' },
                ].map((item, index) => (
                  <motion.div 
                    key={item.range}
                    className="flex items-center gap-2"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className={`w-4 h-4 ${item.color} rounded-full shadow-sm`} />
                    <div className="text-center">
                      <p className="text-xs font-medium text-earth-700 dark:text-earth-300">
                        {item.label}
                      </p>
                      <p className="text-xs text-earth-600 dark:text-earth-400">
                        {item.range}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300">
            <CardContent className="p-6">
              <div className="text-center">
                <motion.div 
                  className="text-2xl font-bold text-earth-700 dark:text-earth-300 mb-2"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.5, type: "spring", bounce: 0.4 }}
                >
                  {heatZones.reduce((acc, zone) => acc + zone.drop_count, 0)}
                </motion.div>
                <p className="text-sm text-earth-600 dark:text-earth-400">Total Signals</p>
                <p className="text-xs text-earth-500 dark:text-earth-500 mt-1">
                  Last {selectedTimeframe}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
