# Database Connection Troubleshooting Guide

## Problem: PostgreSQL Database Connection Error

**Error**: `FATAL: database "railway'" does not exist`

## Root Cause
The PostgreSQL server is running correctly, but the database that your application is trying to connect to doesn't exist, or there's a formatting issue in the DATABASE_URL.

## Quick Fix Steps

### 1. Check DATABASE_URL Format
Run the database URL checker:
```bash
python docs/archive/scripts/fix_database_url.py
```

### 2. Diagnose and Setup Database
Run the diagnostic tool:
```bash
python docs/archive/scripts/database_setup.py
```

This will:
- ✅ Parse and validate your DATABASE_URL
- ✅ Test connection to PostgreSQL server
- ✅ Create the database if it doesn't exist
- ✅ Initialize database tables
- ✅ Verify setup

### 3. Populate Database with Data
After successful setup, run migration:
```bash
python docs/archive/scripts/production_migrate.py
```

### 4. Verify Everything Works
Check the health endpoint:
```bash
curl https://your-app-url/health
```

## Common Issues & Solutions

### Issue 1: Database Name Has Quotes
**Problem**: DATABASE_URL ends with `database'` instead of `database`
**Solution**: Remove the trailing quote from DATABASE_URL in Railway environment variables

### Issue 2: Wrong Database Scheme
**Problem**: URL starts with `postgres://` instead of `postgresql://`
**Solution**: This is automatically fixed in config.py, but double-check your URL

### Issue 3: Database Doesn't Exist
**Problem**: PostgreSQL server is running but target database doesn't exist
**Solution**: Run `database_setup.py` which will offer to create it

### Issue 4: Connection Timeout
**Problem**: Can't connect to PostgreSQL server
**Solution**: Check if Railway PostgreSQL service is running

## Railway-Specific Instructions

### In Railway Dashboard:
1. Go to your project
2. Click on Variables tab
3. Check DATABASE_URL value:
   - Should look like: `postgresql://username:password@hostname:port/database`
   - Should NOT have extra quotes or special characters
4. If DATABASE_URL looks wrong, get the correct one from your PostgreSQL service

### Getting Correct DATABASE_URL from Railway:
1. Go to your PostgreSQL service in Railway
2. Click "Connect" tab
3. Copy the "Postgres Connection URL"
4. Use this as your DATABASE_URL

## Testing Locally

To test database connection locally:
```bash
# Set DATABASE_URL (replace with your actual URL)
$env:DATABASE_URL = "postgresql://username:password@hostname:port/database"

# Test connection
python docs/archive/scripts/database_setup.py

# Run app locally
python app.py
```

## Verification Commands

### Check if PostgreSQL service is running:
```bash
# In Railway logs, look for:
# "database system is ready to accept connections"
```

### Test your app health:
```bash
curl https://your-app-url/health
```

### Expected healthy response:
```json
{
  "status": "healthy",
  "database": "connected",
  "database_type": "postgresql",
  "games_loaded": 20,
  "players_loaded": 15,
  "player_game_stats": 300,
  "season_stats": 1
}
```

## Need More Help?

1. **Check Railway Logs**: Look for detailed error messages
2. **Run Local Tests**: Use the diagnostic scripts provided
3. **Verify Environment**: Ensure DATABASE_URL is correctly set
4. **Check PostgreSQL Service**: Ensure it's running and accessible

The scripts provided will handle most common issues automatically. If you're still having problems after running them, the error messages will be more specific and easier to debug.