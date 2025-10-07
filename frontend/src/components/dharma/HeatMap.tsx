import * as React from "react"
import { motion } from "framer-motion"
import { LatLngExpression } from "leaflet"
import { cn } from "@/lib/utils"
import { BaseMap, MapBounds } from "@/components/map/BaseMap"
import { HeatMapOverlay, HeatMapData, HeatMapBin } from "@/components/map/HeatMapOverlay"
import { DropZoneLayer, DropZone } from "@/components/map/DropZoneLayer"

interface HeatMapProps {
  heatMapData?: HeatMapData
  dropZones?: DropZone[]
  center?: LatLngExpression
  zoom?: number
  timeWindow?: "1h" | "24h" | "7d"
  showDropZones?: boolean
  isLoading?: boolean
  onMapMove?: (center: LatLngExpression, zoom: number, bounds: MapBounds) => void
  onHeatTileClick?: (bin: HeatMapBin) => void
  onDropZoneClick?: (zone: DropZone) => void
  onDropZoneCheckIn?: (zoneId: string, lat: number, lng: number) => void
  onDropZoneJoin?: (zoneId: string) => void
  userLocation?: LatLngExpression
  enableGeolocation?: boolean
  className?: string
}

export function HeatMap({ 
  heatMapData,
  dropZones = [],
  center = [40.7589, -73.9851], // Default to NYC
  zoom = 12,
  timeWindow = "24h",
  showDropZones = true,
  isLoading = false,
  onMapMove,
  onHeatTileClick,
  onDropZoneClick,
  onDropZoneCheckIn,
  onDropZoneJoin,
  userLocation,
  enableGeolocation = false,
  className 
}: HeatMapProps) {
  const [currentZoom, setCurrentZoom] = React.useState(zoom)
  const [currentBounds, setCurrentBounds] = React.useState<MapBounds>({
    north: 0,
    south: 0,
    east: 0,
    west: 0
  })

  const handleMapMove = React.useCallback((
    newCenter: LatLngExpression,
    newZoom: number,
    bounds: MapBounds
  ) => {
    setCurrentZoom(newZoom)
    setCurrentBounds(bounds)
    onMapMove?.(newCenter, newZoom, bounds)
  }, [onMapMove])

  return (
    <div className={cn("relative w-full h-96 rounded-lg overflow-hidden bg-stone-900", className)}>
      <BaseMap
        center={center}
        zoom={zoom}
        onMapMove={handleMapMove}
        enableGeolocation={enableGeolocation}
        className="w-full h-full"
      >
        {/* Heat Map Overlay */}
        <HeatMapOverlay
          data={heatMapData}
          isLoading={isLoading}
          zoom={currentZoom}
          bounds={currentBounds}
          timeWindow={timeWindow}
          onTileClick={onHeatTileClick}
        />

        {/* Drop Zones Layer */}
        {showDropZones && (
          <DropZoneLayer
            zones={dropZones}
            userLocation={userLocation}
            onZoneClick={onDropZoneClick}
            onCheckIn={onDropZoneCheckIn}
            onJoinZone={onDropZoneJoin}
          />
        )}
      </BaseMap>

      {/* Loading overlay */}
      {isLoading && (
        <motion.div
          className="absolute inset-0 bg-black/50 flex items-center justify-center z-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="bg-stone-800/90 text-white px-4 py-3 rounded-lg flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-amber-400 border-t-transparent" />
            <span className="text-sm font-medium">Loading map data...</span>
          </div>
        </motion.div>
      )}
    </div>
  )
}

// Export types for external use
export type { HeatMapData, HeatMapBin, DropZone }

// Legacy interface for backward compatibility
export interface HeatZone {
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

// Mock data for demo/testing
export const mockHeatMapData: HeatMapData = {
  bins: [
    {
      geohash: "dr5regy",
      lat: 40.7234,
      lng: -74.0034,
      signal_count: 15,
      post_count: 8,
      boost_score: 450,
      top_brands: [{ brand: "Nike", count: 12 }, { brand: "Adidas", count: 8 }],
      top_tags: ["jordan", "dunk", "drop"],
      sample_posts: [
        {
          post_id: "1",
          content_text: "SoHo Nike has the new Jordan 4s in stock!",
          timestamp: new Date(Date.now() - 120000).toISOString(),
          boost_score: 45
        }
      ]
    },
    {
      geohash: "dr5regz",
      lat: 40.7359,
      lng: -73.9911,
      signal_count: 8,
      post_count: 12,
      boost_score: 320,
      top_brands: [{ brand: "Supreme", count: 7 }, { brand: "Nike", count: 5 }],
      top_tags: ["supreme", "box logo", "line"],
      sample_posts: [
        {
          post_id: "2",
          content_text: "Line forming at Union Square for Supreme drop",
          timestamp: new Date(Date.now() - 300000).toISOString(),
          boost_score: 38
        }
      ]
    }
  ],
  total_posts: 20,
  time_window: "24h"
}

export const mockDropZones: DropZone[] = [
  {
    id: "zone-1",
    name: "SoHo Sneaker Hunt",
    description: "Weekly sneaker hunting meetup in SoHo area",
    owner_id: "user-1",
    center_lat: 40.7234,
    center_lng: -74.0034,
    radius_meters: 200,
    status: "active",
    starts_at: new Date(Date.now() - 3600000).toISOString(),
    ends_at: new Date(Date.now() + 7200000).toISOString(),
    member_count: 47,
    check_in_count: 23,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    is_member: true,
    user_role: "member",
    distance_from_user: 300
  },
  {
    id: "zone-2", 
    name: "Brooklyn Hypebeast Meetup",
    description: "Monthly gathering for streetwear enthusiasts",
    owner_id: "user-2",
    center_lat: 40.7061,
    center_lng: -73.9969,
    radius_meters: 150,
    status: "scheduled",
    starts_at: new Date(Date.now() + 3600000).toISOString(),
    ends_at: new Date(Date.now() + 10800000).toISOString(),
    member_count: 32,
    check_in_count: 0,
    created_at: new Date(Date.now() - 172800000).toISOString(),
    is_member: false,
    distance_from_user: 1200
  }
]