import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Bell, BellRing } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/badge'
import { NotificationCenter } from './NotificationCenter'
import { useWebSocket } from '@/hooks/useWebSocket'
import { cn } from '@/lib/cn'

interface NotificationTriggerProps {
  className?: string
}

export const NotificationTrigger = ({ className }: NotificationTriggerProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(3) // Mock data - would come from state/API
  const { isConnected } = useWebSocket()

  const handleToggle = () => {
    setIsOpen(!isOpen)
  }

  return (
    <>
      <div className={cn('relative', className)}>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggle}
          className={cn(
            'relative p-2 transition-colors',
            isOpen && 'bg-muted'
          )}
        >
          <motion.div
            animate={unreadCount > 0 ? { 
              rotate: [0, -10, 10, -10, 0],
              scale: [1, 1.05, 1]
            } : {}}
            transition={{ 
              duration: 0.5,
              repeat: unreadCount > 0 ? Infinity : 0,
              repeatDelay: 3
            }}
          >
            {unreadCount > 0 ? (
              <BellRing className="h-5 w-5" />
            ) : (
              <Bell className="h-5 w-5" />
            )}
          </motion.div>
          
          {/* Unread Badge */}
          {unreadCount > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1"
            >
              <Badge 
                variant="destructive" 
                className="h-5 w-5 p-0 flex items-center justify-center text-xs font-medium"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            </motion.div>
          )}
          
          {/* Connection Status Indicator */}
          <div className={cn(
            'absolute bottom-0 right-0 w-2 h-2 rounded-full border border-background',
            isConnected ? 'bg-green-500' : 'bg-red-500'
          )} />
        </Button>
      </div>
      
      <NotificationCenter 
        isOpen={isOpen} 
        onClose={() => setIsOpen(false)} 
      />
    </>
  )
}