"""
Seed data script for Sniped platform
Populates initial stores, sample users, and test data
"""

import asyncio
import uuid
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
import random
from models.database import (
    Base, User, Store, Event, LacesLedger, 
    VerificationLevel, EventType, StoreType, LacesReason
)

# Database connection
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/sniped"
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Sample data
SAMPLE_STORES = [
    # NYC Stores
    {"id": "nike-nyc-5th", "name": "Nike NYC 5th Ave", "type": StoreType.RETAIL, "lat": 40.7614, "lng": -73.9776, "address": "650 5th Ave, New York, NY 10019"},
    {"id": "footlocker-times-square", "name": "Foot Locker Times Square", "type": StoreType.RETAIL, "lat": 40.7580, "lng": -73.9855, "address": "1460 Broadway, New York, NY 10036"},
    {"id": "kith-manhattan", "name": "Kith Manhattan", "type": StoreType.RETAIL, "lat": 40.7265, "lng": -73.9973, "address": "337 Lafayette St, New York, NY 10012"},
    {"id": "stadium-goods", "name": "Stadium Goods", "type": StoreType.RETAIL, "lat": 40.7246, "lng": -73.9973, "address": "47 Howard St, New York, NY 10013"},
    {"id": "buffalo-exchange-brooklyn", "name": "Buffalo Exchange Brooklyn", "type": StoreType.THRIFT, "lat": 40.7181, "lng": -73.9584, "address": "504 Driggs Ave, Brooklyn, NY 11211"},
    
    # LA Stores
    {"id": "nike-la-grove", "name": "Nike The Grove", "type": StoreType.RETAIL, "lat": 34.0719, "lng": -118.3583, "address": "189 The Grove Dr, Los Angeles, CA 90036"},
    {"id": "round-two-hollywood", "name": "Round Two Hollywood", "type": StoreType.THRIFT, "lat": 34.0928, "lng": -118.3287, "address": "7320 Melrose Ave, Los Angeles, CA 90046"},
    {"id": "undefeated-la-brea", "name": "Undefeated La Brea", "type": StoreType.RETAIL, "lat": 34.0726, "lng": -118.3445, "address": "112 S La Brea Ave, Los Angeles, CA 90036"},
    {"id": "nike-outlet-citadel", "name": "Nike Outlet Citadel", "type": StoreType.OUTLET, "lat": 34.0069, "lng": -118.1506, "address": "100 Citadel Dr, Los Angeles, CA 90040"},
    
    # Chicago Stores
    {"id": "nike-chicago-michigan", "name": "Nike Chicago", "type": StoreType.RETAIL, "lat": 41.8837, "lng": -87.6247, "address": "669 N Michigan Ave, Chicago, IL 60611"},
    {"id": "saint-alfred", "name": "Saint Alfred", "type": StoreType.RETAIL, "lat": 41.9097, "lng": -87.6773, "address": "1531 N Milwaukee Ave, Chicago, IL 60622"},
    {"id": "rsvp-gallery", "name": "RSVP Gallery", "type": StoreType.RETAIL, "lat": 41.8956, "lng": -87.6353, "address": "1753 N Damen Ave, Chicago, IL 60647"},
    
    # Miami Stores
    {"id": "nike-miami-beach", "name": "Nike Miami Beach", "type": StoreType.RETAIL, "lat": 25.7907, "lng": -80.1300, "address": "1035 Lincoln Rd, Miami Beach, FL 33139"},
    {"id": "unknwn-miami", "name": "UNKNWN Miami", "type": StoreType.RETAIL, "lat": 25.8002, "lng": -80.2044, "address": "1800 NE 2nd Ave, Miami, FL 33132"},
    {"id": "shoe-gallery-miami", "name": "Shoe Gallery", "type": StoreType.RETAIL, "lat": 25.7617, "lng": -80.1918, "address": "1752 Alton Rd, Miami Beach, FL 33139"},
]

SAMPLE_USERS = [
    {"handle": "sneakerhead_mike", "email": "mike@example.com", "verification_level": VerificationLevel.EMAIL, "legit_score": 85},
    {"handle": "hypebeast_sarah", "email": "sarah@example.com", "verification_level": VerificationLevel.PHONE, "legit_score": 92},
    {"handle": "reseller_john", "email": "john@example.com", "verification_level": VerificationLevel.ID_VERIFIED, "legit_score": 78},
    {"handle": "collector_emma", "email": "emma@example.com", "verification_level": VerificationLevel.PREMIUM, "legit_score": 95},
    {"handle": "newbie_alex", "email": "alex@example.com", "verification_level": VerificationLevel.EMAIL, "legit_score": 50},
]

SAMPLE_EVENTS = [
    {"type": EventType.DROP, "title": "Jordan 4 Black Cat Restock", "description": "Full size run available!"},
    {"type": EventType.RESTOCK, "title": "Yeezy 350 V2 Surprise Drop", "description": "Limited quantities, FCFS"},
    {"type": EventType.FIND, "title": "Travis Scott 1s at Buffalo Exchange", "description": "Size 10.5, great condition, $800"},
    {"type": EventType.DROP, "title": "Dunk Low Panda Restock", "description": "App reservation open now"},
    {"type": EventType.FIND, "title": "Off-White Chicago 1s", "description": "DS condition, size 9, asking $3500"},
]

def seed_database():
    """Seed the database with initial data"""
    db = SessionLocal()
    
    try:
        # Create stores
        print("Creating stores...")
        stores = []
        for store_data in SAMPLE_STORES:
            store = Store(**store_data)
            db.add(store)
            stores.append(store)
        
        db.commit()
        print(f"Created {len(stores)} stores")
        
        # Create users
        print("Creating users...")
        users = []
        for user_data in SAMPLE_USERS:
            user = User(
                id=uuid.uuid4(),
                handle=user_data["handle"],
                email=user_data["email"],
                verification_level=user_data["verification_level"],
                legit_score=user_data["legit_score"],
                notif_radius_km=5
            )
            db.add(user)
            users.append(user)
        
        db.commit()
        print(f"Created {len(users)} users")
        
        # Create events
        print("Creating events...")
        events = []
        for i, event_data in enumerate(SAMPLE_EVENTS * 3):  # Create multiple events
            store = random.choice(stores)
            user = random.choice(users)
            
            event = Event(
                id=uuid.uuid4(),
                type=event_data["type"],
                title=event_data["title"],
                store_id=store.id,
                user_id=user.id,
                lat=store.lat + random.uniform(-0.001, 0.001),  # Slight variation
                lng=store.lng + random.uniform(-0.001, 0.001),
                payload={
                    "description": event_data["description"],
                    "timestamp": (datetime.now() - timedelta(hours=random.randint(0, 72))).isoformat()
                },
                verified_count=random.randint(0, 25)
            )
            db.add(event)
            events.append(event)
        
        db.commit()
        print(f"Created {len(events)} events")
        
        # Create LACES transactions
        print("Creating LACES transactions...")
        laces_transactions = []
        reasons = [LacesReason.SPOT, LacesReason.VERIFY, LacesReason.KNOWLEDGE, LacesReason.GOOD_VIBES]
        
        for user in users:
            # Give each user some initial LACES
            for _ in range(random.randint(3, 10)):
                transaction = LacesLedger(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    delta=random.randint(10, 100),
                    reason=random.choice(reasons),
                    created_at=datetime.now() - timedelta(days=random.randint(0, 30))
                )
                db.add(transaction)
                laces_transactions.append(transaction)
        
        db.commit()
        print(f"Created {len(laces_transactions)} LACES transactions")
        
        # Create SafeZones (special stores)
        print("Creating SafeZones...")
        safezones = [
            Store(
                id="safezone-nyc-soho",
                name="Sniped SafeZone SoHo",
                type=StoreType.SAFEZONE,
                lat=40.7223,
                lng=-73.9987,
                address="123 Spring St, New York, NY 10012"
            ),
            Store(
                id="safezone-la-fairfax",
                name="Sniped SafeZone Fairfax",
                type=StoreType.SAFEZONE,
                lat=34.0736,
                lng=-118.3613,
                address="456 Fairfax Ave, Los Angeles, CA 90036"
            )
        ]
        
        for sz in safezones:
            db.add(sz)
        
        db.commit()
        print(f"Created {len(safezones)} SafeZones")
        
        print("\nDatabase seeded successfully!")
        
        # Print summary
        print("\nDatabase Summary:")
        print(f"- Total Stores: {len(stores) + len(safezones)}")
        print(f"- Total Users: {len(users)}")
        print(f"- Total Events: {len(events)}")
        print(f"- Total LACES Transactions: {len(laces_transactions)}")
        
    except Exception as e:
        print(f"Error seeding database: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("Starting database seed...")
    seed_database()
