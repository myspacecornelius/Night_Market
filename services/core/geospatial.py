import math
import geohash2 as geohash
from typing import Tuple


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points on Earth in meters.

    Args:
        lat1, lon1: Coordinates of first point
        lat2, lon2: Coordinates of second point

    Returns:
        Distance in meters
    """
    R = 6371000  # Earth radius in meters

    # Convert to radians
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    # Haversine formula
    a = (math.sin(delta_lat / 2) ** 2 +
         math.cos(lat1_rad) * math.cos(lat2_rad) *
         math.sin(delta_lon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def encode_geohash(lat: float, lon: float, precision: int = 6) -> str:
    """Encode coordinates to geohash"""
    return geohash.encode(lat, lon, precision=precision)


def decode_geohash(gh: str) -> Tuple[float, float]:
    """Decode geohash to (latitude, longitude)"""
    return geohash.decode(gh)


def get_geohash_neighbors(gh: str) -> list[str]:
    """Get all 8 neighboring geohashes"""
    return geohash.neighbors(gh)


def bbox_to_geohashes(min_lat: float, min_lon: float,
                      max_lat: float, max_lon: float,
                      precision: int = 6) -> list[str]:
    """
    Get all geohashes within a bounding box.

    Args:
        min_lat, min_lon: Southwest corner
        max_lat, max_lon: Northeast corner
        precision: Geohash precision level

    Returns:
        List of geohash strings
    """
    geohashes = set()

    # Sample points within the bbox and get their geohashes
    lat_step = (max_lat - min_lat) / 20
    lon_step = (max_lon - min_lon) / 20

    lat = min_lat
    while lat <= max_lat:
        lon = min_lon
        while lon <= max_lon:
            gh = encode_geohash(lat, lon, precision)
            geohashes.add(gh)
            lon += lon_step
        lat += lat_step

    return list(geohashes)


def validate_coordinates(lat: float, lon: float) -> bool:
    """Validate latitude and longitude values"""
    return -90 <= lat <= 90 and -180 <= lon <= 180
