#!/usr/bin/env python3
"""
Quick database connection fix for Railway deployment
This script helps identify and fix common DATABASE_URL issues
"""

import os
import re

def fix_database_url():
    """Check and fix common DATABASE_URL issues"""
    database_url = os.getenv('DATABASE_URL', '')
    
    if not database_url:
        print("❌ DATABASE_URL is not set")
        return None
        
    print(f"Original DATABASE_URL: {database_url}")
    
    # Common fixes
    fixed_url = database_url
    
    # Fix 1: Replace postgres:// with postgresql://
    if fixed_url.startswith('postgres://'):
        fixed_url = fixed_url.replace('postgres://', 'postgresql://', 1)
        print("✅ Fixed postgres:// → postgresql://")
    
    # Fix 2: Remove trailing quotes from database name
    # Pattern: postgresql://user:pass@host:port/dbname' → postgresql://user:pass@host:port/dbname
    fixed_url = re.sub(r"(/[^/]+)'$", r'\1', fixed_url)
    
    # Fix 3: Remove leading quotes from database name
    fixed_url = re.sub(r"(/)('[^/]+)", r'\1\2', fixed_url)
    
    if fixed_url != database_url:
        print(f"Fixed DATABASE_URL: {fixed_url}")
        print("\nTo apply this fix in Railway:")
        print(f"Set DATABASE_URL environment variable to:")
        print(f"  {fixed_url}")
    else:
        print("✅ DATABASE_URL appears to be correctly formatted")
    
    return fixed_url

if __name__ == '__main__':
    fix_database_url()