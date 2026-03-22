#!/usr/bin/env python3
"""
Production migration script
Run this on your production server after deployment to populate the PostgreSQL database
"""

import os
import sys
import json
from datetime import datetime

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from flask import Flask
from models import db, Game, Player, PlayerGameStats, SeasonStats
from config import Config

def create_app():
    """Create Flask app for production migration"""
    app = Flask(__name__)
    app.config.from_object(Config)
    
    # Ensure we're using the production database
    if not app.config.get('SQLALCHEMY_DATABASE_URI') or 'sqlite' in app.config['SQLALCHEMY_DATABASE_URI']:
        print("❌ ERROR: No PostgreSQL DATABASE_URL found in environment")
        print("   Set DATABASE_URL environment variable to your PostgreSQL connection string")
        sys.exit(1)
    
    print(f"📊 Using database: {app.config['SQLALCHEMY_DATABASE_URI'][:50]}...")
    db.init_app(app)
    return app

def load_json_data():
    """Load existing JSON data"""
    print("Loading JSON data...")
    
    # Check if JSON files exist
    stats_file = 'data/vc_stats_output.json'
    roster_file = 'data/roster.json'
    
    if not os.path.exists(stats_file):
        print(f"❌ ERROR: {stats_file} not found")
        print("   Make sure you're running this from the project root directory")
        sys.exit(1)
    
    if not os.path.exists(roster_file):
        print(f"❌ ERROR: {roster_file} not found")
        sys.exit(1)
    
    # Load main stats data
    with open(stats_file, 'r') as f:
        stats_data = json.load(f)
    
    # Load roster data
    with open(roster_file, 'r') as f:
        roster_data = json.load(f)
    
    print(f"✅ Loaded {len(stats_data.get('games', []))} games")
    print(f"✅ Loaded {len(stats_data.get('season_player_stats', {}))} players")
    print(f"✅ Loaded {len(roster_data.get('roster', []))} roster entries")
    
    return stats_data, roster_data

def migrate_data(stats_data, roster_data):
    """Run the full migration"""
    try:
        # Create all tables
        print("\n📋 Creating database tables...")
        db.create_all()
        print("✅ Tables created")
        
        # Check if data already exists
        existing_players = Player.query.count()
        existing_games = Game.query.count()
        
        if existing_players > 0 or existing_games > 0:
            response = input(f"\n⚠️  Database already contains {existing_players} players and {existing_games} games.\n   Continue and update existing data? (y/N): ")
            if response.lower() != 'y':
                print("Migration cancelled")
                return False
        
        # Run migration (import the functions from the original script)
        from migrate_to_db import migrate_players, migrate_games, migrate_season_stats
        
        migrate_players(stats_data, roster_data)
        migrate_games(stats_data)
        migrate_season_stats(stats_data)
        
        print("\n✅ Migration completed successfully!")
        
        # Verify migration
        print("\n📊 Final verification:")
        print(f"   Players: {Player.query.count()}")
        print(f"   Games: {Game.query.count()}")
        print(f"   Player Game Stats: {PlayerGameStats.query.count()}")
        print(f"   Season Stats: {SeasonStats.query.count()}")
        
        print("\n🎉 Your application is now running with PostgreSQL!")
        print("   Check the /health endpoint to verify everything is working.")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        print("   Rolling back changes...")
        db.session.rollback()
        return False

def main():
    """Main production migration function"""
    print("🚀 Starting PRODUCTION database migration...")
    print("=" * 60)
    
    # Create app and migrate
    app = create_app()
    
    with app.app_context():
        # Load data
        stats_data, roster_data = load_json_data()
        
        # Run migration
        success = migrate_data(stats_data, roster_data)
        
        if success:
            print("\n" + "=" * 60)
            print("🎉 PRODUCTION MIGRATION COMPLETE!")
            print("   Your basketball stats app is ready to go!")
        else:
            print("\n" + "=" * 60)
            print("❌ MIGRATION FAILED")
            sys.exit(1)

if __name__ == '__main__':
    main()