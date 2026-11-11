
import argparse
import random
import os
import sys
from typing import List, Optional
from faker import Faker
from sqlalchemy.orm import Session
from services.database import SessionLocal
from services.models.user import User
from services.models.post import Post
from services.models.release import Release
from services.models.location import Location
from services.models.laces import LacesLedger
from services.models.like import Like
from services.models.save import Save
from services.models.subscription import Subscription
from services.models.session import UserSession
from services.models.signal import Signal
from services.models.dropzone import DropZone, DropZoneMember, DropZoneCheckIn
from services.core.security import DEVELOPMENT_ENVIRONMENTS, get_password_hash
from services.core.locations import create_location_and_post
from datetime import datetime, timedelta, timezone
from services.schemas.post import PostCreate, PostType

fake = Faker()

# Sneaker culture data for realistic demo
SNEAKER_BRANDS = ["Nike", "Adidas", "Jordan", "Yeezy", "New Balance", "Puma", "Vans", "Converse"]
SNEAKER_MODELS = {
    "Nike": ["Air Force 1", "Dunk Low", "Dunk High", "Air Max 90", "Air Max 1", "Blazer Mid"],
    "Adidas": ["Stan Smith", "Gazelle", "Samba", "Forum Low", "Campus", "Superstar"],
    "Jordan": ["Air Jordan 1", "Air Jordan 4", "Air Jordan 11", "Air Jordan 3", "Air Jordan 6"],
    "Yeezy": ["350 V2", "700", "500", "Foam Runner", "Slide", "380"],
    "New Balance": ["550", "2002R", "990v3", "327", "1906R", "9060"],
    "Puma": ["Suede Classic", "RS-X", "Clyde", "Palermo", "Speedcat"],
    "Vans": ["Old Skool", "Sk8-Hi", "Authentic", "Era", "Slip-On"],
    "Converse": ["Chuck Taylor All Star", "Chuck 70", "One Star", "Pro Leather"]
}

SNEAKER_COLORWAYS = [
    "Black/White", "White/Black", "Triple White", "Triple Black", "Chicago", "Bred", 
    "Royal Blue", "Shadow", "Pine Green", "Court Purple", "University Blue",
    "Panda", "Georgetown", "UNC", "Fragment", "Travis Scott", "Off-White",
    "Cream White", "Zebra", "Beluga", "Oreo", "Static", "Citrin"
]

SNEAKER_HASHTAGS = [
    "#SneakerHead", "#KOTD", "#SneakerGame", "#Hypebeast", "#SneakerCommunity",
    "#SneakerDrop", "#SneakerNews", "#SneakerCulture", "#Grails", "#Heat",
    "#SneakerCollection", "#SneakerAddict", "#SneakerLove", "#Kicks", "#Footwear",
    "#StreetStyle", "#SneakerRestock", "#LimitedEdition", "#Exclusive", "#Rare"
]

CITY_LOCATIONS = {
    "Boston": [
        {"name": "Newbury Street", "lat": 42.3505, "lng": -71.0763, "vibe": "premium retail"},
        {"name": "Harvard Square", "lat": 42.3736, "lng": -71.1190, "vibe": "college town energy"},
        {"name": "Faneuil Hall", "lat": 42.3601, "lng": -71.0589, "vibe": "tourist hotspot"},
        {"name": "Back Bay", "lat": 42.3505, "lng": -71.0763, "vibe": "upscale shopping"},
        {"name": "North End", "lat": 42.3647, "lng": -71.0542, "vibe": "historic neighborhood"},
    ],
    "NYC": [
        {"name": "SoHo", "lat": 40.7233, "lng": -74.0030, "vibe": "fashion district"},
        {"name": "Union Square", "lat": 40.7359, "lng": -73.9911, "vibe": "streetwear central"},
        {"name": "Brooklyn Heights", "lat": 40.6962, "lng": -73.9936, "vibe": "hipster paradise"},
        {"name": "Lower East Side", "lat": 40.7209, "lng": -73.9896, "vibe": "underground culture"},
        {"name": "Williamsburg", "lat": 40.7081, "lng": -73.9571, "vibe": "creative hub"},
    ],
    "LA": [
        {"name": "Melrose Ave", "lat": 34.0837, "lng": -118.3365, "vibe": "streetwear mecca"},
        {"name": "Venice Beach", "lat": 34.0195, "lng": -118.4912, "vibe": "beach culture"},
        {"name": "Beverly Hills", "lat": 34.0736, "lng": -118.4004, "vibe": "luxury shopping"},
        {"name": "Downtown LA", "lat": 34.0522, "lng": -118.2437, "vibe": "urban core"},
    ],
    "Chicago": [
        {"name": "Magnificent Mile", "lat": 41.8955, "lng": -87.6244, "vibe": "retail corridor"},
        {"name": "Wicker Park", "lat": 41.9073, "lng": -87.6776, "vibe": "artsy neighborhood"},
        {"name": "Lincoln Park", "lat": 41.9243, "lng": -87.6368, "vibe": "trendy area"},
    ]
}

SNEAKER_POSTS = [
    "Just copped these at {location}! The {vibe} here is unmatched 🔥",
    "Spotted someone with heat at {location} - {vibe} bringing out the best fits",
    "Line forming at {location} for the drop! {vibe} energy is crazy right now",
    "Best sneaker shopping at {location} - love the {vibe} of this spot",
    "Random sneaker spotting at {location}. The {vibe} here attracts real collectors",
    "Restocks hitting {location}! Perfect {vibe} for a sneaker hunt",
    "Community meetup at {location} was fire! {vibe} brought everyone together",
    "Grail hunting at {location} - the {vibe} here never disappoints"
]

# Everything the demo replaces, in deletion order: a table comes before the
# tables it references, so clearing never trips a foreign key. Tables whose
# foreign keys are ON DELETE CASCADE need no entry: their rows go with the user.
WIPE_ORDER = (
    Like, Save, Subscription,
    DropZoneCheckIn, DropZoneMember, DropZone,
    Signal, UserSession, LacesLedger,
    Post, Location, User, Release,
)


class SeedRefused(RuntimeError):
    """Seeding is not allowed here: it would delete existing data, or put demo
    accounts into a database that is not a development one."""


def _environment() -> str:
    return os.getenv("ENVIRONMENT", "").strip().lower()


def _is_development() -> bool:
    """Whether ENVIRONMENT names a development environment.

    The same rule as the rest of the application (services.core.security): an
    unset, empty or unknown ENVIRONMENT is treated like production.
    """
    return _environment() in DEVELOPMENT_ENVIRONMENTS


def _clear_or_refuse(db: Session, reset: bool, allow_production: bool) -> None:
    """Delete the rows the demo replaces, or refuse and leave them untouched.

    An empty development database needs no permission. Existing rows are
    deleted only when the caller opted in, and never outside development.
    Outside development even an empty database is only seeded on request: every
    demo account has the same published password.
    """
    existing = {}
    for model in WIPE_ORDER:
        count = db.query(model).count()
        if count:
            existing[model.__tablename__] = count

    found = ", ".join(f"{count} {table}" for table, count in existing.items())
    if not _is_development():
        environment = f"ENVIRONMENT is {_environment()!r}" if _environment() else "ENVIRONMENT is not set"
        development = ", ".join(sorted(DEVELOPMENT_ENVIRONMENTS))
        if existing:
            raise SeedRefused(
                f"Refusing to seed: {environment} and the database already holds data ({found}). "
                f"The demo seed never deletes data outside development (ENVIRONMENT one of: {development})."
            )
        if not allow_production:
            raise SeedRefused(
                f"Refusing to seed: {environment}. Outside development (ENVIRONMENT one of: {development}) "
                "the demo is only seeded on request, because its accounts all share a published password. "
                "Run again with --allow-production (or SEED_ALLOW_PRODUCTION=true) if this database should "
                "hold the demo data anyway."
            )
    if not existing:
        return

    if not reset:
        raise SeedRefused(
            f"Refusing to seed: the database already holds data ({found}) that seeding would delete. "
            "Run again with --reset (or SEED_RESET=true) to delete it and reseed."
        )

    print(f"🧹 Clearing existing data ({found})...")
    for model in WIPE_ORDER:
        db.query(model).delete()
    db.commit()


def seed_data(reset: Optional[bool] = None, allow_production: Optional[bool] = None):
    """
    🌱 Seed Dharma with compelling sneaker community demo data
    Creates a vibrant underground network across major cities

    Existing users, posts and everything that references them are only deleted
    when ``reset`` is true (default: the SEED_RESET env var), and never outside
    a development environment. There, an empty database is only seeded when
    ``allow_production`` is true (default: the SEED_ALLOW_PRODUCTION env var).
    Otherwise SeedRefused is raised and nothing is changed.
    """
    # Check if seeding is enabled
    if os.getenv("AUTO_SEED_DATA", "true").lower() != "true":
        print("🚫 Auto-seeding disabled via AUTO_SEED_DATA env var")
        return

    if reset is None:
        reset = os.getenv("SEED_RESET", "false").lower() == "true"
    if allow_production is None:
        allow_production = os.getenv("SEED_ALLOW_PRODUCTION", "false").lower() == "true"

    print("🌱 Seeding Dharma with sneaker community data...")
    db: Session = SessionLocal()

    try:
        # Clear existing data for fresh demo (only when allowed to)
        _clear_or_refuse(db, reset, allow_production)

        # Create city ambassadors - the faces of each scene
        print("👥 Creating city ambassadors...")
        ambassadors = []
        
        # Boston Ambassador
        boston_ambassador = User(
            username="boston_kicks_og",
            email="boston@dharma.community",
            display_name="Boston Kicks OG",
            avatar_url="https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400",
            password_hash=get_password_hash("dharma2024"),
            is_anonymous=False,
            laces_balance=2500  # Veteran status
        )
        
        # NYC Ambassador  
        nyc_ambassador = User(
            username="nyc_heat_hunter",
            email="nyc@dharma.community", 
            display_name="NYC Heat Hunter",
            avatar_url="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400",
            password_hash=get_password_hash("dharma2024"),
            is_anonymous=False,
            laces_balance=3001  # Top tier
        )
        
        # LA Ambassador
        la_ambassador = User(
            username="la_streetwear_king",
            email="la@dharma.community",
            display_name="LA Streetwear King", 
            avatar_url="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400",
            password_hash=get_password_hash("dharma2024"),
            is_anonymous=False,
            laces_balance=2800
        )
        
        ambassadors = [boston_ambassador, nyc_ambassador, la_ambassador]
        db.add_all(ambassadors)
        db.commit()
        
        for ambassador in ambassadors:
            db.refresh(ambassador)

        # Create diverse community members
        print("🌍 Building the community...")
        users = ambassadors.copy()
        
        # Get counts from env or use defaults
        user_count = int(os.getenv("DEMO_USERS_COUNT", "50"))
        
        for i in range(user_count - 3):  # -3 for ambassadors
            city = random.choice(list(CITY_LOCATIONS.keys()))
            user = User(
                username=f"{fake.user_name()}_{city.lower()}",
                email=fake.email(),
                display_name=fake.name(),
                avatar_url=f"https://images.unsplash.com/photo-{1500000000 + i}?w=400",
                password_hash=get_password_hash("dharma2024"),
                is_anonymous=random.choice([True, False]),
                laces_balance=random.randint(50, 1500)
            )
            users.append(user)
            db.add(user)
        
        db.commit()
        
        # Refresh all users to get their IDs
        for user in users:
            db.refresh(user)

        # Create authentic sneaker community posts across cities
        print("🔥 Generating sneaker community signals...")
        post_count = int(os.getenv("DEMO_POSTS_COUNT", "200"))
        posts_created = 0
        
        # City-specific posts with authentic sneaker culture
        for city, locations in CITY_LOCATIONS.items():
            city_ambassador = next((u for u in ambassadors if city.lower() in u.username), ambassadors[0])
            
            for location in locations:
                # 5-10 posts per location
                for _ in range(random.randint(5, 10)):
                    if posts_created >= post_count:
                        break
                        
                    # Generate authentic sneaker content
                    brand = random.choice(SNEAKER_BRANDS)
                    model = random.choice(SNEAKER_MODELS[brand])
                    colorway = random.choice(SNEAKER_COLORWAYS)
                    sneaker_name = f"{brand} {model} '{colorway}'"
                    
                    post_template = random.choice(SNEAKER_POSTS)
                    content_text = post_template.format(
                        location=location["name"], 
                        vibe=location["vibe"]
                    )
                    
                    # Add sneaker-specific content
                    sneaker_contexts = [
                        f"Someone just walked by in {sneaker_name} - absolute grails! 🔥",
                        f"Restock alert: {sneaker_name} spotted at local spots!",
                        f"The {sneaker_name} hits different in {city} 👟",
                        f"Community W: helped someone LC their {sneaker_name}",
                        f"Grail acquired: finally got the {sneaker_name} 🏆",
                        f"OOTD featuring {sneaker_name} - perfect for {location['vibe']} vibes"
                    ]
                    
                    if random.random() > 0.3:  # 70% chance for sneaker-specific content
                        content_text = random.choice(sneaker_contexts)
                    
                    # Select random user (favor city ambassador 30% of time)
                    if random.random() < 0.3:
                        post_user = city_ambassador
                    else:
                        post_user = random.choice(users)
                    
                    # Add location variation
                    lat_variation = random.uniform(-0.002, 0.002)
                    lng_variation = random.uniform(-0.002, 0.002)
                    
                    signal_content = PostCreate(
                        user_id=post_user.user_id,
                        content_text=content_text,
                        geo_tag_lat=location["lat"] + lat_variation,
                        geo_tag_long=location["lng"] + lng_variation,
                        post_type=random.choice([PostType.SPOTTED, PostType.STOCK_CHECK, PostType.LINE_UPDATE, PostType.GENERAL]),
                        tags=random.sample(SNEAKER_HASHTAGS, k=random.randint(2, 5))
                    )
                    
                    create_location_and_post(db, signal_content, post_user.user_id)
                    posts_created += 1

        # Create upcoming sneaker releases
        print("📅 Adding upcoming drops...")
        release_count = int(os.getenv("DEMO_RELEASES_COUNT", "15"))
        
        for i in range(release_count):
            brand = random.choice(SNEAKER_BRANDS)
            model = random.choice(SNEAKER_MODELS[brand])
            colorway = random.choice(SNEAKER_COLORWAYS)
            
            release = Release(
                sneaker_name=f"{brand} {model} '{colorway}'",
                brand=brand,
                release_date=datetime.now(timezone.utc) + timedelta(days=random.randint(1, 120)),
                retail_price=random.randint(90, 400),
                store_links={
                    "Nike SNKRS": "https://www.nike.com/launch",
                    "Adidas Confirmed": "https://www.adidas.com/confirmed",
                    "Footlocker": "https://www.footlocker.com",
                    "StockX": "https://stockx.com"
                }
            )
            db.add(release)

        # Create some LACES transactions to show tokenomics
        print("🪙 Initializing LACES economy...")
        for user in users[:20]:  # First 20 users get some transaction history
            # Earning LACES for community participation
            earning_transaction = LacesLedger(
                user_id=user.user_id,
                transaction_type=random.choice(['DAILY_STIPEND', 'SIGNAL_REWARD']),
                amount=random.randint(10, 100)
            )
            db.add(earning_transaction)

        db.commit()
        
        print("✅ Dharma seeded successfully!")
        print(f"   👥 {len(users)} community members")
        print(f"   📍 {posts_created} location-based posts")
        print(f"   👟 {release_count} upcoming drops")
        print(f"   🏙️  {len(CITY_LOCATIONS)} cities represented")
        print("🔥 The underground network is alive!")
        
    except SeedRefused:
        db.rollback()
        raise
    except Exception as e:
        print(f"❌ Seeding failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()

def main(argv: Optional[List[str]] = None) -> int:
    """Command line entry point; returns the exit status."""
    parser = argparse.ArgumentParser(description="Seed the database with demo data")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="delete existing users, posts and everything that references them first (development only)",
    )
    parser.add_argument(
        "--allow-production",
        action="store_true",
        help="seed an empty database although ENVIRONMENT is not a development one "
             "(the demo accounts share a published password)",
    )
    args = parser.parse_args(argv)
    try:
        seed_data(
            reset=True if args.reset else None,
            allow_production=True if args.allow_production else None,
        )
    except SeedRefused as refused:
        print(f"🚫 {refused}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
