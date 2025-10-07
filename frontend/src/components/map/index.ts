// Export all map components and types
export { BaseMap } from "./BaseMap"
export type { BaseMapProps, MapBounds } from "./BaseMap"

export { HeatMapOverlay } from "./HeatMapOverlay"
export type { HeatMapOverlayProps, HeatMapData, HeatMapBin } from "./HeatMapOverlay"

export { DropZoneLayer } from "./DropZoneLayer"
export type { DropZoneLayerProps, DropZone } from "./DropZoneLayer"

// Re-export updated HeatMap component with new interface
export { HeatMap, mockHeatMapData, mockDropZones } from "../dharma/HeatMap"
export type { HeatZone } from "../dharma/HeatMap"