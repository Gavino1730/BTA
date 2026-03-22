#!/usr/bin/env python3
"""
Railway deployment diagnostic script
Run this on Railway to diagnose database connection issues
"""

import os
import sys
import json
from datetime import datetime

def check_environment():
    """Check Railway environment and database configuration"""
    print("🚂 Railway Database Connection Diagnostic")
    print("=" * 50)
    
    # Check environment variables
    database_url = os.getenv('DATABASE_URL')
    railway_env = os.getenv('RAILWAY_ENVIRONMENT')
    port = os.getenv('PORT')
    
    print(f"Railway Environment: {railway_env or 'Not detected'}")
    print(f"Port: {port or 'Not set'}")
    print(f"DATABASE_URL set: {'✅ Yes' if database_url else '❌ No'}")
    
    if database_url:
        # Parse database URL safely
        try:
            from urllib.parse import urlparse
            parsed = urlparse(database_url)
            
            print("\n📊 Database URL Analysis:")
            print(f"   Scheme: {parsed.scheme}")
            print(f"   Host: {parsed.hostname}")
            print(f"   Port: {parsed.port}")
            print(f"   Database: '{parsed.path.lstrip('/')}'")
            print(f"   User: {parsed.username}")
            
            # Check for common issues
            db_name = parsed.path.lstrip('/')
            if not db_name:
                print("❌ ERROR: Database name is empty!")
            elif db_name.endswith("'"):
                print(f"❌ ERROR: Database name has trailing quote: '{db_name}'")
                print(f"   Should be: '{db_name.rstrip(chr(39))}'")
            elif db_name.startswith("'"):
                print(f"❌ ERROR: Database name has leading quote: '{db_name}'") 
                print(f"   Should be: '{db_name.lstrip(chr(39))}'")
            else:
                print("✅ Database name looks correct")
                
            if parsed.scheme == 'postgres':
                print("⚠️  WARNING: URL uses postgres:// instead of postgresql://")
                print("   This is automatically fixed by the app")
            elif parsed.scheme == 'postgresql':
                print("✅ Database scheme is correct")
            else:
                print(f"❌ ERROR: Unknown database scheme: {parsed.scheme}")
                
        except Exception as e:
            print(f"❌ ERROR parsing DATABASE_URL: {str(e)}")
    
    return database_url

def test_app_import():
    """Test if the Flask app can be imported and configured"""
    print("\n🐍 Testing App Import...")
    
    try:
        # Add src to path
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
        
        from flask import Flask
        from config import Config
        print("✅ Successfully imported Flask and Config")
        
        # Test config
        app = Flask(__name__)
        app.config.from_object(Config)
        
        db_uri = app.config.get('SQLALCHEMY_DATABASE_URI')
        print(f"✅ App configured with database: {db_uri[:50]}...")
        
        # Test database import
        from models import db
        db.init_app(app)
        print("✅ Database models imported successfully")
        
        return True
        
    except Exception as e:
        print(f"❌ ERROR importing app: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_database_connection():
    """Test database connection"""
    print("\n🔌 Testing Database Connection...")
    
    try:
        from flask import Flask
        from models import db
        from config import Config
        
        app = Flask(__name__)
        app.config.from_object(Config)
        
        with app.app_context():
            db.init_app(app)
            
            # Try to execute a simple query
            from sqlalchemy import text
            result = db.session.execute(text('SELECT 1 as test'))
            test_value = result.fetchone()[0]
            
            if test_value == 1:
                print("✅ Database connection successful!")
                
                # Try to create tables
                print("📋 Creating tables...")
                db.create_all()
                print("✅ Tables created successfully")
                
                # Count existing data
                from models import Game, Player, PlayerGameStats, SeasonStats
                games = Game.query.count()
                players = Player.query.count()
                stats = PlayerGameStats.query.count()
                season_stats = SeasonStats.query.count()
                
                print(f"📊 Current data:")
                print(f"   Games: {games}")
                print(f"   Players: {players}")
                print(f"   Player Game Stats: {stats}")
                print(f"   Season Stats: {season_stats}")
                
                if games == 0 and players == 0:
                    print("\n💡 Database is empty. You need to run migration:")
                    print("   python scripts/production_migrate.py")
                
                return True
            else:
                print("❌ Database test query returned unexpected result")
                return False
                
    except Exception as e:
        print(f"❌ Database connection failed: {str(e)}")
        
        error_str = str(e).lower()
        if "does not exist" in error_str:
            print("\n💡 SOLUTION: The database doesn't exist.")
            print("   Contact Railway support or check your PostgreSQL service.")
            print("   The database should be created automatically by the PostgreSQL service.")
        elif "connection refused" in error_str:
            print("\n💡 SOLUTION: Can't connect to PostgreSQL server.")
            print("   Check if your PostgreSQL service is running in Railway.")
        elif "authentication failed" in error_str:
            print("\n💡 SOLUTION: Authentication failed.")
            print("   Check if your DATABASE_URL has correct username/password.")
        
        return False

def main():
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"Python version: {sys.version}")
    print(f"Working directory: {os.getcwd()}")
    
    # Check environment
    database_url = check_environment()
    
    if not database_url:
        print("\n❌ Cannot proceed without DATABASE_URL")
        print("   This should be automatically set by Railway's PostgreSQL service")
        return False
    
    # Test app import
    if not test_app_import():
        print("\n❌ Cannot proceed - app import failed")
        return False
    
    # Test database connection
    if not test_database_connection():
        print("\n❌ Database connection failed")
        return False
    
    print("\n🎉 All checks passed!")
    print("   Your database connection is working correctly.")
    print("   If your app is still not working, check the application logs.")
    
    return True

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)