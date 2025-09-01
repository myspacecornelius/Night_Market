import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Edit3, MapPin, Trophy, Calendar, Zap, Settings, Share, Camera, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import AnimatedButton from '../components/ui/animated-button';
import { useStaggeredIntersection } from '../hooks/useIntersectionObserver';

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  bio: string;
  location: string;
  joined_date: string;
  laces_balance: number;
  laces_rank: number;
  total_signals: number;
  verified_drops: number;
  community_score: number;
  achievements: Array<{
    id: string;
    name: string;
    icon: string;
    earned_date: string;
    rarity: 'common' | 'rare' | 'legendary';
  }>;
  activity_streak: number;
  favorite_brands: string[];
}

export default function Profile() {
  const [profile] = useState<UserProfile>({
    id: '1',
    username: 'sneaker_sage',
    display_name: 'The Sneaker Sage',
    bio: 'Chasing heat since 2019. LA-based collector with an eye for the underground scene.',
    location: 'Los Angeles, CA',
    joined_date: 'March 2023',
    laces_balance: 2847,
    laces_rank: 42,
    total_signals: 156,
    verified_drops: 23,
    community_score: 94,
    achievements: [
      { id: '1', name: 'First Signal', icon: '🎯', earned_date: 'March 2023', rarity: 'common' },
      { id: '2', name: 'Heat Detector', icon: '🔥', earned_date: 'June 2023', rarity: 'rare' },
      { id: '3', name: 'Network Builder', icon: '⚡', earned_date: 'August 2023', rarity: 'legendary' },
    ],
    activity_streak: 23,
    favorite_brands: ['Nike', 'Jordan', 'Off-White', 'Yeezy']
  });

  const [isEditing, setIsEditing] = useState(false);
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

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'legendary': return 'from-earth-400 to-earth-600';
      case 'rare': return 'from-sage-400 to-sage-600';
      default: return 'from-stone-400 to-stone-600';
    }
  };

  return (
    <motion.div 
      className="space-y-8 p-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Profile Header */}
      <motion.div 
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sage-100 via-earth-100 to-sage-200 dark:from-sage-800 dark:via-earth-800 dark:to-sage-700 p-8"
        variants={itemVariants}
      >
        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
            {/* Avatar and Basic Info */}
            <motion.div 
              className="flex items-center gap-6"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
            >
              <motion.div 
                className="relative"
                whileHover={{ scale: 1.05 }}
              >
                <Avatar className="w-24 h-24 border-4 border-earth-500 shadow-glow magnetic">
                  <AvatarImage src={profile.avatar_url} />
                  <AvatarFallback className="bg-earth-500 text-earth-50 text-2xl font-bold">
                    {profile.display_name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <motion.div 
                  className="absolute -bottom-1 -right-1 p-1.5 bg-earth-500 rounded-full shadow-glow cursor-pointer magnetic"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <Camera className="w-4 h-4 text-earth-50" />
                </motion.div>
              </motion.div>
              
              <div>
                <h1 className="text-3xl font-bold text-gradient-earth">
                  {profile.display_name}
                </h1>
                <p className="text-lg text-earth-600 dark:text-earth-400 mb-2">
                  @{profile.username}
                </p>
                <div className="flex items-center gap-4 text-sm text-earth-600 dark:text-earth-400">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {profile.location}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Joined {profile.joined_date}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Action Buttons */}
            <motion.div 
              className="flex items-center gap-3 ml-auto"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
            >
              <AnimatedButton 
                variant="outline" 
                className="magnetic border-earth-300 hover:bg-earth-50 dark:hover:bg-earth-800"
                onClick={() => setIsEditing(!isEditing)}
              >
                <Edit3 className="w-4 h-4" />
                Edit Profile
              </AnimatedButton>
              <AnimatedButton variant="earth" className="magnetic">
                <Share className="w-4 h-4" />
                Share
              </AnimatedButton>
            </motion.div>
          </div>

          {/* Bio */}
          <motion.p 
            className="mt-6 text-earth-700 dark:text-earth-300 text-lg max-w-2xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
          >
            {profile.bio}
          </motion.p>
        </div>
        
        {/* Floating background elements */}
        <div className="absolute top-6 right-6 w-24 h-24 bg-earth-400/20 rounded-full blur-2xl animate-float" />
        <div className="absolute bottom-6 left-6 w-16 h-16 bg-sage-400/20 rounded-full blur-xl float-gentle" style={{'--delay': '2s'} as any} />
      </motion.div>

      {/* Stats Grid */}
      <motion.div 
        className="grid gap-6 md:grid-cols-2 lg:grid-cols-4"
        variants={containerVariants}
      >
        <motion.div variants={itemVariants} className="magnetic">
          <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300">
            <CardContent className="p-6 text-center">
              <motion.div 
                className="text-3xl font-bold text-earth-600 dark:text-earth-400 mb-2"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: "spring", bounce: 0.4 }}
              >
                {profile.laces_balance.toLocaleString()}
              </motion.div>
              <p className="text-sm text-earth-600 dark:text-earth-400">LACES Balance</p>
              <Badge className="mt-2 bg-earth-500/20 text-earth-700 dark:text-earth-300 border-earth-300">
                Rank #{profile.laces_rank}
              </Badge>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} className="magnetic">
          <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300">
            <CardContent className="p-6 text-center">
              <motion.div 
                className="text-3xl font-bold text-sage-600 dark:text-sage-400 mb-2"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.6, type: "spring", bounce: 0.4 }}
              >
                {profile.total_signals}
              </motion.div>
              <p className="text-sm text-earth-600 dark:text-earth-400">Total Signals</p>
              <Badge className="mt-2 bg-sage-500/20 text-sage-700 dark:text-sage-300 border-sage-300">
                Active Contributor
              </Badge>
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
                {profile.verified_drops}
              </motion.div>
              <p className="text-sm text-earth-600 dark:text-earth-400">Verified Drops</p>
              <Badge className="mt-2 bg-stone-500/20 text-stone-700 dark:text-stone-300 border-stone-300">
                Trusted
              </Badge>
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
                transition={{ delay: 0.8, type: "spring", bounce: 0.4 }}
              >
                {profile.activity_streak}
              </motion.div>
              <p className="text-sm text-earth-600 dark:text-earth-400">Day Streak</p>
              <Badge className="mt-2 bg-earth-500/20 text-earth-700 dark:text-earth-300 border-earth-300">
                On Fire 🔥
              </Badge>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Main Content Grid */}
      <motion.div 
        className="grid gap-6 lg:grid-cols-3"
        variants={containerVariants}
      >
        {/* Achievements */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-earth-700 dark:text-earth-300">
                <Trophy className="h-5 w-5 text-earth-500" />
                Achievements
              </CardTitle>
              <CardDescription className="text-earth-600 dark:text-earth-400">
                Your milestones in the network
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {profile.achievements.map((achievement, index) => (
                  <motion.div
                    key={achievement.id}
                    className="flex items-center gap-4 p-4 rounded-xl hover:bg-earth-50 dark:hover:bg-earth-800/50 transition-colors magnetic"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ scale: 1.02 }}
                  >
                    <motion.div 
                      className={`
                        w-12 h-12 rounded-xl flex items-center justify-center text-2xl
                        bg-gradient-to-br ${getRarityColor(achievement.rarity)} shadow-glow
                      `}
                      whileHover={{ rotate: 5 }}
                    >
                      {achievement.icon}
                    </motion.div>
                    <div className="flex-1">
                      <p className="font-medium text-earth-700 dark:text-earth-300">
                        {achievement.name}
                      </p>
                      <p className="text-sm text-earth-600 dark:text-earth-400">
                        {achievement.earned_date}
                      </p>
                      <Badge 
                        className={`text-xs mt-1 ${
                          achievement.rarity === 'legendary' ? 'bg-earth-500/20 text-earth-700 border-earth-300' :
                          achievement.rarity === 'rare' ? 'bg-sage-500/20 text-sage-700 border-sage-300' :
                          'bg-stone-500/20 text-stone-700 border-stone-300'
                        }`}
                      >
                        {achievement.rarity}
                      </Badge>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Community Standing */}
        <motion.div variants={itemVariants}>
          <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-earth-700 dark:text-earth-300">
                <Shield className="h-5 w-5 text-sage-500" />
                Community Standing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <motion.div 
                  className="text-4xl font-bold text-earth-700 dark:text-earth-300 mb-2"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.5, type: "spring", bounce: 0.4 }}
                >
                  {profile.community_score}
                </motion.div>
                <p className="text-sm text-earth-600 dark:text-earth-400 mb-4">Community Score</p>
                <Progress 
                  value={profile.community_score} 
                  className="h-3 bg-earth-200 dark:bg-earth-700"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-earth-600 dark:text-earth-400">Trust Level</span>
                  <Badge className="bg-sage-500/20 text-sage-700 dark:text-sage-300 border-sage-300">
                    Verified
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-earth-600 dark:text-earth-400">Network Reach</span>
                  <span className="font-medium text-earth-700 dark:text-earth-300">
                    5.2K connections
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-earth-600 dark:text-earth-400">Influence Score</span>
                  <span className="font-medium text-earth-700 dark:text-earth-300">
                    Elite Tier
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Favorite Brands */}
      <motion.div variants={itemVariants}>
        <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300 magnetic">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-earth-700 dark:text-earth-300">
              <Zap className="h-5 w-5 text-earth-500" />
              Favorite Brands
            </CardTitle>
            <CardDescription className="text-earth-600 dark:text-earth-400">
              Brands you track most actively
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {profile.favorite_brands.map((brand, index) => (
                <motion.div
                  key={brand}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.05 }}
                >
                  <Badge 
                    className="px-4 py-2 bg-earth-500/20 text-earth-700 dark:text-earth-300 border-earth-300 magnetic cursor-pointer"
                  >
                    {brand}
                  </Badge>
                </motion.div>
              ))}
              <motion.button
                className="px-4 py-2 border-2 border-dashed border-earth-300 dark:border-earth-600 rounded-full text-sm text-earth-600 dark:text-earth-400 hover:border-earth-500 transition-colors magnetic"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                + Add Brand
              </motion.button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
