import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Coins, TrendingUp, Award, Users, Zap, Gift, Target, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import AnimatedButton from '../components/ui/animated-button';
import { useStaggeredIntersection } from '../hooks/useIntersectionObserver';
import { useLacesUpdates } from '../components/WebSocketProvider';

interface LacesBalance {
  total: number;
  earned_today: number;
  pending: number;
  rank: number;
  percentile: number;
}

interface Transaction {
  id: string;
  type: 'earned' | 'spent' | 'transferred';
  amount: number;
  description: string;
  timestamp: string;
  from?: string;
  to?: string;
}

export default function Laces() {
  const [balance, setBalance] = useState<LacesBalance>({
    total: 2847,
    earned_today: 156,
    pending: 24,
    rank: 42,
    percentile: 15
  });
  const [transactions, setTransactions] = useState<Transaction[]>([
    {
      id: '1',
      type: 'earned',
      amount: 25,
      description: 'Signal posted in Downtown LA',
      timestamp: '2 minutes ago'
    },
    {
      id: '2', 
      type: 'earned',
      amount: 50,
      description: 'Community boost reward',
      timestamp: '1 hour ago'
    },
    {
      id: '3',
      type: 'transferred',
      amount: 100,
      description: 'Sent to @sneaker_scout',
      timestamp: '3 hours ago',
      to: 'sneaker_scout'
    }
  ]);

  const { setRef, isIntersecting } = useStaggeredIntersection(6);

  useLacesUpdates((transaction) => {
    // Add new transaction to the list
    setTransactions(prev => [transaction, ...prev.slice(0, 9)]);
    // Update balance
    if (transaction.type === 'earned') {
      setBalance(prev => ({
        ...prev,
        total: prev.total + transaction.amount,
        earned_today: prev.earned_today + transaction.amount
      }));
    }
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
            LACES Economy
          </motion.h1>
          <motion.p 
            className="text-lg text-earth-700 dark:text-earth-300 mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          >
            Your stake in the underground network
          </motion.p>
          
          {/* Balance Display */}
          <motion.div 
            className="flex items-center gap-6"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
          >
            <div className="flex items-center gap-3 px-6 py-3 rounded-2xl glass-card">
              <motion.div 
                className="p-2 bg-earth-500 rounded-xl shadow-glow"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                <Coins className="w-6 h-6 text-earth-50" />
              </motion.div>
              <div>
                <p className="text-2xl font-bold text-earth-800 dark:text-earth-200">
                  {balance.total.toLocaleString()}
                </p>
                <p className="text-sm text-earth-600 dark:text-earth-400">Total LACES</p>
              </div>
            </div>
            
            <AnimatedButton variant="earth" size="sm" className="magnetic">
              <Gift className="w-4 h-4" />
              Claim Daily
            </AnimatedButton>
          </motion.div>
        </div>
        
        {/* Floating background elements */}
        <div className="absolute top-6 right-6 w-24 h-24 bg-earth-400/20 rounded-full blur-2xl animate-float" />
        <div className="absolute bottom-6 left-6 w-16 h-16 bg-sage-400/20 rounded-full blur-xl float-gentle" style={{'--delay': '2s'} as any} />
      </motion.div>

      {/* Stats Cards */}
      <motion.div 
        className="grid gap-6 md:grid-cols-2 lg:grid-cols-4"
        variants={containerVariants}
      >
        <motion.div variants={itemVariants} className="magnetic">
          <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-earth-600 dark:text-earth-400">Today's Earnings</p>
                  <p className="text-2xl font-bold text-sage-600 dark:text-sage-400">
                    +{balance.earned_today}
                  </p>
                </div>
                <motion.div 
                  className="p-3 bg-sage-500/10 rounded-xl"
                  whileHover={{ scale: 1.1 }}
                >
                  <TrendingUp className="w-6 h-6 text-sage-500" />
                </motion.div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} className="magnetic">
          <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-earth-600 dark:text-earth-400">Community Rank</p>
                  <p className="text-2xl font-bold text-earth-700 dark:text-earth-300">
                    #{balance.rank}
                  </p>
                </div>
                <motion.div 
                  className="p-3 bg-earth-500/10 rounded-xl"
                  whileHover={{ scale: 1.1 }}
                >
                  <Award className="w-6 h-6 text-earth-500" />
                </motion.div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} className="magnetic">
          <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-earth-600 dark:text-earth-400">Pending</p>
                  <p className="text-2xl font-bold text-stone-600 dark:text-stone-400">
                    {balance.pending}
                  </p>
                </div>
                <motion.div 
                  className="p-3 bg-stone-500/10 rounded-xl"
                  whileHover={{ scale: 1.1 }}
                >
                  <Target className="w-6 h-6 text-stone-500" />
                </motion.div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} className="magnetic">
          <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-earth-600 dark:text-earth-400">Top {balance.percentile}%</p>
                  <p className="text-2xl font-bold text-earth-700 dark:text-earth-300">
                    Elite
                  </p>
                </div>
                <motion.div 
                  className="p-3 bg-earth-500/10 rounded-xl"
                  whileHover={{ scale: 1.1 }}
                >
                  <Users className="w-6 h-6 text-earth-500" />
                </motion.div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Transaction History */}
      <motion.div 
        className="grid gap-6 lg:grid-cols-3"
        variants={containerVariants}
      >
        {/* Recent Transactions */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-earth-700 dark:text-earth-300">
                <Zap className="h-5 w-5 text-earth-500" />
                Recent Transactions
              </CardTitle>
              <CardDescription className="text-earth-600 dark:text-earth-400">
                Your latest LACES activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {transactions.map((transaction, index) => (
                  <motion.div
                    key={transaction.id}
                    className="flex items-center justify-between p-4 rounded-xl hover:bg-earth-50 dark:hover:bg-earth-800/50 transition-colors magnetic"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ scale: 1.02 }}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${
                        transaction.type === 'earned' ? 'bg-sage-500/10' :
                        transaction.type === 'spent' ? 'bg-red-500/10' :
                        'bg-earth-500/10'
                      }`}>
                        <Coins className={`w-4 h-4 ${
                          transaction.type === 'earned' ? 'text-sage-500' :
                          transaction.type === 'spent' ? 'text-red-500' :
                          'text-earth-500'
                        }`} />
                      </div>
                      <div>
                        <p className="font-medium text-earth-700 dark:text-earth-300">
                          {transaction.description}
                        </p>
                        <p className="text-sm text-earth-600 dark:text-earth-400">
                          {transaction.timestamp}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${
                        transaction.type === 'earned' ? 'text-sage-600 dark:text-sage-400' :
                        transaction.type === 'spent' ? 'text-red-600 dark:text-red-400' :
                        'text-earth-600 dark:text-earth-400'
                      }`}>
                        {transaction.type === 'spent' ? '-' : '+'}
                        {transaction.amount}
                      </p>
                      <Badge variant="outline" className="text-xs border-earth-300 dark:border-earth-600">
                        {transaction.type}
                      </Badge>
                    </div>
                  </motion.div>
                ))}
              </div>
              
              <motion.div 
                className="mt-6 pt-4 border-t border-earth-200 dark:border-earth-700"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                <AnimatedButton 
                  variant="outline" 
                  className="w-full magnetic border-earth-300 hover:bg-earth-50 dark:hover:bg-earth-800"
                >
                  View All Transactions
                  <ArrowRight className="w-4 h-4 ml-2" />
                </AnimatedButton>
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Earning Opportunities */}
        <motion.div variants={itemVariants}>
          <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-earth-700 dark:text-earth-300">
                <Target className="h-5 w-5 text-sage-500" />
                Earn More
              </CardTitle>
              <CardDescription className="text-earth-600 dark:text-earth-400">
                Ways to boost your LACES
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { action: 'Post hyperlocal signal', reward: '25-75', icon: <Zap className="w-4 h-4" /> },
                  { action: 'Daily community check-in', reward: '50', icon: <Users className="w-4 h-4" /> },
                  { action: 'Verify location drop', reward: '100', icon: <Award className="w-4 h-4" /> },
                  { action: 'Boost community signal', reward: '15-30', icon: <TrendingUp className="w-4 h-4" /> },
                ].map((opportunity, index) => (
                  <motion.div
                    key={opportunity.action}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-earth-50 dark:hover:bg-earth-800/50 transition-colors magnetic cursor-pointer"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ scale: 1.02 }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-sage-500/10 rounded-lg">
                        {opportunity.icon}
                      </div>
                      <span className="text-sm font-medium text-earth-700 dark:text-earth-300">
                        {opportunity.action}
                      </span>
                    </div>
                    <Badge className="bg-sage-500/20 text-sage-700 dark:text-sage-300 border-sage-300">
                      +{opportunity.reward}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Performance Overview */}
      <motion.div variants={itemVariants}>
        <Card className="glass-card border-earth-200 dark:border-earth-700 hover:shadow-glow transition-all duration-300 magnetic">
          <CardHeader>
            <CardTitle className="text-earth-700 dark:text-earth-300">Performance Overview</CardTitle>
            <CardDescription className="text-earth-600 dark:text-earth-400">
              Your contribution to the network
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="text-center">
                <motion.div 
                  className="text-3xl font-bold text-earth-700 dark:text-earth-300 mb-2"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.5, type: "spring", bounce: 0.4 }}
                >
                  #{balance.rank}
                </motion.div>
                <p className="text-sm text-earth-600 dark:text-earth-400">Community Rank</p>
                <Progress 
                  value={100 - balance.percentile} 
                  className="h-2 mt-2 bg-earth-200 dark:bg-earth-700"
                />
              </div>
              
              <div className="text-center">
                <motion.div 
                  className="text-3xl font-bold text-sage-600 dark:text-sage-400 mb-2"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.6, type: "spring", bounce: 0.4 }}
                >
                  {balance.earned_today}
                </motion.div>
                <p className="text-sm text-earth-600 dark:text-earth-400">Earned Today</p>
                <Progress 
                  value={(balance.earned_today / 200) * 100} 
                  className="h-2 mt-2 bg-earth-200 dark:bg-earth-700"
                />
              </div>
              
              <div className="text-center">
                <motion.div 
                  className="text-3xl font-bold text-stone-600 dark:text-stone-400 mb-2"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.7, type: "spring", bounce: 0.4 }}
                >
                  {balance.pending}
                </motion.div>
                <p className="text-sm text-earth-600 dark:text-earth-400">Pending</p>
                <Progress 
                  value={(balance.pending / 50) * 100} 
                  className="h-2 mt-2 bg-earth-200 dark:bg-earth-700"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
