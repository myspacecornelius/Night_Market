import React from 'react'
import { motion } from 'framer-motion'
import { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/cn'

interface MetricsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: {
    value: number
    label: string
    isPositive: boolean
  }
  className?: string
  delay?: number
}

export const MetricsCard = ({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend, 
  className,
  delay = 0 
}: MetricsCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      whileHover={{ y: -4 }}
      className={cn('group', className)}
    >
      <Card className="relative overflow-hidden transition-all duration-300 hover:shadow-lg border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-300">
            <Icon className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground mb-1">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground mb-2">
              {subtitle}
            </p>
          )}
          {trend && (
            <div className="flex items-center text-xs">
              <span
                className={cn(
                  'font-medium',
                  trend.isPositive ? 'text-green-600' : 'text-red-600'
                )}
              >
                {trend.isPositive ? '+' : ''}{trend.value}%
              </span>
              <span className="text-muted-foreground ml-1">
                {trend.label}
              </span>
            </div>
          )}
        </CardContent>
        
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      </Card>
    </motion.div>
  )
}