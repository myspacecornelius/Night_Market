import { motion } from "framer-motion"
import { Rectangle } from "react-leaflet"
import type { Map as LeafletMap } from "leaflet"
import { cn } from "@/lib/utils"
import { BaseMap, type MapFocus } from "@/components/map/BaseMap"
import { HeatMapOverlay, HEAT_COLORS } from "@/components/map/HeatMapOverlay"
import { DropZoneLayer } from "@/components/map/DropZoneLayer"
import type { HeatmapBBox, HeatmapBin, HeatmapDropZone } from "@/lib/api/heatmap"

interface HeatMapProps {
  /** The bins to draw, one tile each. */
  bins: HeatmapBin[]
  /** Post count of the busiest bin of the whole result; tile colors are relative to it. */
  maxPostCount: number
  dropZones?: HeatmapDropZone[]
  /** The area the bins were searched in, outlined on the map; null or omitted for the whole world. */
  searchArea?: HeatmapBBox | null
  selectedGeohash?: string | null
  /** Where to move the map to. */
  focus?: MapFocus | null
  isLoading?: boolean
  onMapReady?: (map: LeafletMap) => void
  onBinSelect?: (bin: HeatmapBin) => void
  className?: string
}

/** The activity map: heat tiles, optional drop zones, a legend and a loading indicator. */
export function HeatMap({
  bins,
  maxPostCount,
  dropZones = [],
  searchArea,
  selectedGeohash,
  focus,
  isLoading = false,
  onMapReady,
  onBinSelect,
  className
}: HeatMapProps) {
  return (
    <div
      role="region"
      aria-label="Activity map"
      className={cn("relative w-full h-96 rounded-lg overflow-hidden bg-stone-900", className)}
    >
      <BaseMap
        focus={focus}
        onMapReady={onMapReady}
        className="w-full h-full"
      >
        {/* Outline of the searched area */}
        {searchArea && (
          <Rectangle
            bounds={[[searchArea[1], searchArea[0]], [searchArea[3], searchArea[2]]]}
            pathOptions={{ color: "#fbbf24", weight: 1, dashArray: "6 6", fill: false }}
            interactive={false}
          />
        )}

        {/* Heat Map Overlay */}
        <HeatMapOverlay
          bins={bins}
          maxPostCount={maxPostCount}
          selectedGeohash={selectedGeohash}
          onTileClick={onBinSelect}
        />

        {/* Drop Zones Layer */}
        <DropZoneLayer zones={dropZones} />
      </BaseMap>

      {/* Legend: colors are relative to the busiest area in the result */}
      {maxPostCount > 0 && (
        <div className="absolute bottom-2 left-2 z-10 bg-black/80 text-white p-3 rounded-lg text-xs">
          <div className="font-semibold mb-2">Posts per area</div>
          <div className="flex items-center gap-2">
            <span className="text-stone-300">Fewer</span>
            <div className="flex gap-1" aria-hidden="true">
              {HEAT_COLORS.map((color) => (
                <div key={color} className="w-4 h-3 rounded-sm" style={{ backgroundColor: color }} />
              ))}
            </div>
            <span className="text-stone-300">More</span>
          </div>
          <div className="mt-2 text-stone-400">Busiest area: {maxPostCount}</div>
        </div>
      )}

      {/* Loading indicator; the map stays usable underneath */}
      {isLoading && (
        <motion.div
          role="status"
          className="pointer-events-none absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-stone-800/90 px-4 py-2 text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-amber-400 border-t-transparent" />
          <span className="text-sm font-medium">Loading map data...</span>
        </motion.div>
      )}
    </div>
  )
}
