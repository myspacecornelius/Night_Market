import * as React from "react"
import { motion } from "framer-motion"
import { MapPin, Flame, Clock, Users, Filter, Zap, Navigation, CheckCircle, Timer } from "lucide-react"
import { HeatMap, mockHeatMapData, mockDropZones, HeatMapBin, DropZone } from "@/components/dharma/HeatMap"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/Button"
import { LacesDisplay } from "@/components/dharma/LacesDisplay"
import { cn } from "@/lib/utils"
import { LatLngExpression } from "leaflet"
import { MapBounds } from "@/components/map/BaseMap"

interface QuickStat {
  label: string
  value: string
  change?: string
  trend?: "up" | "down" | "neutral"
}

const quickStats: QuickStat[] = [
  { label: "Active Zones", value: "12", change: "+3", trend: "up" },
  { label: "Live Drops", value: "4", change: "2 new", trend: "up" },
  { label: "Heat Level", value: "87%", change: "+12%", trend: "up" },
  { label: "Nearby", value: "0.3mi", trend: "neutral" }
]

const recentActivity = [
  {
    id: "1",
    type: "drop" as const,
    title: "Jordan 4 Black Cat spotted",
    location: "SoHo Nike",
    time: "2m ago",
    intensity: 95,
    participants: 47
  },
  {
    id: "2", 
    type: "restock" as const,
    title: "Dunk Low restock confirmed",
    location: "Union Square",
    time: "8m ago",
    intensity: 72,
    participants: 23
  },
  {
    id: "3",
    type: "line" as const,
    title: "Long line forming",
    location: "Brooklyn Bridge",
    time: "15m ago", 
    intensity: 45,
    participants: 12
  }
]

export default function Heatmap() {
  const [selectedFilter, setSelectedFilter] = React.useState<string>("all")
  const [timeWindow, setTimeWindow] = React.useState<"1h" | "24h" | "7d">("24h")
  const [mapCenter, setMapCenter] = React.useState<LatLngExpression>([40.7589, -73.9851])
  const [mapZoom, setMapZoom] = React.useState(13)
  const [isLoading, setIsLoading] = React.useState(false)
  const [selectedHeatTile, setSelectedHeatTile] = React.useState<HeatMapBin | null>(null)
  const [selectedDropZone, setSelectedDropZone] = React.useState<DropZone | null>(null)
  
  const filters = [
    { id: "all", label: "All Activity", icon: Zap },
    { id: "drops", label: "Drops", icon: Flame },
    { id: "restocks", label: "Restocks", icon: Users },
    { id: "lines", label: "Lines", icon: Clock }
  ]

  const timeFilters = [
    { id: "1h" as const, label: "1 Hour", icon: Timer },
    { id: "24h" as const, label: "24 Hours", icon: Clock },
    { id: "7d" as const, label: "7 Days", icon: Clock }
  ]
  
  // Handler functions for map interactions
  const handleMapMove = React.useCallback((center: LatLngExpression, zoom: number, bounds: MapBounds) => {
    setMapCenter(center)
    setMapZoom(zoom)
    // In Phase B, this will trigger new data fetching based on bounds
    console.log("Map moved:", { center, zoom, bounds })
  }, [])

  const handleHeatTileClick = React.useCallback((bin: HeatMapBin) => {
    setSelectedHeatTile(bin)
    console.log("Heat tile clicked:", bin)
  }, [])

  const handleDropZoneClick = React.useCallback((zone: DropZone) => {
    setSelectedDropZone(zone)
    console.log("Drop zone clicked:", zone)
  }, [])

  const handleDropZoneCheckIn = React.useCallback((zoneId: string, lat: number, lng: number) => {
    console.log("Check-in requested:", { zoneId, lat, lng })
    // Simulate check-in process
    setIsLoading(true)
    setTimeout(() => {
      setIsLoading(false)
      // In Phase B, this will be a real API call
      alert(`Successfully checked into zone ${zoneId}!`)
    }, 2000)
  }, [])

  const handleDropZoneJoin = React.useCallback((zoneId: string) => {
    console.log("Join zone requested:", zoneId)
    // In Phase B, this will be a real API call
    alert(`Joined zone ${zoneId}!`)
  }, [])

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "drop": return <Flame size={16} className="text-heat" />
      case "restock": return <Users size={16} className="text-neon" />
      case "line": return <Clock size={16} className="text-steel" />
      default: return <MapPin size={16} />
    }
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h1 className="font-grotesk text-3xl font-bold tracking-tight">
            Heat Map
          </h1>
          <p className="text-muted-foreground mt-1">
            Live sneaker activity in your area
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <LacesDisplay amount={1247} size="sm" />
          <Button variant="outline" size="sm">
            <Filter size={16} />
            Filters
          </Button>
        </div>
      </motion.div>

      {/* Quick Stats */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        {quickStats.map((stat, index) => (
          <Card key={stat.label} className="p-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground font-medium">
                {stat.label}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-grotesk font-bold">
                  {stat.value}
                </span>
                {stat.change && (
                  <span className={cn(
                    "text-xs font-medium",
                    stat.trend === "up" && "text-neon",
                    stat.trend === "down" && "text-heat",
                    stat.trend === "neutral" && "text-muted-foreground"
                  )}>
                    {stat.change}
                  </span>
                )}
              </div>
            </div>
          </Card>
        ))}
      </motion.div>

      {/* Filter Tabs */}
      <motion.div
        className="space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        {/* Activity Type Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {filters.map((filter) => (
            <Button
              key={filter.id}
              variant={selectedFilter === filter.id ? "default" : "ghost"}
              size="sm"
              onClick={() => setSelectedFilter(filter.id)}
              className="flex items-center gap-2 whitespace-nowrap"
            >
              <filter.icon size={16} />
              {filter.label}
            </Button>
          ))}
        </div>

        {/* Time Window Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          <span className="text-sm text-muted-foreground flex items-center mr-2">
            Time Window:
          </span>
          {timeFilters.map((filter) => (
            <Button
              key={filter.id}
              variant={timeWindow === filter.id ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeWindow(filter.id)}
              className="flex items-center gap-2 whitespace-nowrap"
            >
              <filter.icon size={14} />
              {filter.label}
            </Button>
          ))}
        </div>
      </motion.div>

      {/* Main Heat Map */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        <Card className="overflow-hidden">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <MapPin size={20} />
              Live Heat Zones
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <HeatMap 
              heatMapData={mockHeatMapData}
              dropZones={mockDropZones}
              center={mapCenter}
              zoom={mapZoom}
              timeWindow={timeWindow}
              showDropZones={true}
              isLoading={isLoading}
              enableGeolocation={true}
              onMapMove={handleMapMove}
              onHeatTileClick={handleHeatTileClick}
              onDropZoneClick={handleDropZoneClick}
              onDropZoneCheckIn={handleDropZoneCheckIn}
              onDropZoneJoin={handleDropZoneJoin}
              className="h-[500px]"
            />
          </CardContent>
        </Card>
      </motion.div>

      {/* Selected Map Data */}
      {(selectedHeatTile || selectedDropZone) && (
        <motion.div
          className="grid md:grid-cols-2 gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.35 }}
        >
          {/* Selected Heat Tile Details */}
          {selectedHeatTile && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flame size={20} className="text-orange-500" />
                  Heat Tile Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-accent/50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-500">{selectedHeatTile.signal_count}</div>
                    <div className="text-sm text-muted-foreground">Signals</div>
                  </div>
                  <div className="text-center p-3 bg-accent/50 rounded-lg">
                    <div className="text-2xl font-bold text-green-500">{selectedHeatTile.post_count}</div>
                    <div className="text-sm text-muted-foreground">Posts</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Top Brands:</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedHeatTile.top_brands.map((brand) => (
                      <span key={brand.brand} className="px-2 py-1 bg-amber-900/30 text-amber-200 rounded text-xs">
                        {brand.brand} ({brand.count})
                      </span>
                    ))}
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSelectedHeatTile(null)}
                  className="w-full"
                >
                  Close Details
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Selected Drop Zone Details */}
          {selectedDropZone && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin size={20} className="text-emerald-500" />
                  {selectedDropZone.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{selectedDropZone.description}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-accent/50 rounded-lg">
                    <div className="text-2xl font-bold text-emerald-500">{selectedDropZone.member_count}</div>
                    <div className="text-sm text-muted-foreground">Members</div>
                  </div>
                  <div className="text-center p-3 bg-accent/50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-500">{selectedDropZone.check_in_count}</div>
                    <div className="text-sm text-muted-foreground">Check-ins</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className={cn(
                    "w-3 h-3 rounded-full",
                    selectedDropZone.status === "active" ? "bg-emerald-500" :
                    selectedDropZone.status === "scheduled" ? "bg-yellow-500" : "bg-gray-500"
                  )} />
                  <span className="capitalize">{selectedDropZone.status}</span>
                  {selectedDropZone.distance_from_user && (
                    <>
                      <span>•</span>
                      <span>{selectedDropZone.distance_from_user}m away</span>
                    </>
                  )}
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSelectedDropZone(null)}
                  className="w-full"
                >
                  Close Details
                </Button>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      {/* Recent Activity Feed */}
      <motion.div
        className="grid md:grid-cols-2 gap-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
      >
        {/* Activity List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap size={20} />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentActivity.map((activity, index) => (
              <motion.div
                key={activity.id}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="flex-shrink-0 mt-1">
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">
                    {activity.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <MapPin size={12} />
                    <span>{activity.location}</span>
                    <span>•</span>
                    <span>{activity.time}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        activity.intensity >= 80 ? "bg-heat" :
                        activity.intensity >= 60 ? "bg-orange-500" :
                        activity.intensity >= 40 ? "bg-yellow-500" :
                        "bg-neon"
                      )} />
                      <span className="text-xs text-muted-foreground">
                        {activity.intensity}% heat
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users size={12} />
                      <span>{activity.participants}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
            
            <Button variant="ghost" className="w-full mt-4">
              View All Activity
            </Button>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="heat" className="w-full justify-start" size="lg">
              <Flame size={18} />
              Report Drop
            </Button>
            <Button variant="outline" className="w-full justify-start" size="lg">
              <Users size={18} />
              Share Signal
            </Button>
            <Button variant="outline" className="w-full justify-start" size="lg">
              <MapPin size={18} />
              Set Location
            </Button>
            <Button variant="ghost" className="w-full justify-start" size="lg">
              <Clock size={18} />
              View History
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
