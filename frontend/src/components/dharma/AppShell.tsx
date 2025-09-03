import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Outlet, NavLink, useLocation } from "react-router-dom"
import { 
  Home, 
  Map, 
  Flame, 
  Users, 
  ShoppingBag, 
  User, 
  Search,
  Plus,
  Menu,
  X
} from "lucide-react"
import { Button } from "@/components/ui/Button"
import { LacesDisplay } from "./LacesDisplay"
import { cn } from "@/lib/utils"

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  badge?: number
}

const navItems: NavItem[] = [
  { to: "/", label: "Heat", icon: Home },
  { to: "/feed", label: "Feed", icon: Users },
  { to: "/drops", label: "Drops", icon: Flame },
  { to: "/market", label: "Market", icon: ShoppingBag },
  { to: "/profile", label: "Profile", icon: User },
]

export function DharmaAppShell() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)
  const [showCommandPalette, setShowCommandPalette] = React.useState(false)
  const location = useLocation()
  
  // Mock user data - replace with actual user context
  const user = {
    username: "sneakerhead",
    lacesBalance: 1247,
    avatar: null
  }
  
  return (
    <div className="min-h-screen bg-background">
      {/* Background Effects */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-heat/5 blur-3xl"
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3] 
          }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <motion.div
          className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-neon/5 blur-3xl"
          animate={{ 
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.4, 0.2] 
          }}
          transition={{ duration: 10, repeat: Infinity }}
        />
      </div>

      {/* Top Navigation */}
      <header className="sticky top-0 z-50 glass border-b border-border/50">
        <div className="container flex h-16 items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <motion.div
              className="flex items-center gap-2"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-heat to-heat/80 flex items-center justify-center">
                <Flame size={18} className="text-white" />
              </div>
              <span className="font-grotesk font-bold text-xl">Dharma</span>
            </motion.div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.to
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                    isActive 
                      ? "text-foreground bg-accent" 
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                >
                  <item.icon size={16} />
                  {item.label}
                  {item.badge && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-heat text-white rounded-full">
                      {item.badge}
                    </span>
                  )}
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 bg-accent rounded-lg -z-10"
                      layoutId="activeTab"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </NavLink>
              )
            })}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            {/* LACES Balance */}
            <div className="hidden sm:block">
              <LacesDisplay amount={user.lacesBalance} size="sm" />
            </div>
            
            {/* Search */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowCommandPalette(true)}
              className="hidden sm:flex"
            >
              <Search size={18} />
            </Button>
            
            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            className="fixed inset-0 z-40 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div 
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <motion.nav
              className="absolute top-16 left-0 right-0 bg-card border-b border-border shadow-lg"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
            >
              <div className="container py-4 space-y-2">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.to
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-all duration-150",
                        isActive 
                          ? "text-foreground bg-accent" 
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      )}
                    >
                      <item.icon size={20} />
                      {item.label}
                      {item.badge && (
                        <span className="ml-auto px-2 py-1 text-xs bg-heat text-white rounded-full">
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  )
                })}
                
                {/* Mobile LACES Balance */}
                <div className="px-4 py-3 border-t border-border mt-4">
                  <LacesDisplay amount={user.lacesBalance} size="md" />
                </div>
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="container py-6">
        <Outlet />
      </main>

      {/* Floating Action Button - Quick Compose */}
      <motion.div
        className="fixed bottom-6 right-6 z-30"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <Button
          size="icon-lg"
          variant="heat"
          className="rounded-full shadow-lg"
        >
          <Plus size={24} />
        </Button>
      </motion.div>

      {/* Bottom Navigation - Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden glass border-t border-border/50">
        <div className="flex items-center justify-around py-2">
          {navItems.slice(0, 4).map((item) => {
            const isActive = location.pathname === item.to
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all duration-150",
                  isActive ? "text-heat" : "text-muted-foreground"
                )}
              >
                <item.icon size={20} />
                <span className="text-xs font-medium">{item.label}</span>
                {item.badge && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-heat text-white text-xs rounded-full flex items-center justify-center">
                    {item.badge}
                  </div>
                )}
              </NavLink>
            )
          })}
          
          {/* Profile in bottom nav */}
          <NavLink
            to="/profile"
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all duration-150",
              location.pathname === "/profile" ? "text-heat" : "text-muted-foreground"
            )}
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-heat to-heat/80 flex items-center justify-center">
              <User size={14} className="text-white" />
            </div>
            <span className="text-xs font-medium">Profile</span>
          </NavLink>
        </div>
      </nav>

      {/* Command Palette - TODO: Implement */}
      {showCommandPalette && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-20">
          <div className="w-full max-w-lg bg-card rounded-lg shadow-xl border border-border">
            <div className="p-4">
              <div className="text-sm text-muted-foreground">Command palette coming soon...</div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowCommandPalette(false)}
                className="mt-2"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
