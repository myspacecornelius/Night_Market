import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MapPin, Zap, Users, Settings, X } from 'lucide-react';

interface ActionItem {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  color: 'earth' | 'sage' | 'stone';
}

export const FloatingActionButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  const actions: ActionItem[] = [
    {
      icon: <MapPin className="w-5 h-5" />,
      label: 'Post Signal',
      onClick: () => {
        // TODO: Implement post signal functionality
      },
      color: 'earth',
    },
    {
      icon: <Zap className="w-5 h-5" />,
      label: 'Quick Boost',
      onClick: () => {
        // TODO: Implement quick boost functionality
      },
      color: 'sage',
    },
    {
      icon: <Users className="w-5 h-5" />,
      label: 'Find Community',
      onClick: () => {
        // TODO: Implement find community functionality
      },
      color: 'stone',
    },
    {
      icon: <Settings className="w-5 h-5" />,
      label: 'Settings',
      onClick: () => {
        // TODO: Implement settings navigation
      },
      color: 'earth',
    },
  ];

  const containerVariants = {
    open: {
      transition: { staggerChildren: 0.1, delayChildren: 0.1 },
    },
    closed: {
      transition: { staggerChildren: 0.05, staggerDirection: -1 },
    },
  };

  const itemVariants = {
    open: {
      scale: 1,
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 24,
      },
    },
    closed: {
      scale: 0,
      opacity: 0,
      y: 20,
      transition: {
        duration: 0.2,
      },
    },
  };

  const getColorClasses = (color: ActionItem['color']) => {
    switch (color) {
      case 'earth':
        return 'bg-earth-500 hover:bg-earth-600 text-earth-50 shadow-glow';
      case 'sage':
        return 'bg-sage-500 hover:bg-sage-600 text-sage-50 shadow-glow-sage';
      case 'stone':
        return 'bg-stone-500 hover:bg-stone-600 text-stone-50 shadow-medium';
      default:
        return 'bg-earth-500 hover:bg-earth-600 text-earth-50 shadow-glow';
    }
  };

  return (
    <div className="fixed bottom-8 right-8 z-40">
      {/* Action Items */}
      <motion.div
        className="absolute bottom-16 right-0 space-y-3"
        variants={containerVariants}
        initial="closed"
        animate={isOpen ? 'open' : 'closed'}
      >
        <AnimatePresence>
          {isOpen && actions.map((action, index) => (
            <motion.div
              key={action.label}
              className="flex items-center gap-3"
              variants={itemVariants}
            >
              {/* Label */}
              <motion.div
                className="bg-white dark:bg-earth-800 text-earth-700 dark:text-earth-300 px-3 py-2 rounded-xl shadow-medium text-sm font-medium whitespace-nowrap"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.05 }}
              >
                {action.label}
              </motion.div>
              
              {/* Action Button */}
              <motion.button
                className={`
                  w-12 h-12 rounded-2xl flex items-center justify-center
                  transition-all duration-300 magnetic
                  ${getColorClasses(action.color)}
                `}
                onClick={() => {
                  action.onClick();
                  setIsOpen(false);
                }}
                whileHover={{ scale: 1.1, rotate: 5 }}
                whileTap={{ scale: 0.9 }}
              >
                {action.icon}
              </motion.button>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Main FAB */}
      <motion.button
        className="w-16 h-16 bg-earth-500 hover:bg-earth-600 text-white rounded-2xl shadow-glow flex items-center justify-center magnetic"
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        animate={{ 
          rotate: isOpen ? 45 : 0,
          backgroundColor: isOpen ? '#6b4423' : '#a68b5b' // earth-700 : earth-500
        }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={isOpen ? 'close' : 'open'}
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 90 }}
            transition={{ duration: 0.2 }}
          >
            {isOpen ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
          </motion.div>
        </AnimatePresence>
      </motion.button>

      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 bg-black/10 backdrop-blur-sm -z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default FloatingActionButton;