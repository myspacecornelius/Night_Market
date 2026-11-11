#!/usr/bin/env python3
"""
Seed script for Sprint 1 demo data
Run this after migrations to populate the database with demo data
"""
import sys
import os
# Make the "services" package importable however the script is started
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.admin.drop_importer import seed_demo_data

def main():
    """Seed the database with Sprint 1 demo data"""
    print("🌱 Seeding Sprint 1 demo data...")
    print("📍 This will create stores and drops for Boston, NYC, LA, and Chicago")
    
    try:
        result = seed_demo_data()
        
        if result["success"]:
            print("✅ Demo data seeded successfully!")
            print(f"📊 Created {result['imported_stores']} stores")
            print(f"👟 Created {result['imported_drops']} drops")
            print(f"🔗 Created {result['linked_drop_stores']} drop-store links")
            
            if result["errors"]:
                print("⚠️ Some errors occurred:")
                for error in result["errors"]:
                    print(f"   - {error}")
                sys.exit(1)
        else:
            print("❌ Failed to seed demo data:")
            print(f"   Error: {result.get('error', 'Unknown error')}")
            if result.get("errors"):
                for error in result["errors"]:
                    print(f"   - {error}")
            sys.exit(1)
            
    except Exception as e:
        print(f"❌ Fatal error during seeding: {e}")
        sys.exit(1)
    
    print("\n🎉 Sprint 1 setup complete!")
    print("🚀 You can now:")
    print("   - Create signals via POST /v1/signals")
    print("   - View drops via GET /v1/drops") 
    print("   - Find stores via GET /v1/stores")
    print("   - See heatmap data via GET /v1/signals/heatmap")
    print("   - Check drop calendars via GET /v1/drops/calendar/{city}")

if __name__ == "__main__":
    main()