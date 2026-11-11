import * as React from "react"
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet"
import type { LatLngExpression, Map as LeafletMap } from "leaflet"
import { Minus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import "leaflet/dist/leaflet.css"

// Custom dark earthy theme for map tiles
const DARK_EARTHY_TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
const DARK_EARTHY_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

// A whole-world view, used until the caller knows where to look.
const WORLD_CENTER: LatLngExpression = [20, 0]
const WORLD_ZOOM = 2
const MIN_ZOOM = 2
const MAX_ZOOM = 20

export interface MapBounds {
  north: number
  south: number
  east: number
  west: number
}

/** A place to move the map to. Change `key` to move again, even to the same place. */
export interface MapFocus {
  lat: number
  lng: number
  zoom: number
  key: number
}

export interface BaseMapProps {
  /** Where the map opens. Later changes are ignored; use `focus` to move the map. */
  center?: LatLngExpression
  zoom?: number
  focus?: MapFocus | null
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
  onMapReady: (map: LeafletMap) => void
}) {
  const map = useMap()

  React.useEffect(() => {
    onMapReady(map)
  }, [map, onMapReady])

  const reportView = () => {
    if (!onMapMove) return
    const center = map.getCenter()
    const bounds = map.getBounds()

    onMapMove([center.lat, center.lng], map.getZoom(), {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    })
  }

  // Leaflet fires moveend after every pan and every zoom
  useMapEvents({ moveend: reportView })

  return null
}

// Moves the map whenever a new focus is handed in
function FocusHandler({ focus }: { focus?: MapFocus | null }) {
  const map = useMap()
  const lat = focus?.lat
  const lng = focus?.lng
  const zoom = focus?.zoom
  const key = focus?.key

  React.useEffect(() => {
    if (lat === undefined || lng === undefined || zoom === undefined) return
    // Not animated: Leaflet silently drops a setView that arrives while one of its
    // zoom animations is running, so two quick moves in a row would lose the second.
    map.setView([lat, lng], zoom, { animate: false })
  }, [map, lat, lng, zoom, key])

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

const zoomButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-md border border-stone-600 bg-stone-900/90 text-stone-100 shadow hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50"

export function BaseMap({
  center = WORLD_CENTER,
  zoom = WORLD_ZOOM,
  focus,
  className,
  onMapMove,
  onMapReady,
  children,
  enableGeolocation = false
}: BaseMapProps) {
  // Leaflet's own controls are hidden (see the styles below), so the zoom buttons
  // rendered next to the map need the map instance.
  const [map, setMap] = React.useState<LeafletMap | null>(null)

  const handleMapReady = React.useCallback((readyMap: LeafletMap) => {
    setMap(readyMap)
    onMapReady?.(readyMap)
  }, [onMapReady])

  return (
    <div className={cn("relative w-full h-full", className)}>
      <MapContainer
        center={center}
        zoom={zoom}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        worldCopyJump
        className="w-full h-full z-0"
        zoomControl={false} // Replaced by the buttons below
        attributionControl={false} // Replaced by the attribution below
      >
        {/* Dark earthy theme tile layer */}
        <TileLayer
          url={DARK_EARTHY_TILE_URL}
          attribution={DARK_EARTHY_ATTRIBUTION}
          maxZoom={MAX_ZOOM}
          className="map-tiles"
        />

        {/* Event handlers */}
        <MapEventHandler onMapMove={onMapMove} onMapReady={handleMapReady} />
        <FocusHandler focus={focus} />
        <GeolocationHandler enabled={enableGeolocation} />

        {/* Child components (overlays, markers, etc.) */}
        {children}
      </MapContainer>

      {/* Custom map controls overlay */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <button
          type="button"
          className={zoomButtonClass}
          aria-label="Zoom map in"
          disabled={!map}
          onClick={() => map?.zoomIn()}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={zoomButtonClass}
          aria-label="Zoom map out"
          disabled={!map}
          onClick={() => map?.zoomOut()}
        >
          <Minus size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Custom attribution */}
      <div className="absolute bottom-2 right-2 z-10 text-xs text-stone-400 bg-black/50 px-2 py-1 rounded">
        ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
          OpenStreetMap
        </a>{" "}
        contributors ©{" "}
        <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer" className="underline">
          CARTO
        </a>
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
