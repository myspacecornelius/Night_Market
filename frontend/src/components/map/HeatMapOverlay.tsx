import * as React from "react"
import { Rectangle, Popup, useMap } from "react-leaflet"
import { LatLngBounds } from "leaflet"
import { motion } from "framer-motion"
import { Flame, Users, MapPin, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { MapBounds } from "./BaseMap"

export interface HeatMapBin {
  geohash: string
  lat: number
  lng: number
  signal_count: number
  post_count: number
  boost_score: number
  top_brands: Array<{ brand: string; count: number }>
  top_tags: string[]
  sample_posts: Array<{
    post_id: string
    content_text?: string
    media_url?: string
    timestamp: string
    boost_score: number
  }>
}

export interface HeatMapData {
  bins: HeatMapBin[]
  total_posts: number
  time_window: string
  bbox?: number[]
}

export interface HeatMapOverlayProps {
  data?: HeatMapData
  isLoading?: boolean
  zoom: number
  bounds: MapBounds
  timeWindow?: "1h" | "24h" | "7d"
  onTileClick?: (bin: HeatMapBin) => void
  showLabels?: boolean
  className?: string
}

// Calculate tile bounds from geohash center and zoom level
function getGeohashBounds(lat: number, lng: number, zoom: number): LatLngBounds {
  // Approximate tile size based on zoom level
  const size = 0.01 * Math.pow(2, 12 - zoom)
  return new LatLngBounds(
    [lat - size, lng - size],
    [lat + size, lng + size]
  )
}

// Get intensity color based on activity score
function getIntensityColor(signalCount: number, postCount: number, boostScore: number): string {
  const totalActivity = signalCount + postCount + (boostScore / 10)
  
  if (totalActivity >= 50) return "#dc2626" // red-600 - Very high activity
  if (totalActivity >= 25) return "#ea580c" // orange-600 - High activity  
  if (totalActivity >= 10) return "#d97706" // amber-600 - Medium activity
  if (totalActivity >= 5) return "#ca8a04" // yellow-600 - Low activity
  if (totalActivity >= 1) return "#65a30d" // lime-600 - Minimal activity
  return "#374151" // gray-700 - No activity
}

// Get opacity based on activity level
function getIntensityOpacity(signalCount: number, postCount: number): number {
  const totalActivity = signalCount + postCount
  
  if (totalActivity >= 50) return 0.8
  if (totalActivity >= 25) return 0.7
  if (totalActivity >= 10) return 0.6
  if (totalActivity >= 5) return 0.5
  if (totalActivity >= 1) return 0.4
  return 0.2
}

// Individual heat map tile component
function HeatTile({ 
  bin, 
  zoom, 
  onTileClick,
  showLabels = false 
}: { 
  bin: HeatMapBin
  zoom: number
  onTileClick?: (bin: HeatMapBin) => void
  showLabels?: boolean
}) {
  const bounds = getGeohashBounds(bin.lat, bin.lng, zoom)
  const color = getIntensityColor(bin.signal_count, bin.post_count, bin.boost_score)
  const opacity = getIntensityOpacity(bin.signal_count, bin.post_count)
  
  const totalActivity = bin.signal_count + bin.post_count
  
  if (totalActivity === 0) return null // Don't render empty tiles

  return (
    <Rectangle
      bounds={bounds}
      pathOptions={{
        fillColor: color,
        fillOpacity: opacity,
        color: color,
        weight: 1,
        opacity: 0.8
      }}
      eventHandlers={{
        click: () => onTileClick?.(bin)
      }}
    >
      <Popup className="heat-tile-popup">
        <div className="p-3 min-w-64">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <div 
              className="w-4 h-4 rounded-full" 
              style={{ backgroundColor: color }}
            />
            <span className="font-semibold text-stone-100">
              Activity Hotspot
            </span>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-amber-400" />
              <div>
                <div className="text-xs text-stone-400">Signals</div>
                <div className="font-semibold text-stone-100">{bin.signal_count}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Users size={16} className="text-green-400" />
              <div>
                <div className="text-xs text-stone-400">Posts</div>
                <div className="font-semibold text-stone-100">{bin.post_count}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Flame size={16} className="text-orange-400" />
              <div>
                <div className="text-xs text-stone-400">Heat Score</div>
                <div className="font-semibold text-stone-100">{bin.boost_score}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-blue-400" />
              <div>
                <div className="text-xs text-stone-400">Total</div>
                <div className="font-semibold text-stone-100">{totalActivity}</div>
              </div>
            </div>
          </div>
          
          {/* Top Brands */}
          {bin.top_brands && bin.top_brands.length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-stone-400 mb-1">Top Brands</div>
              <div className="flex flex-wrap gap-1">
                {bin.top_brands.slice(0, 3).map((brand) => (
                  <span 
                    key={brand.brand}
                    className="text-xs bg-amber-900/30 text-amber-200 px-2 py-1 rounded"
                  >
                    {brand.brand} ({brand.count})
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* Top Tags */}
          {bin.top_tags && bin.top_tags.length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-stone-400 mb-1">Popular Tags</div>
              <div className="flex flex-wrap gap-1">
                {bin.top_tags.slice(0, 4).map((tag) => (
                  <span 
                    key={tag}
                    className="text-xs bg-green-900/30 text-green-200 px-2 py-1 rounded"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* Sample Posts */}
          {bin.sample_posts && bin.sample_posts.length > 0 && (
            <div>
              <div className="text-xs text-stone-400 mb-2">Recent Activity</div>
              <div className="space-y-2">
                {bin.sample_posts.slice(0, 2).map((post) => (
                  <div 
                    key={post.post_id}
                    className="text-xs bg-stone-800/50 p-2 rounded border-l-2 border-amber-500"
                  >
                    {post.content_text && (
                      <div className="text-stone-200 mb-1">
                        {post.content_text}
                      </div>
                    )}
                    <div className="text-stone-400">
                      {new Date(post.timestamp).toLocaleString()} • {post.boost_score} boost
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Popup>
    </Rectangle>
  )
}

export function HeatMapOverlay({
  data,
  isLoading = false,
  zoom,
  bounds,
  timeWindow = "24h",
  onTileClick,
  showLabels = false,
  className
}: HeatMapOverlayProps) {
  if (isLoading) {
    return (
      <div className={cn("absolute inset-0 z-10 flex items-center justify-center", className)}>
        <motion.div
          className="bg-black/50 text-white px-4 py-2 rounded-lg flex items-center gap-2"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
        >
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-amber-400 border-t-transparent" />
          <span className="text-sm">Loading heat map...</span>
        </motion.div>
      </div>
    )
  }

  if (!data || !data.bins || data.bins.length === 0) {
    return null
  }

  return (
    <>
      {/* Render heat map tiles */}
      {data.bins.map((bin) => (
        <HeatTile
          key={bin.geohash}
          bin={bin}
          zoom={zoom}
          onTileClick={onTileClick}
          showLabels={showLabels}
        />
      ))}
      
      {/* Heat map legend */}
      <div className="absolute bottom-20 left-4 z-10 bg-black/80 text-white p-3 rounded-lg text-xs">
        <div className="font-semibold mb-2">Activity Heat Map</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-600" />
            <span>Very High (50+)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-600" />
            <span>High (25+)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-600" />
            <span>Medium (10+)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-600" />
            <span>Low (5+)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-lime-600" />
            <span>Minimal (1+)</span>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-stone-600">
          <span className="text-stone-400">Window: {timeWindow}</span>
        </div>
      </div>
    </>
  )
}