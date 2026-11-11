import { memo, useMemo } from "react"
import { Rectangle, Popup } from "react-leaflet"
import type { LatLngBoundsLiteral } from "leaflet"
import { Flame, Users } from "lucide-react"
import type { HeatmapBin } from "@/lib/api/heatmap"

export interface HeatMapOverlayProps {
  bins: HeatmapBin[]
  /** Post count of the busiest bin; tile colors are relative to it. */
  maxPostCount: number
  selectedGeohash?: string | null
  onTileClick?: (bin: HeatmapBin) => void
}

/** Tile colors from the quietest to the busiest fifth of the scale. */
export const HEAT_COLORS = [
  "#65a30d", // lime-600
  "#ca8a04", // yellow-600
  "#d97706", // amber-600
  "#ea580c", // orange-600
  "#dc2626" // red-600
] as const

const HEAT_OPACITIES = [0.4, 0.5, 0.6, 0.7, 0.8] as const

/** Index into HEAT_COLORS for a bin, relative to the busiest bin on the map. */
export function heatLevel(postCount: number, maxPostCount: number): number {
  if (maxPostCount <= 0) return 0
  const share = postCount / maxPostCount
  if (share > 0.8) return 4
  if (share > 0.6) return 3
  if (share > 0.4) return 2
  if (share > 0.2) return 1
  return 0
}

const GEOHASH_ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz"

/**
 * The exact cell a geohash names, as [[south, west], [north, east]].
 * Returns null for a string that is not a geohash.
 */
export function geohashBounds(geohash: string): LatLngBoundsLiteral | null {
  if (!geohash) return null

  let south = -90
  let north = 90
  let west = -180
  let east = 180
  let isLongitude = true // bits alternate, starting with longitude

  for (const character of geohash.toLowerCase()) {
    const value = GEOHASH_ALPHABET.indexOf(character)
    if (value === -1) return null

    for (let bit = 4; bit >= 0; bit--) {
      const upperHalf = ((value >> bit) & 1) === 1
      if (isLongitude) {
        const middle = (west + east) / 2
        if (upperHalf) west = middle
        else east = middle
      } else {
        const middle = (south + north) / 2
        if (upperHalf) south = middle
        else north = middle
      }
      isLongitude = !isLongitude
    }
  }

  return [[south, west], [north, east]]
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`

// Individual heat map tile component. A result can hold thousands of bins, and Leaflet redraws
// a rectangle whenever it is handed new bounds, style or handlers, so a tile only renders again
// when something about it changed and keeps those three objects the same until then.
const HeatTile = memo(function HeatTile({
  bin,
  maxPostCount,
  selected,
  onTileClick,
}: {
  bin: HeatmapBin
  maxPostCount: number
  selected: boolean
  onTileClick?: (bin: HeatmapBin) => void
}) {
  const bounds = useMemo(() => geohashBounds(bin.geohash), [bin.geohash])

  const level = heatLevel(bin.post_count, maxPostCount)
  const color = HEAT_COLORS[level]

  const pathOptions = useMemo(
    () => ({
      fillColor: color,
      fillOpacity: HEAT_OPACITIES[level],
      color: selected ? "#fafaf9" : color,
      weight: selected ? 3 : 1,
      opacity: selected ? 1 : 0.8
    }),
    [color, level, selected]
  )

  const eventHandlers = useMemo(
    () => ({ click: () => onTileClick?.(bin) }),
    [bin, onTileClick]
  )

  if (!bounds) return null

  return (
    <Rectangle
      bounds={bounds}
      pathOptions={pathOptions}
      eventHandlers={eventHandlers}
    >
      <Popup className="heat-tile-popup">
        <div className="p-3 min-w-56">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="font-semibold text-stone-100">
              Activity hotspot
            </span>
            <span className="font-mono text-xs text-stone-400">{bin.geohash}</span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-green-400" aria-hidden="true" />
              <div className="font-semibold text-stone-100">{plural(bin.post_count, "post")}</div>
            </div>
            <div className="flex items-center gap-2">
              <Flame size={16} className="text-orange-400" aria-hidden="true" />
              <div className="font-semibold text-stone-100">{bin.boost_score} boost</div>
            </div>
          </div>

          {/* Top Tags */}
          {bin.top_tags.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-stone-400 mb-1">Popular tags</div>
              <div className="flex flex-wrap gap-1">
                {bin.top_tags.map((tag) => (
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
        </div>
      </Popup>
    </Rectangle>
  )
})

/** One rectangle per geohash bin, drawn over the exact cell the bin covers. */
export function HeatMapOverlay({
  bins,
  maxPostCount,
  selectedGeohash,
  onTileClick
}: HeatMapOverlayProps) {
  return (
    <>
      {bins.map((bin) => (
        <HeatTile
          key={bin.geohash}
          bin={bin}
          maxPostCount={maxPostCount}
          selected={bin.geohash === selectedGeohash}
          onTileClick={onTileClick}
        />
      ))}
    </>
  )
}
