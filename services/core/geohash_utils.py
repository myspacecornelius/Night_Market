"""
Geohash utilities for spatial aggregation and clustering
"""
import geohash2
from typing import List, Dict, Tuple, Optional
from datetime import datetime, timedelta
import math

class GeohashUtils:
    """Utility functions for geohash operations"""
    
    # Precision levels for different zoom levels
    PRECISION_LEVELS = {
        1: 1,   # Country level (~5000km)
        2: 2,   # Large region (~1250km)  
        3: 3,   # Region (~160km)
        4: 4,   # Large city (~40km)
        5: 5,   # City (~5km)
        6: 6,   # District (~1.2km)
        7: 7,   # Neighborhood (~150m)
        8: 8,   # Block (~40m)
        9: 9,   # Building (~5m)
        10: 10  # Room (~1m)
    }
    
    @staticmethod
    def encode(latitude: float, longitude: float, precision: int = 7) -> str:
        """Encode coordinates to geohash"""
        return geohash2.encode(latitude, longitude, precision=precision)
    
    @staticmethod
    def decode(geohash: str) -> Tuple[float, float]:
        """Decode geohash to coordinates (lat, lng)"""
        return geohash2.decode(geohash)
    
    @staticmethod
    def get_precision_for_zoom(zoom_level: int) -> int:
        """Get appropriate geohash precision for map zoom level"""
        # Map zoom levels (1-18) to geohash precision (1-10)
        if zoom_level <= 2:
            return 2
        elif zoom_level <= 4:
            return 3
        elif zoom_level <= 6:
            return 4
        elif zoom_level <= 8:
            return 5
        elif zoom_level <= 10:
            return 6
        elif zoom_level <= 12:
            return 7
        elif zoom_level <= 14:
            return 8
        elif zoom_level <= 16:
            return 9
        else:
            return 10
    
    @staticmethod
    def get_neighbors(geohash: str) -> List[str]:
        """Get all 8 neighboring geohashes"""
        return geohash2.neighbors(geohash)
    
    @staticmethod
    def get_bounding_box(geohash: str) -> Dict[str, float]:
        """Get bounding box for geohash"""
        lat, lng = geohash2.decode(geohash)
        lat_err, lng_err = geohash2.decode_exact(geohash)[2:]
        
        return {
            'min_lat': lat - lat_err,
            'max_lat': lat + lat_err,
            'min_lng': lng - lng_err,
            'max_lng': lng + lng_err
        }
    
    @staticmethod
    def is_within_bbox(geohash: str, bbox: List[float]) -> bool:
        """Check if geohash center is within bounding box [min_lng, min_lat, max_lng, max_lat]"""
        lat, lng = geohash2.decode(geohash)
        min_lng, min_lat, max_lng, max_lat = bbox
        
        return min_lat <= lat <= max_lat and min_lng <= lng <= max_lng
    
    @staticmethod
    def distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
        """Calculate haversine distance between two points in kilometers"""
        R = 6371  # Earth's radius in kilometers
        
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lng = math.radians(lng2 - lng1)
        
        a = (math.sin(delta_lat / 2) ** 2 + 
             math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    @staticmethod
    def geohashes_within_radius(center_lat: float, center_lng: float, radius_km: float, precision: int = 7) -> List[str]:
        """Get all geohashes within radius of center point"""
        # Approximate degree per km (varies by latitude)
        lat_per_km = 1.0 / 111.0
        lng_per_km = 1.0 / (111.0 * math.cos(math.radians(center_lat)))
        
        # Calculate bounding box
        lat_delta = radius_km * lat_per_km
        lng_delta = radius_km * lng_per_km
        
        min_lat = center_lat - lat_delta
        max_lat = center_lat + lat_delta
        min_lng = center_lng - lng_delta
        max_lng = center_lng + lng_delta
        
        # Generate geohashes in bounding box
        geohashes = set()
        
        # Sample points within bounding box
        lat_steps = int((lat_delta * 2) / (lat_per_km * 0.1)) + 1
        lng_steps = int((lng_delta * 2) / (lng_per_km * 0.1)) + 1
        
        for i in range(lat_steps):
            for j in range(lng_steps):
                lat = min_lat + (i * (max_lat - min_lat) / lat_steps)
                lng = min_lng + (j * (max_lng - min_lng) / lng_steps)
                
                # Check if point is within radius
                if GeohashUtils.distance_km(center_lat, center_lng, lat, lng) <= radius_km:
                    geohash = GeohashUtils.encode(lat, lng, precision)
                    geohashes.add(geohash)
        
        return list(geohashes)

class SignalAggregator:
    """Aggregate signals by geohash for heatmap generation"""
    
    @staticmethod
    def aggregate_by_geohash(
        signals: List[Dict], 
        precision: int = 7,
        time_window_hours: Optional[int] = None
    ) -> Dict[str, Dict]:
        """
        Aggregate signals by geohash buckets
        
        Args:
            signals: List of signal dictionaries
            precision: Geohash precision level
            time_window_hours: Only include signals from last N hours
            
        Returns:
            Dictionary mapping geohash -> aggregated data
        """
        aggregated = {}
        cutoff_time = None
        
        if time_window_hours:
            cutoff_time = datetime.utcnow() - timedelta(hours=time_window_hours)
        
        for signal in signals:
            # Filter by time window if specified
            if cutoff_time and signal.get('created_at'):
                signal_time = signal['created_at']
                if isinstance(signal_time, str):
                    signal_time = datetime.fromisoformat(signal_time.replace('Z', '+00:00'))
                if signal_time < cutoff_time:
                    continue
            
            # Get geohash at desired precision
            if 'geohash' in signal:
                geohash = signal['geohash'][:precision]
            elif 'lat' in signal and 'lng' in signal:
                geohash = GeohashUtils.encode(signal['lat'], signal['lng'], precision)
            else:
                continue
            
            # Initialize bucket if not exists
            if geohash not in aggregated:
                lat, lng = GeohashUtils.decode(geohash)
                aggregated[geohash] = {
                    'geohash': geohash,
                    'lat': lat,
                    'lng': lng,
                    'signal_count': 0,
                    'total_reputation': 0,
                    'signal_types': {},
                    'brands': {},
                    'tags': [],
                    'sample_signals': []
                }
            
            bucket = aggregated[geohash]
            
            # Aggregate data
            bucket['signal_count'] += 1
            bucket['total_reputation'] += signal.get('reputation_score', 0)
            
            # Count signal types
            signal_type = signal.get('signal_type', 'GENERAL')
            bucket['signal_types'][signal_type] = bucket['signal_types'].get(signal_type, 0) + 1
            
            # Count brands
            brand = signal.get('brand')
            if brand:
                bucket['brands'][brand] = bucket['brands'].get(brand, 0) + 1
            
            # Collect tags
            tags = signal.get('tags', [])
            if tags:
                bucket['tags'].extend(tags)
            
            # Store sample signals (limit to 3 per bucket)
            if len(bucket['sample_signals']) < 3:
                bucket['sample_signals'].append({
                    'id': signal.get('id'),
                    'text_content': signal.get('text_content', '')[:100],
                    'signal_type': signal.get('signal_type'),
                    'reputation_score': signal.get('reputation_score', 0),
                    'created_at': signal.get('created_at')
                })
        
        # Post-process aggregated data
        for bucket in aggregated.values():
            # Calculate average reputation
            if bucket['signal_count'] > 0:
                bucket['avg_reputation'] = bucket['total_reputation'] / bucket['signal_count']
            else:
                bucket['avg_reputation'] = 0
            
            # Get top tags (limit to 5)
            tag_counts = {}
            for tag in bucket['tags']:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
            
            bucket['top_tags'] = sorted(
                tag_counts.keys(), 
                key=lambda x: tag_counts[x], 
                reverse=True
            )[:5]
            
            # Clean up raw tags list
            del bucket['tags']
        
        return aggregated
    
    @staticmethod
    def filter_by_bbox(aggregated: Dict[str, Dict], bbox: List[float]) -> Dict[str, Dict]:
        """Filter aggregated data by bounding box"""
        filtered = {}
        
        for geohash, data in aggregated.items():
            if GeohashUtils.is_within_bbox(geohash, bbox):
                filtered[geohash] = data
        
        return filtered
    
    @staticmethod
    def get_top_buckets(aggregated: Dict[str, Dict], limit: int = 50) -> List[Dict]:
        """Get top signal buckets by count"""
        buckets = list(aggregated.values())
        buckets.sort(key=lambda x: x['signal_count'], reverse=True)
        return buckets[:limit]