# Data Reload Feature

## Overview
The application now has a **data reload feature** that ensures the AI can always see the latest game stats and player data, even for newly added games.

## How It Works

### Automatic Data Loading
- When the app starts, it loads all stats from the JSON data files
- The AI service uses this data for all analysis and insights

### Manual Data Reload
When you add new games or update player stats in the data files, you have two options:

#### Option 1: Use the Reload Button (Recommended)
1. Click the **🔄 Reload Data** button in the navigation bar
2. The app will:
   - Reload all stats from the JSON files
   - Clear AI caches (so new analysis is generated)
   - Refresh the current page with new data
3. All AI features will now see the new games and updated player stats

#### Option 2: Restart the App
- Simply restart the Flask application
- The app will load the latest data on startup

### API Endpoint
You can also trigger a reload programmatically:

```bash
# PowerShell
Invoke-WebRequest -Uri "http://localhost:5000/api/reload-data" -Method POST

# curl
curl -X POST http://localhost:5000/api/reload-data
```

## What Gets Reloaded

✅ All game data  
✅ All player stats  
✅ Season statistics  
✅ Player game logs  
✅ Roster information  
✅ Advanced stats calculations  

## What Gets Cleared

When data is reloaded, these caches are automatically cleared:
- AI team summary cache
- AI season analysis cache

This ensures fresh AI analysis is generated using the new data.

## AI Features That Benefit

After reloading data, these AI features will see all new information:

1. **AI Chat** - Access to all current stats for conversation
2. **Player Insights** - Analysis includes latest game performances
3. **Game Analysis** - Can analyze newly added games
4. **Team Summary** - Regenerated with complete current data
5. **Season Analysis** - Includes all games up to date
6. **Trends Analysis** - Uses full dataset including new games

## Best Practices

1. **After Adding Games**: Always reload data so AI sees new games
2. **Before AI Analysis**: Reload if you've recently updated data files
3. **Regular Updates**: Consider reloading after bulk data updates
4. **No Performance Impact**: Reload is fast and doesn't interrupt ongoing operations

## Technical Details

### Data Sources
- Primary stats file: `data/vc_stats_output.json`
- Roster file: `data/roster.json`
- Additional data files in the `data/` directory

### Implementation
- `DataManager.reload()` - Refreshes data from files
- `AdvancedStatsCalculator` - Reinitializes with fresh data
- `build_stats_context()` - Always uses current data from DataManager

### No Caching Issues
The AI context builder (`build_stats_context`) doesn't cache data itself - it always queries the DataManager's current data. This means once you reload, all AI queries immediately see the new data.
