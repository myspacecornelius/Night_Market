import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon, Monitor } from 'lucide-react';

type Theme = 'light' | 'dark' | 'system';

export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved) {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }

    localStorage.setItem('theme', theme);
  }, [theme, mounted]);

  if (!mounted) {
    return null;
  }

  const themes: Array<{ value: Theme; icon: React.ReactNode; label: string }> = [
    { value: 'light', icon: <Sun className="w-4 h-4" />, label: 'Light' },
    { value: 'dark', icon: <Moon className="w-4 h-4" />, label: 'Dark' },
    { value: 'system', icon: <Monitor className="w-4 h-4" />, label: 'System' },
  ];

  return (
    <div className="relative">
      <motion.div 
        className="flex items-center bg-earth-100 dark:bg-earth-800 rounded-2xl p-1 shadow-inner-soft"
        layout
      >
        {themes.map((item) => (
          <motion.button
            key={item.value}
            className={`
              relative flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-300
              ${theme === item.value 
                ? 'text-earth-700 dark:text-earth-300' 
                : 'text-earth-500 dark:text-earth-400 hover:text-earth-600 dark:hover:text-earth-300'
              }
            `}
            onClick={() => setTheme(item.value)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {theme === item.value && (
              <motion.div
                className="absolute inset-0 bg-white dark:bg-earth-700 rounded-xl shadow-soft"
                layoutId="theme-indicator"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
            
            <motion.div 
              className="relative z-10 flex items-center gap-2"
              animate={{ 
                rotateY: theme === item.value ? [0, 360] : 0 
              }}
              transition={{ 
                duration: 0.6, 
                ease: [0.22, 1, 0.36, 1],
                delay: theme === item.value ? 0.1 : 0
              }}
            >
              {item.icon}
              <span className="hidden sm:inline">{item.label}</span>
            </motion.div>
          </motion.button>
        ))}
      </motion.div>
      
      {/* Theme transition overlay */}
      <motion.div
        className="fixed inset-0 pointer-events-none z-50"
        initial={false}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          background: theme === 'dark' 
            ? 'radial-gradient(circle, rgba(45,27,6,0.8) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(250,249,247,0.8) 0%, transparent 70%)'
        }}
      />
    </div>
  );
};

export default ThemeToggle;