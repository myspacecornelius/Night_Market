import * as React from "react"
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet"
import { LatLngExpression, Map as LeafletMap } from "leaflet"
import { cn } from "@/lib/utils"
import "leaflet/dist/leaflet.css"

// Custom dark earthy theme for map tiles
const DARK_EARTHY_TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
const DARK_EARTHY_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

export interface MapBounds {
  north: number
  south: number
  east: number
  west: number
}

export interface BaseMapProps {
  center?: LatLngExpression
  zoom?: number
  className?: string
  onMapMove?: (center: LatLngExpression, zoom: number, bounds: MapBounds) => void
  onMapReady?: (map: LeafletMap) => void
  children?: React.ReactNode
  enableGeolocation?: boolean
}

// Component to handle map events
function MapEventHandler({ 
  onMapMove, 
  onMapReady 
}: { 
  onMapMove?: BaseMapProps['onMapMove']
  onMapReady?: BaseMapProps['onMapReady']
}) {
  const map = useMap()

  React.useEffect(() => {
    if (onMapReady) {
      onMapReady(map)
    }
  }, [map, onMapReady])

  useMapEvents({
    moveend: () => {
      if (onMapMove) {
        const center = map.getCenter()
        const zoom = map.getZoom()
        const bounds = map.getBounds()
        
        const mapBounds: MapBounds = {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        }
        
        onMapMove([center.lat, center.lng], zoom, mapBounds)
      }
    },
    zoomend: () => {
      if (onMapMove) {
        const center = map.getCenter()
        const zoom = map.getZoom()
        const bounds = map.getBounds()
        
        const mapBounds: MapBounds = {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        }
        
        onMapMove([center.lat, center.lng], zoom, mapBounds)
      }
    }
  })

  return null
}

// Component to handle geolocation
function GeolocationHandler({ enabled }: { enabled: boolean }) {
  const map = useMap()

  React.useEffect(() => {
    if (!enabled) return

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          map.setView([latitude, longitude], 13)
        },
        (error) => {
          console.warn("Geolocation error:", error.message)
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        }
      )
    }
  }, [enabled, map])

  return null
}

export function BaseMap({
  center = [40.7589, -73.9851], // Default to NYC
  zoom = 12,
  className,
  onMapMove,
  onMapReady,
  children,
  enableGeolocation = false
}: BaseMapProps) {
  return (
    <div className={cn("relative w-full h-full", className)}>
      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full z-0"
        zoomControl={false} // We'll add custom controls
        attributionControl={false} // We'll add custom attribution
      >
        {/* Dark earthy theme tile layer */}
        <TileLayer
          url={DARK_EARTHY_TILE_URL}
          attribution={DARK_EARTHY_ATTRIBUTION}
          className="map-tiles"
        />
        
        {/* Event handlers */}
        <MapEventHandler onMapMove={onMapMove} onMapReady={onMapReady} />
        <GeolocationHandler enabled={enableGeolocation} />
        
        {/* Child components (overlays, markers, etc.) */}
        {children}
      </MapContainer>
      
      {/* Custom map controls overlay */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        {/* Zoom controls will be added here */}
      </div>
      
      {/* Custom attribution */}
      <div className="absolute bottom-2 right-2 z-10 text-xs text-stone-400 bg-black/50 px-2 py-1 rounded">
        © OpenStreetMap contributors
      </div>
      
      {/* Dark overlay for earthy theme enhancement */}
      <style>{`
        .leaflet-container {
          background: #1a1611 !important;
          font-family: inherit;
        }
        
        .leaflet-tile {
          filter: brightness(0.8) contrast(1.1) sepia(0.15) hue-rotate(15deg) !important;
        }
        
        .leaflet-control-container {
          display: none !important;
        }
        
        .leaflet-popup-content-wrapper {
          background: #2d2520 !important;
          color: #e7e5e4 !important;
          border-radius: 8px !important;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
        }
        
        .leaflet-popup-tip {
          background: #2d2520 !important;
        }
        
        .leaflet-popup-close-button {
          color: #a8a29e !important;
        }
        
        .leaflet-popup-close-button:hover {
          color: #fbbf24 !important;
        }
      `}</style>
    </div>
  )
}
