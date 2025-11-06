import pytest
from services.core.geospatial import (
    haversine_distance,
    encode_geohash,
    decode_geohash,
    validate_coordinates
)


def test_haversine_distance():
    """Test haversine distance calculation"""
    # Boston to NYC (approximately 305km = 305000m)
    boston = (42.3601, -71.0589)
    nyc = (40.7128, -74.0060)

    distance = haversine_distance(boston[0], boston[1], nyc[0], nyc[1])

    # Allow 5% margin of error
    assert 290000 < distance < 320000


def test_haversine_distance_same_point():
    """Test distance between identical points is zero"""
    lat, lon = 42.3601, -71.0589
    distance = haversine_distance(lat, lon, lat, lon)
    assert distance == 0


def test_encode_geohash():
    """Test geohash encoding"""
    # Boston coordinates
    lat, lon = 42.3601, -71.0589
    gh = encode_geohash(lat, lon, precision=6)

    assert isinstance(gh, str)
    assert len(gh) == 6


def test_decode_geohash():
    """Test geohash decoding"""
    gh = "drt2z0"  # Boston area
    lat, lon = decode_geohash(gh)

    # Should be close to Boston
    assert 42 < lat < 43
    assert -72 < lon < -70


def test_geohash_roundtrip():
    """Test encoding and decoding geohash"""
    original_lat, original_lon = 42.3601, -71.0589

    # Encode and decode
    gh = encode_geohash(original_lat, original_lon, precision=6)
    decoded_lat, decoded_lon = decode_geohash(gh)

    # Should be within reasonable precision (geohash precision 6 ≈ ±0.61km)
    assert abs(decoded_lat - original_lat) < 0.01
    assert abs(decoded_lon - original_lon) < 0.01


def test_validate_coordinates_valid():
    """Test coordinate validation with valid inputs"""
    assert validate_coordinates(0, 0) is True
    assert validate_coordinates(42.3601, -71.0589) is True
    assert validate_coordinates(90, 180) is True
    assert validate_coordinates(-90, -180) is True


def test_validate_coordinates_invalid():
    """Test coordinate validation with invalid inputs"""
    assert validate_coordinates(91, 0) is False
    assert validate_coordinates(-91, 0) is False
    assert validate_coordinates(0, 181) is False
    assert validate_coordinates(0, -181) is False
