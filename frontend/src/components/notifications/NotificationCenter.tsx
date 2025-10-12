import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import { 
  Bell, 
  BellOff, 
  X, 
  Check, 
  MoreHorizontal,
  Filter,
  Settings,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu'
import { useRealtimeNotifications, useWebSocket } from '@/hooks/useWebSocket'
import { cn } from '@/lib/cn'

interface Notification {
  id: string
  type: 'signal' | 'laces' | 'social' | 'system'
  title: string
  message: string
  timestamp: Date
  read: boolean
  avatar?: string
  actionUrl?: string
  metadata?: {
    signalType?: string
    lacesAmount?: number
    location?: string
  }
}

// Mock notifications for development
const mockNotifications: Notification[] = [
  {
    id: '1',
    type: 'signal',
    title: 'New signal in your area',
    message: 'Jordan 4 "Black Cat" spotted at Foot Locker Times Square',
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    read: false,
    metadata: {
      signalType: 'SPOTTED',
      location: 'Times Square, NYC'
    }
  },
  {
    id: '2',
    type: 'laces',
    title: 'LACES earned',
    message: 'You earned 25 LACES for your signal boost',
    timestamp: new Date(Date.now() - 1000 * 60 * 15),
    read: false,
    metadata: {
      lacesAmount: 25
    }
  },
  {
    id: '3',
    type: 'social',
    title: 'New follower',
    message: 'SneakerHunter23 started following you',
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    read: true,
    avatar: 'https://github.com/shadcn.png'
  }
]

const getNotificationIcon = (type: Notification['type']) => {
  switch (type) {
    case 'signal': return '📡'
    case 'laces': return '⚡'
    case 'social': return '👥'
    case 'system': return '⚙️'
    default: return '🔔'
  }
}

const getNotificationColor = (type: Notification['type']) => {
  switch (type) {
    case 'signal': return 'text-blue-600 bg-blue-500/10'
    case 'laces': return 'text-yellow-600 bg-yellow-500/10'
    case 'social': return 'text-green-600 bg-green-500/10'
    case 'system': return 'text-gray-600 bg-gray-500/10'
    default: return 'text-gray-600 bg-gray-500/10'
  }
}

interface NotificationCenterProps {
  isOpen: boolean
  onClose: () => void
  className?: string
}

export const NotificationCenter = ({ isOpen, onClose, className }: NotificationCenterProps) => {
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const { isConnected } = useWebSocket()
  const { notifications: realtimeNotifications } = useRealtimeNotifications()

  const filteredNotifications = notifications.filter(notification => 
    filter === 'all' || !notification.read
  )

  const unreadCount = notifications.filter(n => !n.read).length

  const markAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    )
  }

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const clearAll = () => {
    setNotifications([])
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          
          {/* Notification Panel */}
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className={cn(
              'fixed right-4 top-4 bottom-4 w-96 z-50',
              className
            )}
          >
            <Card className="h-full flex flex-col bg-card/95 backdrop-blur-md border-border/50 shadow-xl">
              {/* Header */}
              <CardHeader className="flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Notifications
                    {unreadCount > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {unreadCount}
                      </Badge>
                    )}
                  </CardTitle>
                  
                  <div className="flex items-center gap-1">
                    {/* Connection Status */}
                    <div className={cn(
                      'w-2 h-2 rounded-full',
                      isConnected ? 'bg-green-500' : 'bg-red-500'
                    )} />
                    
                    {/* Filter & Settings */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Filter</DropdownMenuLabel>
                        <DropdownMenuItem 
                          onClick={() => setFilter('all')}
                          className={filter === 'all' ? 'bg-muted' : ''}
                        >
                          All notifications
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => setFilter('unread')}
                          className={filter === 'unread' ? 'bg-muted' : ''}
                        >
                          Unread only
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={markAllAsRead}>
                          <Check className="h-4 w-4 mr-2" />
                          Mark all as read
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={clearAll} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Clear all
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={onClose}
                      className="h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                {/* Connection Status */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={cn(
                    'flex items-center gap-1',
                    isConnected ? 'text-green-600' : 'text-red-600'
                  )}>
                    {isConnected ? '🟢 Live updates' : '🔴 Disconnected'}
                  </span>
                </div>
              </CardHeader>

              {/* Notifications List */}
              <CardContent className="flex-1 p-0 overflow-hidden">
                <ScrollArea className="h-full">
                  {filteredNotifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                      <BellOff className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">
                        {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredNotifications.map((notification, index) => (
                        <motion.div
                          key={notification.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className={cn(
                            'p-4 border-b border-border/50 cursor-pointer transition-colors hover:bg-muted/50',
                            !notification.read && 'bg-primary/5 border-l-4 border-l-primary'
                          )}
                          onClick={() => markAsRead(notification.id)}
                        >
                          <div className="flex items-start gap-3">
                            {/* Icon or Avatar */}
                            <div className="shrink-0 mt-1">
                              {notification.avatar ? (
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={notification.avatar} />
                                  <AvatarFallback>
                                    {notification.title.slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                              ) : (
                                <div className={cn(
                                  'w-8 h-8 rounded-lg flex items-center justify-center text-sm',
                                  getNotificationColor(notification.type)
                                )}>
                                  {getNotificationIcon(notification.type)}
                                </div>
                              )}
                            </div>
                            
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <h4 className={cn(
                                    'font-medium text-sm',
                                    !notification.read && 'font-semibold'
                                  )}>
                                    {notification.title}
                                  </h4>
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                    {notification.message}
                                  </p>
                                  
                                  {/* Metadata */}
                                  {notification.metadata && (
                                    <div className="flex items-center gap-2 mt-2">
                                      {notification.metadata.location && (
                                        <Badge variant="outline" className="text-xs">
                                          📍 {notification.metadata.location}
                                        </Badge>
                                      )}
                                      {notification.metadata.lacesAmount && (
                                        <Badge variant="secondary" className="text-xs text-yellow-600">
                                          ⚡ +{notification.metadata.lacesAmount}
                                        </Badge>
                                      )}
                                    </div>
                                  )}
                                </div>
                                
                                {/* Delete button */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    deleteNotification(notification.id)
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                              
                              {/* Timestamp */}
                              <time className="text-xs text-muted-foreground mt-2 block">
                                {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                              </time>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}