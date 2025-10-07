import * as React from "react"
import { Circle, Marker, Popup, useMap } from "react-leaflet"
import { LatLngExpression, divIcon } from "leaflet"
import { motion } from "framer-motion"
import { 
  MapPin, 
  Users, 
  Clock, 
  Shield, 
  CheckCircle, 
  Timer, 
  User,
  Crown,
  Star,
  Navigation
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/Button"

export interface DropZone {
  id: string
  name: string
  description?: string
  owner_id: string
  center_lat: number
  center_lng: number
  radius_meters: number
  status: "scheduled" | "active" | "ended" | "cancelled"
  starts_at?: string
  ends_at?: string
  member_count: number
  check_in_count: number
  created_at: string
  is_member?: boolean
  user_role?: "member" | "moderator" | "owner"
  distance_from_user?: number
  last_check_in?: string
}

export interface DropZoneLayerProps {
  zones: DropZone[]
  userLocation?: LatLngExpression
  onZoneClick?: (zone: DropZone) => void
  onCheckIn?: (zoneId: string, lat: number, lng: number) => void
  onJoinZone?: (zoneId: string) => void
  isCheckingIn?: boolean
  className?: string
}

// Create custom icon for drop zone markers
function createDropZoneIcon(zone: DropZone, size: number = 32): L.DivIcon {
  const statusColor = {
    scheduled: "#6b7280", // gray-500
    active: "#10b981", // emerald-500
    ended: "#ef4444", // red-500
    cancelled: "#f59e0b" // amber-500
  }[zone.status]

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

// Get zone status details
function getZoneStatusInfo(zone: DropZone) {
  const now = new Date()
  const startsAt = zone.starts_at ? new Date(zone.starts_at) : null
  const endsAt = zone.ends_at ? new Date(zone.ends_at) : null

  switch (zone.status) {
    case "scheduled":
      return {
        icon: Timer,
        label: "Scheduled",
        color: "text-gray-400",
        timeInfo: startsAt ? `Starts ${startsAt.toLocaleString()}` : "Not scheduled"
      }
    case "active":
      return {
        icon: CheckCircle,
        label: "Active Now",
        color: "text-emerald-400",
        timeInfo: endsAt ? `Ends ${endsAt.toLocaleString()}` : "Open ended"
      }
    case "ended":
      return {
        icon: Clock,
        label: "Ended",
        color: "text-red-400",
        timeInfo: endsAt ? `Ended ${endsAt.toLocaleString()}` : "Recently ended"
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

// Get user role icon
function getRoleIcon(role?: string) {
  switch (role) {
    case "owner":
      return Crown
    case "moderator":
      return Shield
    case "member":
      return User
    default:
      return null
  }
}

// Individual drop zone component
function DropZoneMarker({
  zone,
  userLocation,
  onZoneClick,
  onCheckIn,
  onJoinZone,
  isCheckingIn = false
}: {
  zone: DropZone
  userLocation?: LatLngExpression
  onZoneClick?: (zone: DropZone) => void
  onCheckIn?: (zoneId: string, lat: number, lng: number) => void
  onJoinZone?: (zoneId: string) => void
  isCheckingIn?: boolean
}) {
  const statusInfo = getZoneStatusInfo(zone)
  const StatusIcon = statusInfo.icon
  const RoleIcon = getRoleIcon(zone.user_role)
  
  const canCheckIn = zone.status === "active" && zone.is_member
  const canJoin = !zone.is_member && zone.status !== "ended" && zone.status !== "cancelled"

  return (
    <>
      {/* Zone boundary circle */}
      <Circle
        center={[zone.center_lat, zone.center_lng]}
        radius={zone.radius_meters}
        pathOptions={{
          fillColor: zone.status === "active" ? "#10b981" : "#6b7280",
          fillOpacity: 0.1,
          color: zone.status === "active" ? "#10b981" : "#6b7280",
          weight: 2,
          opacity: 0.6,
          dashArray: zone.status === "scheduled" ? "5, 5" : undefined
        }}
      />
      
      {/* Zone marker */}
      <Marker
        position={[zone.center_lat, zone.center_lng]}
        icon={createDropZoneIcon(zone)}
        eventHandlers={{
          click: () => onZoneClick?.(zone)
        }}
      >
        <Popup className="drop-zone-popup" maxWidth={320}>
          <div className="p-4 min-w-80">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-lg text-stone-100">{zone.name}</h3>
                  {RoleIcon && <RoleIcon size={16} className="text-amber-400" />}
                </div>
                <div className="flex items-center gap-2">
                  <StatusIcon size={14} className={statusInfo.color} />
                  <span className={cn("text-sm", statusInfo.color)}>
                    {statusInfo.label}
                  </span>
                </div>
              </div>
              <div className="text-right text-sm text-stone-400">
                <div>{zone.member_count} members</div>
                <div>{zone.check_in_count} check-ins</div>
              </div>
            </div>

            {/* Description */}
            {zone.description && (
              <p className="text-sm text-stone-300 mb-3">{zone.description}</p>
            )}

            {/* Time info */}
            <div className="bg-stone-800/50 p-3 rounded-lg mb-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={14} className="text-stone-400" />
                <span className="text-sm font-medium text-stone-200">Schedule</span>
              </div>
              <div className="text-sm text-stone-400">{statusInfo.timeInfo}</div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-stone-800/30 p-2 rounded">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-emerald-400" />
                  <div>
                    <div className="text-xs text-stone-400">Members</div>
                    <div className="font-semibold text-stone-100">{zone.member_count}</div>
                  </div>
                </div>
              </div>
              <div className="bg-stone-800/30 p-2 rounded">
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-blue-400" />
                  <div>
                    <div className="text-xs text-stone-400">Check-ins</div>
                    <div className="font-semibold text-stone-100">{zone.check_in_count}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Distance info */}
            {zone.distance_from_user !== undefined && (
              <div className="flex items-center gap-2 mb-3 text-sm text-stone-400">
                <Navigation size={14} />
                <span>
                  {zone.distance_from_user < 1000 
                    ? `${Math.round(zone.distance_from_user)}m away`
                    : `${(zone.distance_from_user / 1000).toFixed(1)}km away`
                  }
                </span>
              </div>
            )}

            {/* Last check-in */}
            {zone.last_check_in && (
              <div className="text-sm text-stone-400 mb-3">
                Last check-in: {new Date(zone.last_check_in).toLocaleString()}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              {canCheckIn && onCheckIn && (
                <Button
                  onClick={() => onCheckIn(zone.id, zone.center_lat, zone.center_lng)}
                  disabled={isCheckingIn}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  size="sm"
                >
                  {isCheckingIn ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                      Checking In...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} className="mr-2" />
                      Check In
                    </>
                  )}
                </Button>
              )}
              
              {canJoin && onJoinZone && (
                <Button
                  onClick={() => onJoinZone(zone.id)}
                  variant="outline"
                  className="flex-1 border-amber-600 text-amber-400 hover:bg-amber-600 hover:text-white"
                  size="sm"
                >
                  <Users size={16} className="mr-2" />
                  Join Zone
                </Button>
              )}
              
              {!canCheckIn && !canJoin && zone.is_member && (
                <div className="flex-1 text-center text-sm text-stone-400 py-2">
                  {zone.status === "ended" ? "Zone has ended" : "Not available for check-in"}
                </div>
              )}
            </div>

            {/* Zone details link */}
            <Button
              onClick={() => onZoneClick?.(zone)}
              variant="ghost"
              className="w-full mt-2 text-stone-400 hover:text-stone-200"
              size="sm"
            >
              View Zone Details
            </Button>
          </div>
        </Popup>
      </Marker>
    </>
  )
}

export function DropZoneLayer({
  zones,
  userLocation,
  onZoneClick,
  onCheckIn,
  onJoinZone,
  isCheckingIn = false,
  className
}: DropZoneLayerProps) {
  if (!zones || zones.length === 0) {
    return null
  }

  return (
    <div className={className}>
      {zones.map((zone) => (
        <DropZoneMarker
          key={zone.id}
          zone={zone}
          userLocation={userLocation}
          onZoneClick={onZoneClick}
          onCheckIn={onCheckIn}
          onJoinZone={onJoinZone}
          isCheckingIn={isCheckingIn}
        />
      ))}
    </div>
  )
}