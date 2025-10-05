"""
Admin tools for importing drops and stores from JSON data
"""
import json
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from pathlib import Path
from sqlalchemy.orm import Session
from sqlalchemy import and_

from services.database import SessionLocal
from services.models.drop import Drop, Store, DropStore

class DropImporter:
    """Import drops and stores from JSON data"""
    
    def __init__(self, db: Session = None):
        self.db = db or SessionLocal()
        self.imported_drops = 0
        self.imported_stores = 0
        self.errors = []
    
    def import_from_json_file(self, file_path: str) -> Dict[str, Any]:
        """Import data from JSON file"""
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
            return self.import_from_dict(data)
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def import_from_dict(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Import data from dictionary"""
        try:
            # Import stores first (drops may reference them)
            if 'stores' in data:
                self.import_stores(data['stores'])
            
            # Import drops
            if 'drops' in data:
                self.import_drops(data['drops'])
            
            # Link drops to stores
            if 'drop_stores' in data:
                self.link_drops_to_stores(data['drop_stores'])
            
            self.db.commit()
            
            return {
                "success": True,
                "imported_drops": self.imported_drops,
                "imported_stores": self.imported_stores,
                "errors": self.errors
            }
            
        except Exception as e:
            self.db.rollback()
            return {"success": False, "error": str(e), "errors": self.errors}
    
    def import_stores(self, stores_data: List[Dict[str, Any]]):
        """Import stores from list of dictionaries"""
        for store_data in stores_data:
            try:
                # Check if store already exists by slug
                existing = self.db.query(Store).filter(Store.slug == store_data.get('slug')).first()
                if existing:
                    continue
                
                store = Store(
                    name=store_data['name'],
                    slug=store_data['slug'],
                    geom=f"POINT({store_data['longitude']} {store_data['latitude']})",
                    address=store_data.get('address'),
                    city=store_data['city'],
                    state=store_data.get('state'),
                    country=store_data.get('country', 'US'),
                    postal_code=store_data.get('postal_code'),
                    retailer_type=store_data['retailer_type'],
                    phone=store_data.get('phone'),
                    website_url=store_data.get('website_url'),
                    features=store_data.get('features', []),
                    release_methods=store_data.get('release_methods', []),
                    is_verified=store_data.get('is_verified', True),
                    external_ids=store_data.get('external_ids', {})
                )
                
                self.db.add(store)
                self.imported_stores += 1
                
            except Exception as e:
                self.errors.append(f"Error importing store {store_data.get('name', 'unknown')}: {str(e)}")
    
    def import_drops(self, drops_data: List[Dict[str, Any]]):
        """Import drops from list of dictionaries"""
        for drop_data in drops_data:
            try:
                # Parse release date
                release_at = None
                if drop_data.get('release_at'):
                    if isinstance(drop_data['release_at'], str):
                        release_at = datetime.fromisoformat(drop_data['release_at'].replace('Z', '+00:00'))
                    else:
                        release_at = drop_data['release_at']
                
                # Check if drop already exists
                existing = self.db.query(Drop).filter(
                    and_(
                        Drop.brand == drop_data['brand'],
                        Drop.name == drop_data['name'],
                        Drop.release_at == release_at
                    )
                ).first()
                
                if existing:
                    continue
                
                drop = Drop(
                    brand=drop_data['brand'],
                    sku=drop_data.get('sku'),
                    name=drop_data['name'],
                    description=drop_data.get('description'),
                    release_at=release_at,
                    retail_price=drop_data.get('retail_price'),
                    image_url=drop_data.get('image_url'),
                    status=drop_data.get('status', 'upcoming'),
                    regions=drop_data.get('regions', ['US']),
                    release_type=drop_data.get('release_type'),
                    links=drop_data.get('links', {}),
                    original_source=drop_data.get('original_source', 'import'),
                    external_id=drop_data.get('external_id'),
                    is_featured=drop_data.get('is_featured', False),
                    is_verified=drop_data.get('is_verified', True)
                )
                
                self.db.add(drop)
                self.imported_drops += 1
                
            except Exception as e:
                self.errors.append(f"Error importing drop {drop_data.get('name', 'unknown')}: {str(e)}")
    
    def link_drops_to_stores(self, links_data: List[Dict[str, Any]]):
        """Link drops to stores via DropStore relationship"""
        for link_data in links_data:
            try:
                # Find drop and store by slug/identifier
                drop = self.db.query(Drop).filter(
                    Drop.name == link_data['drop_name']
                ).first()
                
                store = self.db.query(Store).filter(
                    Store.slug == link_data['store_slug']
                ).first()
                
                if not drop or not store:
                    continue
                
                # Check if link already exists
                existing_link = self.db.query(DropStore).filter(
                    and_(
                        DropStore.drop_id == drop.id,
                        DropStore.store_id == store.id
                    )
                ).first()
                
                if existing_link:
                    continue
                
                drop_store = DropStore(
                    drop_id=drop.id,
                    store_id=store.id,
                    local_release_time=link_data.get('local_release_time'),
                    allocation=link_data.get('allocation'),
                    release_method=link_data.get('release_method'),
                    registration_url=link_data.get('registration_url'),
                    is_confirmed=link_data.get('is_confirmed', False),
                    source=link_data.get('source', 'import'),
                    confidence_score=link_data.get('confidence_score', 80)
                )
                
                self.db.add(drop_store)
                
            except Exception as e:
                self.errors.append(f"Error linking drop to store: {str(e)}")

def generate_demo_data() -> Dict[str, Any]:
    """Generate demo data for 4 cities"""
    
    # Demo stores in 4 cities
    stores = [
        # Boston
        {
            "name": "Nike Boston",
            "slug": "nike-boston",
            "latitude": 42.3505,
            "longitude": -71.0759,
            "address": "200 Newbury St, Boston, MA 02116",
            "city": "Boston",
            "state": "MA",
            "retailer_type": "NIKE",
            "features": ["SNKRS", "RAFFLE", "FCFS"],
            "release_methods": ["RAFFLE", "FCFS"],
            "is_verified": True
        },
        {
            "name": "Concepts Boston",
            "slug": "concepts-boston",
            "latitude": 42.3480,
            "longitude": -71.0812,
            "address": "37 Brattle St, Cambridge, MA 02138",
            "city": "Boston", 
            "state": "MA",
            "retailer_type": "BOUTIQUE",
            "features": ["RAFFLE", "RESERVATION"],
            "release_methods": ["RAFFLE"],
            "is_verified": True
        },
        
        # NYC
        {
            "name": "Nike SoHo",
            "slug": "nike-soho",
            "latitude": 40.7235,
            "longitude": -74.0027,
            "address": "529 Broadway, New York, NY 10012",
            "city": "New York",
            "state": "NY", 
            "retailer_type": "NIKE",
            "features": ["SNKRS", "RAFFLE", "FCFS"],
            "release_methods": ["RAFFLE", "FCFS"],
            "is_verified": True
        },
        {
            "name": "Kith Manhattan",
            "slug": "kith-manhattan",
            "latitude": 40.7128,
            "longitude": -74.0060,
            "address": "337 Lafayette St, New York, NY 10012",
            "city": "New York",
            "state": "NY",
            "retailer_type": "BOUTIQUE",
            "features": ["RAFFLE", "APP_ONLY"],
            "release_methods": ["RAFFLE"],
            "is_verified": True
        },
        
        # LA
        {
            "name": "Nike Melrose",
            "slug": "nike-melrose",
            "latitude": 34.0837,
            "longitude": -118.3686,
            "address": "8500 Melrose Ave, West Hollywood, CA 90069",
            "city": "Los Angeles",
            "state": "CA",
            "retailer_type": "NIKE",
            "features": ["SNKRS", "RAFFLE"],
            "release_methods": ["RAFFLE"],
            "is_verified": True
        },
        {
            "name": "Undefeated LA",
            "slug": "undefeated-la",
            "latitude": 34.0689,
            "longitude": -118.3967,
            "address": "112 S La Brea Ave, Los Angeles, CA 90036",
            "city": "Los Angeles",
            "state": "CA",
            "retailer_type": "BOUTIQUE",
            "features": ["RAFFLE", "FCFS"],
            "release_methods": ["RAFFLE", "FCFS"],
            "is_verified": True
        },
        
        # Chicago
        {
            "name": "Nike Chicago",
            "slug": "nike-chicago",
            "latitude": 41.8781,
            "longitude": -87.6298,
            "address": "669 N Michigan Ave, Chicago, IL 60611",
            "city": "Chicago",
            "state": "IL",
            "retailer_type": "NIKE",
            "features": ["SNKRS", "RAFFLE"],
            "release_methods": ["RAFFLE"],
            "is_verified": True
        },
        {
            "name": "RSVP Gallery",
            "slug": "rsvp-gallery-chicago",
            "latitude": 41.9028,
            "longitude": -87.6317,
            "address": "1753 N Damen Ave, Chicago, IL 60647",
            "city": "Chicago",
            "state": "IL",
            "retailer_type": "BOUTIQUE",
            "features": ["RAFFLE", "RESERVATION"],
            "release_methods": ["RAFFLE"],
            "is_verified": True
        }
    ]
    
    # Demo drops (next 4 weeks)
    base_date = datetime.utcnow().replace(hour=10, minute=0, second=0, microsecond=0)
    
    drops = [
        {
            "brand": "Nike",
            "sku": "FD0774-100",
            "name": "Air Jordan 4 Retro 'White Thunder'",
            "description": "The Air Jordan 4 returns with a clean white leather upper and black accents.",
            "release_at": (base_date + timedelta(days=3)).isoformat(),
            "retail_price": 200.00,
            "image_url": "https://example.com/aj4-white-thunder.jpg",
            "status": "upcoming",
            "regions": ["US", "EU"],
            "release_type": "RAFFLE",
            "links": {
                "snkrs": "https://snkrs.com/product/fd0774-100",
                "nike": "https://nike.com/launch/fd0774-100"
            },
            "is_featured": True
        },
        {
            "brand": "Adidas",
            "sku": "GZ8203",
            "name": "Yeezy Boost 350 V2 'Onyx'",
            "description": "Featuring a monochromatic Primeknit upper in Onyx.",
            "release_at": (base_date + timedelta(days=7)).isoformat(),
            "retail_price": 230.00,
            "image_url": "https://example.com/yeezy-onyx.jpg",
            "status": "upcoming",
            "regions": ["US"],
            "release_type": "RAFFLE",
            "links": {
                "adidas": "https://adidas.com/yeezy"
            },
            "is_featured": True
        },
        {
            "brand": "Nike",
            "sku": "DZ5485-612",
            "name": "Dunk Low 'University Red'",
            "description": "Classic Dunk Low colorway with white and university red leather.",
            "release_at": (base_date + timedelta(days=10)).isoformat(),
            "retail_price": 110.00,
            "image_url": "https://example.com/dunk-red.jpg",
            "status": "upcoming",
            "regions": ["US"],
            "release_type": "FCFS",
            "links": {
                "snkrs": "https://snkrs.com/product/dz5485-612"
            }
        },
        {
            "brand": "Jordan",
            "sku": "CT8532-016",
            "name": "Air Jordan 1 Low 'Shadow'",
            "description": "Low-top version of the iconic Shadow colorway.",
            "release_at": (base_date + timedelta(days=14)).isoformat(),
            "retail_price": 90.00,
            "image_url": "https://example.com/aj1-low-shadow.jpg",
            "status": "upcoming",
            "regions": ["US"],
            "release_type": "FCFS"
        },
        {
            "brand": "Nike",
            "sku": "FB2207-100",
            "name": "Air Force 1 '07 'Triple White'",
            "description": "The timeless AF1 in clean triple white leather.",
            "release_at": (base_date + timedelta(days=17)).isoformat(),
            "retail_price": 90.00,
            "status": "upcoming",
            "regions": ["US"],
            "release_type": "FCFS"
        },
        {
            "brand": "Adidas",
            "sku": "FZ5000",
            "name": "Ultra Boost 22 'Core Black'",
            "description": "Latest Ultra Boost technology in core black colorway.",
            "release_at": (base_date + timedelta(days=21)).isoformat(),
            "retail_price": 180.00,
            "status": "upcoming",
            "regions": ["US"],
            "release_type": "FCFS"
        },
        {
            "brand": "Nike",
            "sku": "DD1391-100",
            "name": "Air Jordan 11 Retro 'Bred'",
            "description": "The legendary Bred colorway returns for holiday season.",
            "release_at": (base_date + timedelta(days=25)).isoformat(),
            "retail_price": 220.00,
            "image_url": "https://example.com/aj11-bred.jpg",
            "status": "upcoming",
            "regions": ["US", "EU"],
            "release_type": "RAFFLE",
            "is_featured": True
        }
    ]
    
    # Link drops to stores (simplified - each drop available at Nike stores and some boutiques)
    drop_stores = []
    
    for drop in drops:
        # Nike/Jordan drops available at Nike stores
        if drop['brand'] in ['Nike', 'Jordan']:
            for store in stores:
                if store['retailer_type'] == 'NIKE':
                    drop_stores.append({
                        "drop_name": drop['name'],
                        "store_slug": store['slug'],
                        "release_method": drop.get('release_type', 'FCFS'),
                        "is_confirmed": True,
                        "confidence_score": 95
                    })
        
        # Featured drops also available at boutiques
        if drop.get('is_featured'):
            for store in stores:
                if store['retailer_type'] == 'BOUTIQUE':
                    drop_stores.append({
                        "drop_name": drop['name'],
                        "store_slug": store['slug'],
                        "release_method": "RAFFLE",
                        "is_confirmed": False,
                        "confidence_score": 75
                    })
    
    return {
        "stores": stores,
        "drops": drops,
        "drop_stores": drop_stores
    }

def seed_demo_data() -> Dict[str, Any]:
    """Seed the database with demo data"""
    importer = DropImporter()
    demo_data = generate_demo_data()
    return importer.import_from_dict(demo_data)

if __name__ == "__main__":
    # Can be run directly to seed demo data
    result = seed_demo_data()
    print(json.dumps(result, indent=2))