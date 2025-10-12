import React from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { 
  Plus, 
  MapPin, 
  Search, 
  Zap, 
  Camera, 
  Users,
  TrendingUp,
  Bell
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'

interface QuickAction {
  id: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  href?: string
  onClick?: () => void
  variant?: 'default' | 'primary' | 'success' | 'warning'
  badge?: string
  disabled?: boolean
}

const defaultActions: QuickAction[] = [
  {
    id: 'create-signal',
    title: 'Create Signal',
    description: 'Share a sneaker spotting or intel',
    icon: Plus,
    href: '/signals/create',
    variant: 'primary'
  },
  {
    id: 'nearby-drops',
    title: 'Nearby Drops',
    description: 'Check what\'s happening around you',
    icon: MapPin,
    href: '/heatmap',
    badge: 'Live'
  },
  {
    id: 'search-releases',
    title: 'Search Releases',
    description: 'Find upcoming sneaker drops',
    icon: Search,
    href: '/drops'
  },
  {
    id: 'join-dropzone',
    title: 'Join Drop Zone',
    description: 'Connect with local communities',
    icon: Users,
    href: '/dropzones'
  },
  {
    id: 'boost-signal',
    title: 'Boost Signal',
    description: 'Spend LACES to amplify a post',
    icon: Zap,
    variant: 'warning',
    onClick: () => console.log('Boost modal')
  },
  {
    id: 'camera-scan',
    title: 'Scan Sneaker',
    description: 'Identify sneakers with AI',
    icon: Camera,
    onClick: () => console.log('Camera modal')
  }
]

const variantStyles = {
  default: 'hover:bg-muted/50 border-border/50',
  primary: 'hover:bg-primary/10 border-primary/20 text-primary hover:text-primary',
  success: 'hover:bg-green-500/10 border-green-500/20 text-green-600 hover:text-green-600',
  warning: 'hover:bg-orange-500/10 border-orange-500/20 text-orange-600 hover:text-orange-600'
}

interface QuickActionsProps {
  actions?: QuickAction[]
  className?: string
}

export const QuickActions = ({ actions = defaultActions, className }: QuickActionsProps) => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: {
        type: "spring",
        damping: 20,
        stiffness: 300
      }
    }
  }

  const renderAction = (action: QuickAction) => {
    const ActionIcon = action.icon
    const content = (
      <motion.div
        variants={itemVariants}
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        className="h-full"
      >
        <Card 
          className={cn(
            'h-full cursor-pointer transition-all duration-300 border-2 bg-card/60 backdrop-blur-sm group',
            variantStyles[action.variant || 'default'],
            action.disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent'
          )}
        >
          <CardContent className="p-4 h-full flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div className={cn(
                'p-2 rounded-lg transition-all duration-300 group-hover:scale-110',
                action.variant === 'primary' ? 'bg-primary/10' :
                action.variant === 'success' ? 'bg-green-500/10' :
                action.variant === 'warning' ? 'bg-orange-500/10' :
                'bg-muted/50'
              )}>
                <ActionIcon className="h-5 w-5" />
              </div>
              {action.badge && (
                <Badge variant="secondary" className="text-xs">
                  {action.badge}
                </Badge>
              )}
            </div>
            
            <h3 className="font-semibold text-sm mb-1 group-hover:text-foreground transition-colors">
              {action.title}
            </h3>
            <p className="text-xs text-muted-foreground flex-1">
              {action.description}
            </p>
            
            {/* Hover indicator */}
            <div className="mt-3 h-0.5 w-0 bg-current transition-all duration-300 group-hover:w-full opacity-0 group-hover:opacity-100" />
          </CardContent>
        </Card>
      </motion.div>
    )

    if (action.disabled) {
      return <div key={action.id}>{content}</div>
    }

    if (action.href) {
      return (
        <Link key={action.id} to={action.href} className="block h-full">
          {content}
        </Link>
      )
    }

    return (
      <button 
        key={action.id} 
        onClick={action.onClick}
        className="block h-full w-full text-left"
      >
        {content}
      </button>
    )
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={cn('space-y-4', className)}
    >
      <Card className="bg-card/80 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {actions.map(renderAction)}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}