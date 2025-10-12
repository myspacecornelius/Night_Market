import React from 'react'
import { motion } from 'framer-motion'
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/Button'
import { TrendingUp, TrendingDown, Activity } from 'lucide-react'

interface ActivityDataPoint {
  date: string
  signals: number
  laces: number
  posts: number
}

interface ActivityChartProps {
  data: ActivityDataPoint[]
  title?: string
  description?: string
  timeframe?: '7d' | '30d' | '90d'
  onTimeframeChange?: (timeframe: '7d' | '30d' | '90d') => void
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background/95 backdrop-blur-sm p-3 shadow-md">
        <p className="font-medium text-sm mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            <div 
              className="w-2 h-2 rounded-full" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="capitalize">{entry.dataKey}:</span>
            <span className="font-medium">{entry.value}</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export const ActivityChart = ({ 
  data, 
  title = "Activity Overview", 
  description = "Your engagement metrics over time",
  timeframe = '7d',
  onTimeframeChange 
}: ActivityChartProps) => {
  const timeframeOptions = [
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: '90d', label: '90 Days' }
  ] as const

  // Calculate trend
  const calculateTrend = (key: keyof ActivityDataPoint) => {
    if (data.length < 2) return { value: 0, isPositive: true }
    const recent = data.slice(-3).reduce((sum, item) => sum + (item[key] as number), 0) / 3
    const previous = data.slice(-6, -3).reduce((sum, item) => sum + (item[key] as number), 0) / 3
    const change = ((recent - previous) / previous) * 100
    return { value: Math.abs(change), isPositive: change > 0 }
  }

  const signalsTrend = calculateTrend('signals')

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <Card className="bg-card/80 backdrop-blur-sm border-border/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              {title}
            </CardTitle>
            <CardDescription className="mt-1">
              {description}
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mr-3">
              {signalsTrend.isPositive ? (
                <TrendingUp className="h-3 w-3 text-green-600" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-600" />
              )}
              <span className={signalsTrend.isPositive ? 'text-green-600' : 'text-red-600'}>
                {signalsTrend.value.toFixed(1)}%
              </span>
            </div>
            
            {onTimeframeChange && (
              <div className="flex rounded-lg border p-1">
                {timeframeOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={timeframe === option.value ? "default" : "ghost"}
                    size="sm"
                    onClick={() => onTimeframeChange(option.value)}
                    className="h-7 px-2 text-xs"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <defs>
                  <linearGradient id="signalsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="lacesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis 
                  dataKey="date" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="signals"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#signalsGradient)"
                />
                <Area
                  type="monotone"
                  dataKey="laces"
                  stroke="hsl(var(--secondary))"
                  strokeWidth={2}
                  fill="url(#lacesGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          
          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-muted-foreground">Signals</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-secondary" />
              <span className="text-muted-foreground">LACES Earned</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}