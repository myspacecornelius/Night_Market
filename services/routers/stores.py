"""
Stores API - Store locations and retailer information
"""
import uuid
from typing import Annotated, List, Literal, Optional
from fastapi import APIRouter, HTTPException, Depends, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, desc
from pydantic import BaseModel, Field, StringConstraints

from services.database import get_db
from services.core.auth import get_current_admin_user
from services.core.geospatial import geography_point, point_lat, point_lng
from services.models.drop import Store
from services.models.user import User

router = APIRouter(prefix="/stores", tags=["stores"])

# The values of retailer_type_enum; anything else is a 422, not a database error
RetailerType = Literal[
    'NIKE', 'ADIDAS', 'FOOTLOCKER', 'FINISH_LINE', 'CHAMPS', 'FOOTACTION',
    'JD_SPORTS', 'SNEAKERSNSTUFF', 'END', 'SIZE', 'BOUTIQUE', 'CONSIGNMENT', 'OTHER'
]

MAX_RADIUS_KM = 500.0

# Keeps OFFSET = (page - 1) * per_page far inside PostgreSQL's bigint range
MAX_PAGE = 100_000

# Pydantic models
class StoreCreate(BaseModel):
    # Surrounding whitespace is dropped from the required texts, and what is left must not be empty
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    slug: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address: Optional[str] = None
    city: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    state: Optional[str] = Field(None, max_length=50)
    country: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)] = "US"
    postal_code: Optional[str] = Field(None, max_length=20)
    retailer_type: RetailerType
    phone: Optional[str] = Field(None, max_length=20)
    website_url: Optional[str] = Field(None, max_length=500)
    features: Optional[List[str]] = None
    release_methods: Optional[List[str]] = None

class StoreResponse(BaseModel):
    id: str
    name: str
    slug: str
    latitude: float
    longitude: float
    address: Optional[str]
    city: str
    state: Optional[str]
    country: str
    retailer_type: str
    phone: Optional[str]
    website_url: Optional[str]
    features: Optional[List[str]]
    release_methods: List[str]
    is_verified: bool
    is_active: bool
    signal_count: int
    drop_count: int
    
    class Config:
        from_attributes = True

class StoresList(BaseModel):
    stores: List[StoreResponse]
    total: int
    page: int
    per_page: int
    has_next: bool

# Coordinates are read from the geography column in SQL, next to the store row
STORE_COORDINATES = (point_lat(Store.geom), point_lng(Store.geom))

def _store_response(store: Store, latitude: float, longitude: float) -> StoreResponse:
    return StoreResponse(
        id=str(store.id),
        name=store.name,
        slug=store.slug,
        latitude=latitude,
        longitude=longitude,
        address=store.address,
        city=store.city,
        state=store.state,
        country=store.country,
        retailer_type=store.retailer_type,
        phone=store.phone,
        website_url=store.website_url,
        features=store.features,
        release_methods=store.get_release_methods_display(),
        is_verified=store.is_verified,
        is_active=store.is_active,
        signal_count=store.signal_count,
        drop_count=len(store.drops) if store.drops else 0
    )

@router.get("/", response_model=StoresList)
def list_stores(
    city: Optional[str] = Query(None, description="Filter by city"),
    retailer_type: Optional[RetailerType] = Query(None, description="Filter by retailer type"),
    near_lat: Optional[float] = Query(None, ge=-90, le=90, description="Latitude for proximity search"),
    near_lng: Optional[float] = Query(None, ge=-180, le=180, description="Longitude for proximity search"),
    radius_km: float = Query(10, gt=0, le=MAX_RADIUS_KM, description="Search radius in kilometers"),
    verified_only: bool = Query(False, description="Show only verified stores"),
    active_only: bool = Query(True, description="Show only active stores"),
    page: int = Query(1, ge=1, le=MAX_PAGE),
    per_page: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """List stores with filtering and pagination"""
    
    # Base query
    query = db.query(Store)
    
    # Apply filters
    if city:
        query = query.filter(Store.city.ilike(f"%{city}%"))
    
    if retailer_type:
        query = query.filter(Store.retailer_type == retailer_type)
    
    if verified_only:
        query = query.filter(Store.is_verified == True)
    
    if active_only:
        query = query.filter(Store.is_active == True)
    
    # Proximity search: stores within radius_km of the point, measured on the globe
    if (near_lat is None) != (near_lng is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="near_lat and near_lng must be given together"
        )
    if near_lat is not None and near_lng is not None:
        query = query.filter(
            func.ST_DWithin(Store.geom, geography_point(near_lat, near_lng), radius_km * 1000)
        )
    
    # Get total count
    total = query.count()
    
    # Apply ordering and pagination
    rows = query.add_columns(*STORE_COORDINATES).order_by(
        desc(Store.is_verified),  # Verified first
        desc(Store.signal_count),  # Most active stores
        Store.name
    ).offset((page - 1) * per_page).limit(per_page).all()
    
    # Convert to response format
    store_responses = [_store_response(store, lat, lng) for store, lat, lng in rows]
    
    return StoresList(
        stores=store_responses,
        total=total,
        page=page,
        per_page=per_page,
        has_next=total > page * per_page
    )

@router.get("/{store_id}", response_model=StoreResponse)
def get_store(store_id: uuid.UUID, db: Session = Depends(get_db)):
    """Get a specific store by ID"""
    
    row = db.query(Store, *STORE_COORDINATES).filter(Store.id == store_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Store not found")
    
    store, lat, lng = row
    return _store_response(store, lat, lng)

@router.post("/", response_model=StoreResponse, status_code=status.HTTP_201_CREATED)
def create_store(
    store_data: StoreCreate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Create a new store (admin only)"""
    
    # Check for duplicate slug
    existing = db.query(Store).filter(Store.slug == store_data.slug).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Store with this slug already exists"
        )
    
    # Create store
    store = Store(
        name=store_data.name,
        slug=store_data.slug,
        geom=geography_point(store_data.latitude, store_data.longitude),
        address=store_data.address,
        city=store_data.city,
        state=store_data.state,
        country=store_data.country,
        postal_code=store_data.postal_code,
        retailer_type=store_data.retailer_type,
        phone=store_data.phone,
        website_url=store_data.website_url,
        features=store_data.features,
        release_methods=store_data.release_methods,
        is_verified=True  # Admin-created stores are verified
    )
    
    db.add(store)
    db.flush()
    
    # Report the coordinates as stored, and build the response before committing
    lat, lng = db.query(*STORE_COORDINATES).filter(Store.id == store.id).one()
    response = _store_response(store, lat, lng)
    db.commit()
    return response

@router.get("/cities/list")
def list_cities(db: Session = Depends(get_db)):
    """Get list of cities with store counts"""
    
    cities = db.query(
        Store.city,
        Store.state,
        Store.country,
        func.count(Store.id).label('store_count')
    ).filter(
        Store.is_active == True
    ).group_by(
        Store.city, Store.state, Store.country
    ).order_by(
        desc('store_count')
    ).all()
    
    return {
        "cities": [
            {
                "city": city[0],
                "state": city[1],
                "country": city[2],
                "store_count": city[3]
            }
            for city in cities
        ]
    }

@router.get("/retailers/list")
def list_retailers(db: Session = Depends(get_db)):
    """Get list of retailer types with store counts"""
    
    retailers = db.query(
        Store.retailer_type,
        func.count(Store.id).label('store_count')
    ).filter(
        Store.is_active == True
    ).group_by(
        Store.retailer_type
    ).order_by(
        desc('store_count')
    ).all()
    
    return {
        "retailers": [
            {
                "retailer_type": retailer[0],
                "store_count": retailer[1]
            }
            for retailer in retailers
        ]
    }

@router.get("/near/{city}")
def get_stores_near_city(
    city: str,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get stores near a specific city"""
    
    rows = db.query(Store, *STORE_COORDINATES).filter(
        and_(
            Store.city.ilike(f"%{city}%"),
            Store.is_active == True
        )
    ).order_by(
        desc(Store.is_verified),
        desc(Store.signal_count)
    ).limit(limit).all()
    
    # Convert to GeoJSON for map display
    features = [
        {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [lng, lat]
            },
            "properties": {
                "id": str(store.id),
                "name": store.name,
                "retailer_type": store.retailer_type,
                "address": store.address,
                "is_verified": store.is_verified,
                "signal_count": store.signal_count,
                "drop_count": len(store.drops) if store.drops else 0
            }
        }
        for store, lat, lng in rows
    ]
    
    return {
        "type": "FeatureCollection",
        "features": features,
        "city": city,
        "store_count": len(features)
    }