import { motion } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import { 
  Activity, 
  MapPin, 
  Zap, 
  Users, 
  Eye,
  Heart,
  MessageCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

export interface ActivityItem {
  id: string
  type: 'signal' | 'boost' | 'join' | 'like' | 'comment' | 'achievement'
  title: string
  description: string
  timestamp: Date
  user?: {
    id: string
    username: string
    avatar?: string
  }
  metadata?: {
    location?: string
    lacesEarned?: number
    signalType?: string
    achievementLevel?: string
  }
  stats?: {
    likes?: number
    comments?: number
    views?: number
    boosts?: number
  }
}

const getActivityIcon = (type: ActivityItem['type']) => {
  switch (type) {
    case 'signal': return MapPin
    case 'boost': return Zap
    case 'join': return Users
    case 'like': return Heart
    case 'comment': return MessageCircle
    case 'achievement': return Activity
    default: return Activity
  }
}

const getActivityColor = (type: ActivityItem['type']) => {
  switch (type) {
    case 'signal': return 'text-blue-600 bg-blue-500/10'
    case 'boost': return 'text-yellow-600 bg-yellow-500/10'
    case 'join': return 'text-green-600 bg-green-500/10'
    case 'like': return 'text-red-600 bg-red-500/10'
    case 'comment': return 'text-purple-600 bg-purple-500/10'
    case 'achievement': return 'text-orange-600 bg-orange-500/10'
    default: return 'text-gray-600 bg-gray-500/10'
  }
}

interface RecentActivityProps {
  activities?: ActivityItem[]
  maxItems?: number
  showStats?: boolean
  className?: string
}

export const RecentActivity = ({ 
  activities = [], 
  maxItems = 5,
  showStats = true,
  className 
}: RecentActivityProps) => {
  const displayActivities = activities.slice(0, maxItems)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className={className}
    >
      <Card className="bg-card/80 backdrop-blur-sm border-border/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Recent Activity
          </CardTitle>
          <Button variant="ghost" size="sm" className="text-xs">
            View All
          </Button>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {displayActivities.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No activity yet</p>
          )}
          {displayActivities.map((activity, index) => {
            const ActivityIcon = getActivityIcon(activity.type)
            const colorClasses = getActivityColor(activity.type)
            
            return (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
              >
                {/* Activity Icon */}
                <div className={cn('p-2 rounded-lg shrink-0', colorClasses)}>
                  <ActivityIcon className="h-4 w-4" />
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                        {activity.title}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {activity.description}
                      </p>
                      
                      {/* Metadata */}
                      <div className="flex items-center gap-2 mt-2">
                        {activity.metadata?.location && (
                          <Badge variant="outline" className="text-xs">
                            <MapPin className="h-3 w-3 mr-1" />
                            {activity.metadata.location}
                          </Badge>
                        )}
                        {activity.metadata?.lacesEarned && (
                          <Badge variant="secondary" className="text-xs text-yellow-600">
                            <Zap className="h-3 w-3 mr-1" />
                            +{activity.metadata.lacesEarned} LACES
                          </Badge>
                        )}
                      </div>
                      
                      {/* Stats */}
                      {showStats && activity.stats && (
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {/* "> 0": a bare number before && renders as a stray "0" */}
                          {(activity.stats.boosts ?? 0) > 0 && (
                            <span className="flex items-center gap-1">
                              <Zap className="h-3 w-3" />
                              {activity.stats.boosts}
                            </span>
                          )}
                          {(activity.stats.likes ?? 0) > 0 && (
                            <span className="flex items-center gap-1">
                              <Heart className="h-3 w-3" />
                              {activity.stats.likes}
                            </span>
                          )}
                          {(activity.stats.comments ?? 0) > 0 && (
                            <span className="flex items-center gap-1">
                              <MessageCircle className="h-3 w-3" />
                              {activity.stats.comments}
                            </span>
                          )}
                          {(activity.stats.views ?? 0) > 0 && (
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {activity.stats.views}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* User Avatar & Time */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {activity.user && (
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={activity.user.avatar} />
                          <AvatarFallback className="text-xs">
                            {activity.user.username.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <time className="text-xs text-muted-foreground">
                        {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                      </time>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
          
          {/* Load More */}
          {activities.length > maxItems && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="pt-4 border-t border-border/50"
            >
              <Button variant="ghost" className="w-full text-sm">
                Load {activities.length - maxItems} more activities
              </Button>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}