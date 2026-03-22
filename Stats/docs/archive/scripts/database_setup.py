#!/usr/bin/env python3
"""
Database connection diagnostic and setup script
Run this to diagnose database connection issues and initialize the database
"""

import os
import sys
import psycopg2
from urllib.parse import urlparse

# Add src to path  
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

def parse_database_url(database_url):
    """Parse and validate DATABASE_URL"""
    if not database_url:
        return None, "DATABASE_URL environment variable is not set"
    
    try:
        parsed = urlparse(database_url)
        
        if not parsed.scheme.startswith('postgres'):
            return None, f"Invalid database scheme: {parsed.scheme}. Expected postgresql:// or postgres://"
        
        # Extract components
        components = {
            'host': parsed.hostname,
            'port': parsed.port or 5432,
            'database': parsed.path.lstrip('/'),
            'user': parsed.username,
            'password': parsed.password
        }
        
        print(f"✅ Database URL parsed successfully:")
        print(f"   Host: {components['host']}")
        print(f"   Port: {components['port']}")
        print(f"   Database: '{components['database']}'")
        print(f"   User: {components['user']}")
        
        # Check for common issues
        issues = []
        if not components['database']:
            issues.append("Database name is empty")
        if components['database'].endswith("'") or components['database'].startswith("'"):
            issues.append(f"Database name contains quotes: '{components['database']}'")
        if not components['host']:
            issues.append("Host is missing")
        if not components['user']:
            issues.append("Username is missing")
        if not components['password']:
            issues.append("Password is missing")
            
        if issues:
            return components, "Issues found: " + ", ".join(issues)
        
        return components, None
        
    except Exception as e:
        return None, f"Failed to parse DATABASE_URL: {str(e)}"

def test_connection(components):
    """Test database connection"""
    try:
        print(f"\n🔌 Testing connection to {components['host']}:{components['port']}...")
        
        # Connect to PostgreSQL server (not a specific database)
        conn = psycopg2.connect(
            host=components['host'],
            port=components['port'],
            user=components['user'],
            password=components['password'],
            database='postgres',  # Connect to default postgres database first
            sslmode='prefer'
        )
        
        print("✅ Successfully connected to PostgreSQL server")
        
        # Check if target database exists
        cursor = conn.cursor()
        cursor.execute("SELECT datname FROM pg_catalog.pg_database WHERE datname = %s", 
                      (components['database'],))
        db_exists = cursor.fetchone()
        
        if db_exists:
            print(f"✅ Database '{components['database']}' exists")
        else:
            print(f"❌ Database '{components['database']}' does not exist")
            
            # Offer to create it
            response = input(f"\nWould you like to create database '{components['database']}'? (y/N): ")
            if response.lower() == 'y':
                cursor.execute(f'CREATE DATABASE "{components["database"]}"')
                print(f"✅ Created database '{components['database']}'")
        
        cursor.close()
        conn.close()
        
        # Now test connection to the target database
        conn = psycopg2.connect(
            host=components['host'],
            port=components['port'],
            user=components['user'],
            password=components['password'],
            database=components['database'],
            sslmode='prefer'
        )
        
        print(f"✅ Successfully connected to database '{components['database']}'")
        conn.close()
        
        return True
        
    except psycopg2.OperationalError as e:
        print(f"❌ Connection failed: {str(e)}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {str(e)}")
        return False

def initialize_database():
    """Initialize database tables"""
    try:
        from flask import Flask
        from models import db
        from config import Config
        
        app = Flask(__name__)
        app.config.from_object(Config)
        
        with app.app_context():
            db.init_app(app)
            
            print("\n📋 Creating database tables...")
            db.create_all()
            print("✅ Tables created successfully")
            
            # Check tables
            from sqlalchemy import text
            result = db.session.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                ORDER BY table_name
            """))
            
            tables = [row[0] for row in result]
            print(f"✅ Created tables: {', '.join(tables)}")
            
        return True
        
    except Exception as e:
        print(f"❌ Failed to initialize database: {str(e)}")
        return False

def main():
    print("🔍 Basketball Stats Database Diagnostic Tool")
    print("=" * 50)
    
    # Get DATABASE_URL
    database_url = os.getenv('DATABASE_URL')
    
    if not database_url:
        print("❌ DATABASE_URL environment variable is not set")
        print("\nFor Railway deployment, this should be automatically set.")
        print("For local testing, you can set it manually:")
        print("$env:DATABASE_URL='postgresql://user:password@host:port/database'")
        return False
    
    # Parse and validate URL
    components, error = parse_database_url(database_url)
    if error:
        print(f"❌ {error}")
        return False
    
    # Test connection
    if not test_connection(components):
        return False
    
    # Initialize database
    if not initialize_database():
        return False
    
    print("\n🎉 Database setup completed successfully!")
    print("\nNext steps:")
    print("1. Run the migration script to populate with data:")
    print("   python scripts/production_migrate.py")
    print("2. Test your application")
    
    return True

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)