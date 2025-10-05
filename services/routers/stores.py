"""
Stores API - Store locations and retailer information
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, desc
from pydantic import BaseModel, validator

from services.database import get_db
from services.core.auth import get_current_admin_user
from services.models.drop import Store
from services.models.user import User

router = APIRouter(prefix="/stores", tags=["stores"])

# Pydantic models
class StoreCreate(BaseModel):
    name: str
    slug: str
    latitude: float
    longitude: float
    address: Optional[str] = None
    city: str
    state: Optional[str] = None
    country: str = "US"
    postal_code: Optional[str] = None
    retailer_type: str
    phone: Optional[str] = None
    website_url: Optional[str] = None
    features: Optional[List[str]] = None
    release_methods: Optional[List[str]] = None
    
    @validator('retailer_type')
    def validate_retailer_type(cls, v):
        valid_types = [
            'NIKE', 'ADIDAS', 'FOOTLOCKER', 'FINISH_LINE', 'CHAMPS', 'FOOTACTION',
            'JD_SPORTS', 'SNEAKERSNSTUFF', 'END', 'SIZE', 'BOUTIQUE', 'CONSIGNMENT', 'OTHER'
        ]
        if v not in valid_types:
            raise ValueError(f'retailer_type must be one of {valid_types}')
        return v

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

@router.get("/", response_model=StoresList)
async def list_stores(
    city: Optional[str] = Query(None, description="Filter by city"),
    retailer_type: Optional[str] = Query(None, description="Filter by retailer type"),
    near_lat: Optional[float] = Query(None, description="Latitude for proximity search"),
    near_lng: Optional[float] = Query(None, description="Longitude for proximity search"),
    radius_km: Optional[float] = Query(10, description="Search radius in kilometers"),
    verified_only: bool = Query(False, description="Show only verified stores"),
    active_only: bool = Query(True, description="Show only active stores"),
    page: int = Query(1, ge=1),
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
    
    # Proximity search (simplified - in production use PostGIS)
    if near_lat is not None and near_lng is not None:
        # For now, use simple bounding box - will upgrade to proper distance later
        lat_delta = radius_km / 111.0  # Approximate km to degrees
        lng_delta = radius_km / (111.0 * abs(near_lat) / 90.0)  # Adjust for latitude
        
        query = query.filter(
            and_(
                # Simple bounding box filter
                func.substr(Store.geom, func.strpos(Store.geom, '(') + 1, func.strpos(Store.geom, ' ') - func.strpos(Store.geom, '(') - 1).cast(db.Float) >= near_lng - lng_delta,
                func.substr(Store.geom, func.strpos(Store.geom, '(') + 1, func.strpos(Store.geom, ' ') - func.strpos(Store.geom, '(') - 1).cast(db.Float) <= near_lng + lng_delta
            )
        )
    
    # Get total count
    total = query.count()
    
    # Apply ordering and pagination
    stores = query.order_by(
        desc(Store.is_verified),  # Verified first
        desc(Store.signal_count),  # Most active stores
        Store.name
    ).offset((page - 1) * per_page).limit(per_page).all()
    
    # Convert to response format
    store_responses = []
    for store in stores:
        # Parse coordinates from geom string (temporary until PostGIS integration)
        try:
            coords_str = store.geom.replace('POINT(', '').replace(')', '')
            lng, lat = map(float, coords_str.split())
        except:
            lat, lng = 0.0, 0.0
        
        store_responses.append(StoreResponse(
            id=str(store.id),
            name=store.name,
            slug=store.slug,
            latitude=lat,
            longitude=lng,
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
        ))
    
    return StoresList(
        stores=store_responses,
        total=total,
        page=page,
        per_page=per_page,
        has_next=total > page * per_page
    )

@router.get("/{store_id}", response_model=StoreResponse)
async def get_store(store_id: str, db: Session = Depends(get_db)):
    """Get a specific store by ID"""
    
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    # Parse coordinates
    try:
        coords_str = store.geom.replace('POINT(', '').replace(')', '')
        lng, lat = map(float, coords_str.split())
    except:
        lat, lng = 0.0, 0.0
    
    return StoreResponse(
        id=str(store.id),
        name=store.name,
        slug=store.slug,
        latitude=lat,
        longitude=lng,
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

@router.post("/", response_model=StoreResponse, status_code=status.HTTP_201_CREATED)
async def create_store(
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
        geom=f"POINT({store_data.longitude} {store_data.latitude})",  # Temporary format
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
    db.commit()
    db.refresh(store)
    
    return StoreResponse(
        id=str(store.id),
        name=store.name,
        slug=store.slug,
        latitude=store_data.latitude,
        longitude=store_data.longitude,
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
        signal_count=0,
        drop_count=0
    )

@router.get("/cities/list")
async def list_cities(db: Session = Depends(get_db)):
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
async def list_retailers(db: Session = Depends(get_db)):
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
async def get_stores_near_city(
    city: str,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get stores near a specific city"""
    
    stores = db.query(Store).filter(
        and_(
            Store.city.ilike(f"%{city}%"),
            Store.is_active == True
        )
    ).order_by(
        desc(Store.is_verified),
        desc(Store.signal_count)
    ).limit(limit).all()
    
    # Convert to GeoJSON for map display
    features = []
    for store in stores:
        try:
            coords_str = store.geom.replace('POINT(', '').replace(')', '')
            lng, lat = map(float, coords_str.split())
            
            features.append({
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
            })
        except:
            continue
    
    return {
        "type": "FeatureCollection",
        "features": features,
        "city": city,
        "store_count": len(features)
    }