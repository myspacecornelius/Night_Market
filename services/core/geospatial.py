import math
import geohash2 as geohash
from typing import Tuple

from geoalchemy2 import Geography, Geometry
from sqlalchemy import cast, func


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
    lat, lon, _, _ = geohash.decode_exactly(gh)
    return lat, lon


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


# --- PostGIS helpers ----------------------------------------------------------
# Point columns in this schema are geography(Point, 4326). ST_X/ST_Y and planar
# bounding boxes need geometry, so these helpers do the casts in one place.

BBox = Tuple[float, float, float, float]


def parse_bbox(bbox: str) -> BBox:
    """Parse "min_lng,min_lat,max_lng,max_lat".

    Raises ValueError unless it is exactly four finite numbers inside the valid
    longitude/latitude ranges with min < max on both axes.
    """
    parts = bbox.split(",")
    if len(parts) != 4:
        raise ValueError("bbox must be min_lng,min_lat,max_lng,max_lat")
    min_lng, min_lat, max_lng, max_lat = (float(part) for part in parts)
    if not all(math.isfinite(value) for value in (min_lng, min_lat, max_lng, max_lat)):
        raise ValueError("bbox values must be finite numbers")
    if not (-180 <= min_lng < max_lng <= 180 and -90 <= min_lat < max_lat <= 90):
        raise ValueError("bbox is out of range or min is not below max")
    return min_lng, min_lat, max_lng, max_lat


def within_bbox(column, bbox: BBox):
    """Filter clause: the point column lies inside the planar lng/lat box.

    Intersecting a geography with an envelope treats the box edges as
    great-circle arcs, which drops rows for wide boxes and errors for a
    whole-world box, so the comparison is done on geometry.

    The column is converted with a plain geometry(column) call, which is the
    expression the ..._planar GiST indexes are built on. A typed CAST produces a
    different expression, and the filter then scans the whole table.
    """
    min_lng, min_lat, max_lng, max_lat = bbox
    envelope = func.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
    return func.ST_Intersects(func.geometry(column), envelope)


def point_lat(column):
    """SQL expression for the latitude of a point column."""
    return func.ST_Y(func.geometry(column))


def point_lng(column):
    """SQL expression for the longitude of a point column."""
    return func.ST_X(func.geometry(column))


def geography_point(lat: float, lng: float):
    """SQL expression for a geography point, e.g. as an ST_DWithin argument."""
    return cast(func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326), Geography)
