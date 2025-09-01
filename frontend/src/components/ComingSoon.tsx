import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Coffee, Code } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  subtitle?: string;
}

export default function ComingSoon({ title, subtitle }: ComingSoonProps) {
  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center p-6">
      <motion.div 
        className="relative max-w-2xl mx-auto text-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Background Glass Card */}
        <div className="relative glass-card p-12 rounded-3xl overflow-hidden">
          {/* Floating background elements */}
          <div className="absolute top-6 right-6 w-20 h-20 bg-earth-400/20 rounded-full blur-2xl animate-float" />
          <div className="absolute bottom-6 left-6 w-16 h-16 bg-sage-400/20 rounded-full blur-xl float-gentle" style={{'--delay': '2s'} as any} />
          
          <div className="relative z-10">
            {/* Icon */}
            <motion.div 
              className="inline-flex p-4 rounded-2xl bg-earth-500 shadow-glow mb-6 magnetic"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            >
              <Sparkles className="w-8 h-8 text-earth-50" />
            </motion.div>

            {/* Title */}
            <motion.h1 
              className="text-4xl font-bold text-gradient-earth mb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
            >
              {title}
            </motion.h1>

            {/* Subtitle */}
            <motion.p 
              className="text-lg text-earth-700 dark:text-earth-300 mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.8 }}
            >
              {subtitle || "Something extraordinary is brewing here"}
            </motion.p>

            {/* Status indicators */}
            <motion.div 
              className="flex items-center justify-center gap-6 text-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.8 }}
            >
              <div className="flex items-center gap-2 px-4 py-2 rounded-full glass-card">
                <motion.div 
                  className="w-2 h-2 bg-sage-500 rounded-full"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="font-medium text-earth-700 dark:text-earth-300">
                  UI scaffolding in place
                </span>
              </div>
              
              <div className="flex items-center gap-2 px-4 py-2 rounded-full glass-card">
                <Code className="w-4 h-4 text-earth-600 dark:text-earth-400" />
                <span className="font-medium text-earth-700 dark:text-earth-300">
                  Ready for data integration
                </span>
              </div>
            </motion.div>

            {/* Decorative elements */}
            <motion.div 
              className="mt-8 flex items-center justify-center gap-2"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8, duration: 0.6 }}
            >
              {[...Array(3)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-2 h-2 bg-gradient-to-r from-earth-400 to-sage-400 rounded-full"
                  animate={{ 
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 1, 0.5]
                  }}
                  transition={{ 
                    duration: 2, 
                    repeat: Infinity,
                    delay: i * 0.2
                  }}
                />
              ))}
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
