import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Map, MapPin, Clock, Users, Package, Zap, Plus, Search, Filter } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import AnimatedButton from '../components/ui/animated-button';
import { useStaggeredIntersection } from '../hooks/useIntersectionObserver';

interface DropZone {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  status: 'active' | 'pending' | 'verified';
  drop_count: number;
  last_drop: string;
  security_level: 'low' | 'medium' | 'high';
  accessibility: number;
  community_rating: number;
  verified_by?: string;
}

export default function Dropzones() {
  const [dropZones] = useState<DropZone[]>([
    {
      id: '1',
      name: 'Melrose Avenue Corridor',
      address: '7300 Melrose Ave, Los Angeles, CA',
      lat: 34.0837,
      lng: -118.3615,
      status: 'verified',
      drop_count: 127,
      last_drop: '23 mins ago',
      security_level: 'high',
      accessibility: 95,
      community_rating: 4.8,
      verified_by: 'sneaker_scout'
    },
    {
      id: '2',
      name: 'Beverly Hills Shopping District',
      address: '9570 Wilshire Blvd, Beverly Hills, CA',
      lat: 34.0675,
      lng: -118.4001,
      status: 'active',
      drop_count: 89,
      last_drop: '1 hour ago',
      security_level: 'medium',
      accessibility: 87,
      community_rating: 4.5
    },
    {
      id: '3',
      name: 'Santa Monica Pier',
      address: '200 Santa Monica Pier, Santa Monica, CA',
      lat: 34.0089,
      lng: -118.4973,
      status: 'pending',
      drop_count: 34,
      last_drop: '3 hours ago',
      security_level: 'low',
      accessibility: 72,
      community_rating: 3.9
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'verified' | 'pending'>('all');
  const { setRef, isIntersecting } = useStaggeredIntersection(dropZones.length);

  const filteredZones = dropZones.filter(zone => {
    const matchesSearch = zone.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         zone.address.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || zone.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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

  const getStatusBadge = (status: DropZone['status']) => {
    switch (status) {
      case 'verified':
        return <Badge className="bg-sage-500/20 text-sage-700 dark:text-sage-300 border-sage-300">Verified</Badge>;
      case 'active':
        return <Badge className="bg-earth-500/20 text-earth-700 dark:text-earth-300 border-earth-300">Active</Badge>;
      case 'pending':
        return <Badge variant="outline" className="border-stone-300 text-stone-600 dark:text-stone-400">Pending</Badge>;
    }
  };

  const getSecurityColor = (level: DropZone['security_level']) => {
    switch (level) {
      case 'high': return 'text-sage-500';
      case 'medium': return 'text-earth-500';
      case 'low': return 'text-red-500';
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
            Drop Zones
          </motion.h1>
          <motion.p 
            className="text-lg text-earth-700 dark:text-earth-300 mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          >
            Verified locations for secure sneaker transactions
          </motion.p>
          
          <motion.div 
            className="flex items-center gap-6"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
          >
            <div className="flex items-center gap-2 px-4 py-2 rounded-full glass-card">
              <motion.div 
                className="w-2 h-2 bg-sage-500 rounded-full"
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-sm font-medium text-earth-700 dark:text-earth-300">
                {filteredZones.length} zones mapped
              </span>
            </div>
            
            <AnimatedButton variant="earth" size="sm" className="magnetic">
              <Plus className="w-4 h-4" />
              Add Zone
            </AnimatedButton>
          </motion.div>
        </div>
        
        {/* Floating background elements */}
        <div className="absolute top-6 right-6 w-24 h-24 bg-earth-400/20 rounded-full blur-2xl animate-float" />
        <div className="absolute bottom-6 left-6 w-16 h-16 bg-sage-400/20 rounded-full blur-xl float-gentle" style={{'--delay': '2s'} as any} />
      </motion.div>

      {/* Search and Filter Controls */}
      <motion.div 
        className="glass-card p-6 rounded-2xl"
        variants={itemVariants}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-earth-500" />
            <Input
              placeholder="Search zones..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 glass-card border-earth-200 dark:border-earth-700 magnetic"
            />
          </div>
          
          {/* Status Filters */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-earth-700 dark:text-earth-300 flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Status:
            </span>
            {(['all', 'verified', 'active', 'pending'] as const).map((status) => (
              <motion.button
                key={status}
                className={`
                  px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 magnetic capitalize
                  ${statusFilter === status
                    ? 'bg-earth-500 text-earth-50 shadow-glow'
                    : 'bg-earth-100 dark:bg-earth-800 text-earth-600 dark:text-earth-400 hover:bg-earth-200 dark:hover:bg-earth-700'
                  }
                `}
                onClick={() => setStatusFilter(status)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {status}
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Drop Zones Grid */}
      <motion.div 
        className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
        variants={containerVariants}
      >
        {filteredZones.map((zone, index) => (
          <motion.div
            key={zone.id}
            ref={setRef(index)}
            variants={itemVariants}
            className="magnetic"
          >
            <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300 group h-full">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2 text-earth-700 dark:text-earth-300 text-lg">
                      <MapPin className="h-5 w-5 text-earth-500 flex-shrink-0" />
                      <span className="line-clamp-1">{zone.name}</span>
                    </CardTitle>
                    <CardDescription className="text-earth-600 dark:text-earth-400 text-sm mt-2 line-clamp-2">
                      {zone.address}
                    </CardDescription>
                  </div>
                  {getStatusBadge(zone.status)}
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Security and Accessibility */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 rounded-xl bg-earth-50 dark:bg-earth-800/50">
                    <div className={`text-lg font-bold ${getSecurityColor(zone.security_level)}`}>
                      {zone.security_level.toUpperCase()}
                    </div>
                    <p className="text-xs text-earth-600 dark:text-earth-400">Security</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-sage-50 dark:bg-sage-800/50">
                    <div className="text-lg font-bold text-sage-700 dark:text-sage-300">
                      {zone.accessibility}%
                    </div>
                    <p className="text-xs text-earth-600 dark:text-earth-400">Accessible</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-earth-600 dark:text-earth-400 flex items-center gap-1">
                      <Package className="w-3 h-3" />
                      Total drops:
                    </span>
                    <span className="font-medium text-earth-700 dark:text-earth-300">
                      {zone.drop_count}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-earth-600 dark:text-earth-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Last activity:
                    </span>
                    <Badge variant="outline" className="border-earth-300 dark:border-earth-600 text-xs">
                      {zone.last_drop}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-earth-600 dark:text-earth-400 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      Rating:
                    </span>
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <motion.div
                          key={i}
                          className={`w-3 h-3 rounded-full ${
                            i < Math.floor(zone.community_rating) ? 'bg-earth-500' : 'bg-earth-200 dark:bg-earth-700'
                          }`}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: index * 0.1 + i * 0.05 }}
                        />
                      ))}
                      <span className="ml-2 font-medium text-earth-700 dark:text-earth-300">
                        {zone.community_rating}
                      </span>
                    </div>
                  </div>

                  {zone.verified_by && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-earth-600 dark:text-earth-400">Verified by:</span>
                      <span className="font-medium text-sage-600 dark:text-sage-400">
                        @{zone.verified_by}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <AnimatedButton 
                    variant="earth" 
                    size="sm" 
                    className="flex-1 magnetic"
                  >
                    <MapPin className="w-4 h-4" />
                    Navigate
                  </AnimatedButton>
                  <AnimatedButton 
                    variant="sage" 
                    size="sm" 
                    className="flex-1 magnetic"
                  >
                    <Zap className="w-4 h-4" />
                    Signal
                  </AnimatedButton>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Map Overview */}
      <motion.div variants={itemVariants}>
        <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300 magnetic">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-earth-700 dark:text-earth-300">
              <Map className="h-5 w-5 text-earth-500" />
              Zone Map Overview
            </CardTitle>
            <CardDescription className="text-earth-600 dark:text-earth-400">
              Interactive map showing all verified drop locations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative h-80 bg-gradient-to-br from-earth-100 to-sage-100 dark:from-earth-800 dark:to-sage-800 rounded-2xl overflow-hidden">
              {/* Map placeholder with zone markers */}
              <div className="absolute inset-0">
                {dropZones.map((zone, index) => (
                  <motion.div
                    key={zone.id}
                    className={`absolute w-4 h-4 rounded-full ${
                      zone.status === 'verified' ? 'bg-sage-500' :
                      zone.status === 'active' ? 'bg-earth-500' :
                      'bg-stone-400'
                    } shadow-lg`}
                    style={{
                      top: `${20 + index * 15}%`,
                      left: `${25 + index * 20}%`
                    }}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: index * 0.2 + 0.5 }}
                    whileHover={{ scale: 1.5 }}
                  />
                ))}
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
                    <Map className="w-8 h-8 text-earth-600 dark:text-earth-400" />
                  </motion.div>
                  <h3 className="text-xl font-bold text-earth-700 dark:text-earth-300 mb-2">
                    Interactive Map Loading
                  </h3>
                  <p className="text-earth-600 dark:text-earth-400 mb-4">
                    Full geographic interface will render here
                  </p>
                  <AnimatedButton variant="earth" className="magnetic">
                    <MapPin className="w-4 h-4" />
                    View Full Map
                  </AnimatedButton>
                </motion.div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Zone Statistics */}
      <motion.div 
        className="grid gap-6 md:grid-cols-3"
        variants={containerVariants}
      >
        <motion.div variants={itemVariants} className="magnetic">
          <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300">
            <CardContent className="p-6 text-center">
              <motion.div 
                className="text-3xl font-bold text-sage-600 dark:text-sage-400 mb-2"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: "spring", bounce: 0.4 }}
              >
                {dropZones.filter(z => z.status === 'verified').length}
              </motion.div>
              <p className="text-sm text-earth-600 dark:text-earth-400">Verified Zones</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} className="magnetic">
          <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300">
            <CardContent className="p-6 text-center">
              <motion.div 
                className="text-3xl font-bold text-earth-600 dark:text-earth-400 mb-2"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.6, type: "spring", bounce: 0.4 }}
              >
                {dropZones.reduce((acc, zone) => acc + zone.drop_count, 0)}
              </motion.div>
              <p className="text-sm text-earth-600 dark:text-earth-400">Total Drops</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} className="magnetic">
          <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300">
            <CardContent className="p-6 text-center">
              <motion.div 
                className="text-3xl font-bold text-stone-600 dark:text-stone-400 mb-2"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.7, type: "spring", bounce: 0.4 }}
              >
                {(dropZones.reduce((acc, zone) => acc + zone.community_rating, 0) / dropZones.length).toFixed(1)}
              </motion.div>
              <p className="text-sm text-earth-600 dark:text-earth-400">Avg. Rating</p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
