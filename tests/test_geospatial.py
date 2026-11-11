import pytest
from services.core.geospatial import (
    haversine_distance,
    encode_geohash,
    decode_geohash,
    parse_bbox,
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


def test_parse_bbox_accepts_a_valid_box():
    assert parse_bbox("-71.2,42.2,-70.9,42.5") == (-71.2, 42.2, -70.9, 42.5)
    assert parse_bbox("-180,-90,180,90") == (-180.0, -90.0, 180.0, 90.0)


@pytest.mark.parametrize("bad", [
    "",
    "1,2,3",              # too few values
    "1,2,3,4,5",          # too many values
    "a,b,c,d",            # not numbers
    "-71,42,-72,43",      # min_lng above max_lng
    "-71,43,-70,42",      # min_lat above max_lat
    "-190,0,10,10",       # longitude out of range
    "0,-95,10,10",        # latitude out of range
    "nan,0,10,10",
    "0,0,inf,10",
])
def test_parse_bbox_rejects_malformed_boxes(bad):
    with pytest.raises(ValueError):
        parse_bbox(bad)


def test_bounding_box_filters_can_use_an_index(db_session):
    """within_bbox must produce the expression the *_planar GiST indexes are built on.

    A typed CAST (what geoalchemy2's Geometry type compiles to) is a different
    expression: the filter still works but scans the whole table.
    """
    from sqlalchemy import func, select, text

    from services.core.geospatial import within_bbox
    from services.models.dropzone import DropZone
    from services.models.location import Location
    from services.models.signal import Signal

    db_session.execute(text("SET LOCAL enable_seqscan = off"))  # the test tables are tiny
    for model, column, index in (
        (Location, Location.point, "ix_locations_point_planar"),
        (Signal, Signal.geom, "ix_signals_geom_planar"),
        (DropZone, DropZone.center_point, "ix_dropzones_center_planar"),
    ):
        statement = select(func.count()).select_from(model).where(within_bbox(column, (-71.2, 42.2, -70.9, 42.5)))
        sql = str(statement.compile(db_session.get_bind(), compile_kwargs={"literal_binds": True}))
        plan = "\n".join(row[0] for row in db_session.execute(text("EXPLAIN " + sql)))
        assert index in plan, f"{model.__tablename__}: the box filter does not use {index}\n{plan}"
