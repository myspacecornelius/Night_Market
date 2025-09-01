
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Filter, Zap, Clock, TrendingUp, Users } from 'lucide-react';
import DropCard from '@/components/hyperlocal/DropCard';
import AnimatedButton from '@/components/ui/animated-button';
import { drops } from '@/mocks/drops';
import { useStaggeredIntersection } from '@/hooks/useIntersectionObserver';

const Feed = () => {
  const [filterRadius, setFilterRadius] = useState(5);
  const [activeFilter, setActiveFilter] = useState<'all' | 'hot' | 'recent' | 'nearby'>('all');
  const [filteredDrops, setFilteredDrops] = useState(drops);
  const { setRef, isIntersecting } = useStaggeredIntersection(drops.length);

  const filters = [
    { key: 'all', label: 'All Signals', icon: MapPin, count: drops.length },
    { key: 'hot', label: 'Hot', icon: TrendingUp, count: 8 },
    { key: 'recent', label: 'Recent', icon: Clock, count: 12 },
    { key: 'nearby', label: 'Nearby', icon: Users, count: 5 },
  ] as const;

  useEffect(() => {
    // Simulate filtering based on active filter
    let filtered = [...drops];
    
    switch (activeFilter) {
      case 'hot':
        filtered = drops.filter(drop => drop.heat_score > 75);
        break;
      case 'recent':
        filtered = drops.slice(0, 12);
        break;
      case 'nearby':
        filtered = drops.slice(0, 5);
        break;
      default:
        filtered = drops;
    }
    
    setFilteredDrops(filtered);
  }, [activeFilter]);

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

  const headerVariants = {
    hidden: { opacity: 0, y: -30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 40, scale: 0.9 },
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
      className="space-y-8 p-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Enhanced Header */}
      <motion.div 
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sage-100 via-earth-100 to-sage-200 dark:from-sage-800 dark:via-earth-800 dark:to-sage-700 p-8"
        variants={headerVariants}
      >
        <div className="relative z-10">
          <motion.h1 
            className="text-4xl font-bold text-gradient-earth mb-4"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            Hyperlocal Intelligence
          </motion.h1>
          <motion.p 
            className="text-lg text-earth-700 dark:text-earth-300 mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          >
            Real-time signals from your sneaker community
          </motion.p>
          
          <motion.div 
            className="flex items-center gap-4"
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
              <span className="text-sm font-medium">
                {filteredDrops.length} signals in {filterRadius}km radius
              </span>
            </div>
            
            <AnimatedButton variant="earth" size="sm">
              <Zap className="w-4 h-4" />
              Post Signal
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
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          {/* Filter Chips */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-earth-700 dark:text-earth-300">
              <Filter className="w-4 h-4 inline mr-2" />
              Filter by:
            </span>
            {filters.map((filter) => (
              <motion.button
                key={filter.key}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 magnetic
                  ${activeFilter === filter.key
                    ? 'bg-earth-500 text-earth-50 shadow-glow'
                    : 'bg-earth-100 dark:bg-earth-800 text-earth-600 dark:text-earth-400 hover:bg-earth-200 dark:hover:bg-earth-700'
                  }
                `}
                onClick={() => setActiveFilter(filter.key)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <filter.icon className="w-4 h-4" />
                {filter.label}
                <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded-full text-xs">
                  {filter.count}
                </span>
              </motion.button>
            ))}
          </div>

          {/* Radius Slider */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-earth-700 dark:text-earth-300">Radius:</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="1"
                max="25"
                value={filterRadius}
                onChange={(e) => setFilterRadius(Number(e.target.value))}
                className="w-24 h-2 bg-earth-200 dark:bg-earth-700 rounded-lg appearance-none cursor-pointer slider"
              />
              <span className="text-sm font-mono text-earth-600 dark:text-earth-400 min-w-[3rem]">
                {filterRadius}km
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Feed Grid */}
      <motion.div 
        className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
        variants={containerVariants}
      >
        {filteredDrops.map((drop, index) => (
          <motion.div
            key={drop.id}
            ref={setRef(index)}
            variants={cardVariants}
            custom={index}
            className={`
              ${isIntersecting(index) ? 'animate-fade-in-up' : ''}
            `}
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="magnetic card-hover">
              <DropCard drop={drop} />
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Load More Button */}
      <motion.div 
        className="flex justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.6 }}
      >
        <AnimatedButton 
          variant="outline" 
          size="lg"
          className="magnetic border-earth-300 hover:bg-earth-50 dark:hover:bg-earth-800"
        >
          Load More Signals
        </AnimatedButton>
      </motion.div>
    </motion.div>
  );
};

export default Feed;
