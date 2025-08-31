import * as React from "react"
import { motion } from "framer-motion"
import { MapPin, Flame, Users, Clock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface HeatZone {
  id: string
  name: string
  lat: number
  lng: number
  intensity: number // 0-100
  activity: "drop" | "restock" | "line" | "general"
  lastUpdate: string
  participants: number
  distance?: string
}

interface HeatMapProps {
  zones: HeatZone[]
  onZoneClick?: (zone: HeatZone) => void
  className?: string
}

export function HeatMap({ zones, onZoneClick, className }: HeatMapProps) {
  const [selectedZone, setSelectedZone] = React.useState<HeatZone | null>(null)
  
  const getIntensityColor = (intensity: number) => {
    if (intensity >= 80) return "bg-heat shadow-heat"
    if (intensity >= 60) return "bg-orange-500 shadow-orange-500/30"
    if (intensity >= 40) return "bg-yellow-500 shadow-yellow-500/30"
    if (intensity >= 20) return "bg-neon shadow-neon"
    return "bg-steel shadow-steel/30"
  }
  
  const getActivityIcon = (activity: HeatZone["activity"]) => {
    switch (activity) {
      case "drop": return <Flame size={16} />
      case "restock": return <Users size={16} />
      case "line": return <Clock size={16} />
      default: return <MapPin size={16} />
    }
  }
  
  return (
    <div className={cn("relative w-full h-96 bg-muted rounded-lg overflow-hidden", className)}>
      {/* Map Background - Placeholder for actual map integration */}
      <div className="absolute inset-0 bg-gradient-to-br from-ink/5 to-steel/10" />
      
      {/* Heat Zones */}
      <div className="absolute inset-0 p-4">
        {zones.map((zone, index) => (
          <motion.div
            key={zone.id}
            className="absolute"
            style={{
              left: `${(zone.lng + 180) / 360 * 100}%`,
              top: `${(90 - zone.lat) / 180 * 100}%`,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: index * 0.1 }}
          >
            <motion.button
              className={cn(
                "relative w-8 h-8 rounded-full border-2 border-background",
                "flex items-center justify-center text-white",
                "hover:scale-110 active:scale-95 transition-all duration-150",
                getIntensityColor(zone.intensity)
              )}
              onClick={() => {
                setSelectedZone(zone)
                onZoneClick?.(zone)
              }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              {getActivityIcon(zone.activity)}
              
              {/* Pulse animation for high intensity */}
              {zone.intensity >= 80 && (
                <motion.div
                  className="absolute inset-0 rounded-full bg-heat"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
            </motion.button>
            
            {/* Zone label */}
            <div className="absolute top-10 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
              <div className="bg-background/90 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium">
                {zone.name}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      
      {/* Zone Detail Sheet */}
      {selectedZone && (
        <motion.div
          className="absolute bottom-0 left-0 right-0"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
        >
          <Card className="rounded-t-xl rounded-b-none border-t border-x-0 border-b-0">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-grotesk font-semibold text-lg">
                    {selectedZone.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedZone.distance && `${selectedZone.distance} away • `}
                    {selectedZone.participants} active
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedZone(null)}
                >
                  ×
                </Button>
              </div>
              
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <div className={cn("w-3 h-3 rounded-full", getIntensityColor(selectedZone.intensity))} />
                  <span className="text-sm font-medium">
                    {selectedZone.intensity}% heat
                  </span>
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock size={14} />
                  {selectedZone.lastUpdate}
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button size="sm" variant="heat" className="flex-1">
                  Track Zone
                </Button>
                <Button size="sm" variant="outline">
                  Share Signal
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
      
      {/* Heat Legend */}
      <div className="absolute top-4 right-4">
        <Card className="p-3">
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Heat Level
            </div>
            {[
              { range: "80-100%", color: "bg-heat", label: "Blazing" },
              { range: "60-79%", color: "bg-orange-500", label: "Hot" },
              { range: "40-59%", color: "bg-yellow-500", label: "Warm" },
              { range: "20-39%", color: "bg-neon", label: "Cool" },
              { range: "0-19%", color: "bg-steel", label: "Cold" },
            ].map((level) => (
              <div key={level.range} className="flex items-center gap-2 text-xs">
                <div className={cn("w-2 h-2 rounded-full", level.color)} />
                <span className="text-muted-foreground">{level.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

// Mock data for demo
export const mockHeatZones: HeatZone[] = [
  {
    id: "1",
    name: "SoHo Nike",
    lat: 40.7234,
    lng: -74.0034,
    intensity: 95,
    activity: "drop",
    lastUpdate: "2m ago",
    participants: 47,
    distance: "0.3 mi"
  },
  {
    id: "2", 
    name: "Union Square",
    lat: 40.7359,
    lng: -73.9911,
    intensity: 72,
    activity: "line",
    lastUpdate: "5m ago", 
    participants: 23,
    distance: "0.8 mi"
  },
  {
    id: "3",
    name: "Brooklyn Bridge",
    lat: 40.7061,
    lng: -73.9969,
    intensity: 45,
    activity: "restock",
    lastUpdate: "12m ago",
    participants: 12,
    distance: "1.2 mi"
  }
]
