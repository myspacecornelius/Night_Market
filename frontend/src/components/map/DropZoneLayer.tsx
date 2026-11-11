import { memo } from "react"
import { Circle, Marker, Popup } from "react-leaflet"
import { type DivIcon, divIcon } from "leaflet"
import { Link } from "react-router-dom"
import {
  MapPin,
  Users,
  Clock,
  Shield,
  CheckCircle,
  Timer
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { HeatmapDropZone, HeatmapDropZoneStatus } from "@/lib/api/heatmap"

export interface DropZoneLayerProps {
  zones: HeatmapDropZone[]
}

const STATUS_COLORS: Record<HeatmapDropZoneStatus, string> = {
  scheduled: "#6b7280", // gray-500
  active: "#10b981", // emerald-500
  ended: "#ef4444", // red-500
  cancelled: "#f59e0b" // amber-500
}

// Create custom icon for drop zone markers
function createDropZoneIcon(status: HeatmapDropZoneStatus, size: number = 32): DivIcon {
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.scheduled

  const iconHtml = `
    <div style="
      width: ${size}px;
      height: ${size}px;
      background: linear-gradient(135deg, ${statusColor}CC, ${statusColor}88);
      border: 2px solid ${statusColor};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      backdrop-filter: blur(4px);
    ">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    </div>
  `

  return divIcon({
    html: iconHtml,
    className: 'drop-zone-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  })
}

// One icon per status, so re-rendering the layer does not replace every marker's icon
const iconCache = new Map<HeatmapDropZoneStatus, DivIcon>()

function getDropZoneIcon(status: HeatmapDropZoneStatus): DivIcon {
  let icon = iconCache.get(status)
  if (!icon) {
    icon = createDropZoneIcon(status)
    iconCache.set(status, icon)
  }
  return icon
}

// Get zone status details
function getZoneStatusInfo(zone: HeatmapDropZone) {
  const startsAt = zone.starts_at ? new Date(zone.starts_at) : null
  const endsAt = zone.ends_at ? new Date(zone.ends_at) : null

  switch (zone.status) {
    case "scheduled":
      return {
        icon: Timer,
        label: "Scheduled",
        color: "text-gray-400",
        timeInfo: startsAt ? `Starts ${startsAt.toLocaleString()}` : "No start time set"
      }
    case "active":
      return {
        icon: CheckCircle,
        label: "Active now",
        color: "text-emerald-400",
        timeInfo: endsAt ? `Ends ${endsAt.toLocaleString()}` : "No end time set"
      }
    case "ended":
      return {
        icon: Clock,
        label: "Ended",
        color: "text-red-400",
        timeInfo: endsAt ? `Ended ${endsAt.toLocaleString()}` : "No end time set"
      }
    case "cancelled":
      return {
        icon: Shield,
        label: "Cancelled",
        color: "text-amber-400",
        timeInfo: "Event cancelled"
      }
    default:
      return {
        icon: MapPin,
        label: "Unknown",
        color: "text-gray-400",
        timeInfo: ""
      }
  }
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`

// Individual drop zone component. Only rendered again when its zone changed: a new position
// or style object makes Leaflet move and redraw the layer even when the values are the same.
const DropZoneMarker = memo(function DropZoneMarker({ zone }: { zone: HeatmapDropZone }) {
  const statusInfo = getZoneStatusInfo(zone)
  const StatusIcon = statusInfo.icon
  const isActive = zone.status === "active"

  return (
    <>
      {/* Zone boundary circle; not interactive, so clicks reach the heat tiles under it */}
      <Circle
        center={[zone.center_lat, zone.center_lng]}
        radius={zone.radius_meters}
        interactive={false}
        pathOptions={{
          fillColor: isActive ? "#10b981" : "#6b7280",
          fillOpacity: 0.1,
          color: isActive ? "#10b981" : "#6b7280",
          weight: 2,
          opacity: 0.6,
          dashArray: zone.status === "scheduled" ? "5, 5" : undefined
        }}
      />

      {/* Zone marker */}
      <Marker
        position={[zone.center_lat, zone.center_lng]}
        icon={getDropZoneIcon(zone.status)}
        title={`Drop zone: ${zone.name}`}
      >
        <Popup className="drop-zone-popup" maxWidth={320}>
          <div className="p-4 min-w-64">
            {/* Header */}
            <div className="mb-3">
              <h3 className="font-bold text-lg text-stone-100">{zone.name}</h3>
              <div className="flex items-center gap-2">
                <StatusIcon size={14} className={statusInfo.color} aria-hidden="true" />
                <span className={cn("text-sm", statusInfo.color)}>
                  {statusInfo.label}
                </span>
              </div>
            </div>

            {/* Description */}
            {zone.description && (
              <p className="text-sm text-stone-300 mb-3">{zone.description}</p>
            )}

            {/* Time info */}
            {statusInfo.timeInfo && (
              <div className="bg-stone-800/50 p-3 rounded-lg mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={14} className="text-stone-400" aria-hidden="true" />
                  <span className="text-sm font-medium text-stone-200">Schedule</span>
                </div>
                <div className="text-sm text-stone-400">{statusInfo.timeInfo}</div>
              </div>
            )}

            {/* Stats */}
            <div className="flex flex-wrap gap-2 mb-3">
              <div className="bg-stone-800/30 p-2 rounded flex items-center gap-2 whitespace-nowrap">
                <Users size={16} className="text-emerald-400" aria-hidden="true" />
                <span className="font-semibold text-stone-100">{plural(zone.member_count, "member")}</span>
              </div>
              <div className="bg-stone-800/30 p-2 rounded flex items-center gap-2 whitespace-nowrap">
                <CheckCircle size={16} className="text-blue-400" aria-hidden="true" />
                <span className="font-semibold text-stone-100">{plural(zone.check_in_count, "check-in")}</span>
              </div>
            </div>

            <div className="text-xs text-stone-400 mb-3">
              Radius {Math.round(zone.radius_meters)} m
            </div>

            {/* Joining and checking in happen on the drop zones page */}
            <Link to="/dropzones" className="text-sm !text-amber-400 underline hover:!text-amber-300">
              Open drop zones
            </Link>
          </div>
        </Popup>
      </Marker>
    </>
  )
})

/** A circle and a marker for each drop zone, with a summary popup. */
export function DropZoneLayer({ zones }: DropZoneLayerProps) {
  return (
    <>
      {zones.map((zone) => (
        <DropZoneMarker key={zone.id} zone={zone} />
      ))}
    </>
  )
}
