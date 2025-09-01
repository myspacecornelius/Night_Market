import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, User, Map, Flame, Car, Home, X, Coins, Activity, Settings } from 'lucide-react';
import MagneticCursor from './MagneticCursor';
import ThemeToggle from './ThemeToggle';

export function AppShell() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  const navigation = [
    { to: '/', label: 'Dashboard', icon: Home, primary: true },
    { to: '/laces', label: 'LACES', icon: Coins },
    { to: '/heatmap', label: 'HeatMap', icon: Flame },
    { to: '/dropzones', label: 'DropZones', icon: Map },
    { to: '/analytics', label: 'Analytics', icon: Activity },
    { to: '/profile', label: 'Profile', icon: User },
  ];

  const pageVariants = {
    initial: { opacity: 0, y: 20, scale: 0.98 },
    in: { opacity: 1, y: 0, scale: 1 },
    out: { opacity: 0, y: -20, scale: 1.02 },
  };

  const pageTransition = {
    type: 'tween',
    ease: [0.22, 1, 0.36, 1],
    duration: 0.4,
  };

  return (
    <div className="relative min-h-screen theme-transition">
      <MagneticCursor />
      
      {/* Sophisticated background gradients */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2 }}
      >
        {/* Main gradient orb */}
        <div className="absolute top-0 left-1/4 h-[60rem] w-[60rem] -translate-y-1/2 rounded-full blur-3xl opacity-30"
             style={{ background: 'radial-gradient(closest-side, rgb(166, 139, 91), transparent 70%)' }} />
        
        {/* Secondary accent orb */}
        <div className="absolute top-1/3 right-1/4 h-[40rem] w-[40rem] rounded-full blur-3xl opacity-20"
             style={{ background: 'radial-gradient(closest-side, rgb(90, 134, 89), transparent 70%)' }} />
        
        {/* Floating particles */}
        <motion.div 
          className="absolute top-1/4 left-3/4 w-2 h-2 bg-earth-400/40 rounded-full"
          animate={{ 
            y: [0, -30, 0],
            x: [0, 15, 0],
            opacity: [0.4, 0.8, 0.4]
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute top-2/3 left-1/6 w-1 h-1 bg-sage-400/40 rounded-full"
          animate={{ 
            y: [0, 20, 0],
            x: [0, -10, 0],
            opacity: [0.3, 0.7, 0.3]
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />
      </motion.div>

      {/* Enhanced Header */}
      <motion.header 
        className="sticky top-0 z-30 backdrop-blur-xl bg-white/80 dark:bg-earth-900/80 border-b border-earth-200/50 dark:border-earth-700/50 transition-all duration-300"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="container flex h-20 items-center justify-between">
          <motion.div 
            className="flex items-center gap-4"
            whileHover={{ scale: 1.02 }}
          >
            <div className="p-2 rounded-xl bg-earth-500 shadow-glow magnetic">
              <Flame className="w-6 h-6 text-white" />
            </div>
            <NavLink 
              to="/" 
              className="text-2xl font-bold text-gradient-earth magnetic"
            >
              Dharma
            </NavLink>
          </motion.div>
          
          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-2">
            {navigation.map((item, index) => (
              <motion.div
                key={item.to}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 + 0.3 }}
              >
                <NavLink 
                  to={item.to}
                  className={({ isActive }) => `
                    nav-item magnetic flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-300
                    ${isActive 
                      ? 'bg-earth-100 dark:bg-earth-800 text-earth-700 dark:text-earth-300' 
                      : 'text-earth-600 dark:text-earth-400 hover:text-earth-700 dark:hover:text-earth-300'
                    }
                  `}
                >
                  <item.icon size={18} />
                  {item.label}
                </NavLink>
              </motion.div>
            ))}
            
            {/* Theme Toggle */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: navigation.length * 0.1 + 0.4 }}
              className="ml-4"
            >
              <ThemeToggle />
            </motion.div>
          </nav>

          {/* Mobile Menu Button */}
          <motion.button
            className="lg:hidden p-2 rounded-xl magnetic hover:bg-earth-100 dark:hover:bg-earth-800 transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            whileTap={{ scale: 0.95 }}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </motion.button>
        </div>

        {/* Mobile Navigation */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              className="lg:hidden absolute top-full left-0 right-0 bg-white/95 dark:bg-earth-900/95 backdrop-blur-xl border-b border-earth-200/50 dark:border-earth-700/50"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="container py-4 space-y-2">
                {navigation.map((item, index) => (
                  <motion.div
                    key={item.to}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <NavLink 
                      to={item.to}
                      className={({ isActive }) => `
                        flex items-center gap-3 px-4 py-3 rounded-xl magnetic transition-all duration-300
                        ${isActive 
                          ? 'bg-earth-100 dark:bg-earth-800 text-earth-700 dark:text-earth-300' 
                          : 'text-earth-600 dark:text-earth-400 hover:bg-earth-50 dark:hover:bg-earth-800/50'
                        }
                      `}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <item.icon size={20} />
                      <span className="font-medium">{item.label}</span>
                    </NavLink>
                  </motion.div>
                ))}
                
                {/* Mobile Theme Toggle */}
                <motion.div 
                  className="px-4 py-3"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: navigation.length * 0.05 + 0.1 }}
                >
                  <ThemeToggle />
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      {/* Main Content with Page Transitions */}
      <AnimatePresence mode="wait">
        <motion.main 
          key={location.pathname}
          className="relative z-10"
          variants={pageVariants}
          initial="initial"
          animate="in"
          exit="out"
          transition={pageTransition}
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>

      {/* Enhanced Footer */}
      <motion.footer 
        className="relative mt-24 border-t border-earth-200/50 dark:border-earth-700/50 bg-gradient-to-r from-earth-50 to-sage-50 dark:from-earth-900 dark:to-sage-900"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.8 }}
      >
        <div className="container py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-xl bg-earth-500 shadow-glow">
                <Flame className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-earth-700 dark:text-earth-300">Dharma</h3>
                <p className="text-sm text-muted-foreground">The Underground Network</p>
              </div>
            </div>
            
            <div className="text-center md:text-right">
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} Dharma. Built with sophisticated taste.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Connecting sneaker culture through hyperlocal intelligence
              </p>
            </div>
          </div>
        </div>
        
        {/* Footer decoration */}
        <div className="absolute top-0 left-1/2 w-32 h-0.5 bg-gradient-to-r from-transparent via-earth-300 to-transparent -translate-x-1/2" />
      </motion.footer>
    </div>
  );
}
export default AppShell
