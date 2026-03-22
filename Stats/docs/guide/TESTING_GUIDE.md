# Quick Test Guide - AI Data Access

## Quick Test: Verify AI Can See New Games

### Step 1: Check Current State
1. Open the app: `http://localhost:5000`
2. Go to AI Insights
3. Ask: "How many games have we played?"
4. Note the number

### Step 2: Add Test Data (Optional)
If you want to test with actual new data:
1. Open `data/vc_stats_output.json`
2. Add a new game entry (or modify existing data)
3. Save the file

### Step 3: Reload Data
**Option A - Using the UI (Recommended)**
1. Click the **🔄 Reload Data** button in the navigation bar
2. Wait for "✓ Reloaded!" message
3. Page will automatically refresh

**Option B - Using API**
```powershell
Invoke-WebRequest -Uri "http://localhost:5000/api/reload-data" -Method POST
```

### Step 4: Verify AI Sees New Data
1. Go back to AI Insights
2. Ask the same question again: "How many games have we played?"
3. ✅ Number should reflect the updated data

## Quick Test: Player Stats Update

### Test Command
```powershell
# Ask AI about a player before reload
# Update player stats in data file
# Click Reload Data button
# Ask AI about same player after reload
# Should see updated stats
```

## Expected Behavior

### Before Reload
- AI sees data from when app was started or last reloaded
- Old game count
- Old player stats

### After Reload
- AI sees current data from JSON files
- Updated game count
- Updated player stats
- All AI features use fresh data:
  - AI Chat ✓
  - Player Insights ✓
  - Game Analysis ✓
  - Team Summary ✓
  - Season Analysis ✓

## Troubleshooting

### Button doesn't work
- Check browser console for errors (F12)
- Verify endpoint is available: `curl http://localhost:5000/health`

### AI still sees old data
1. Hard refresh the page (Ctrl+Shift+R)
2. Check if data files were actually updated
3. Verify file paths in config match your data files

### Cache not clearing
- Manually delete cache files:
  - `instance/team_summary_cache.json`
  - `instance/season_analysis_cache.json`

## Manual Testing Checklist

- [ ] Reload button appears in navigation
- [ ] Button shows loading state when clicked
- [ ] Page refreshes after reload
- [ ] AI Chat sees new data
- [ ] Player Insights reflects updates
- [ ] Game Analysis includes new games
- [ ] Team stats are current
- [ ] No errors in browser console
- [ ] No errors in server logs

## API Testing

### Health Check
```powershell
Invoke-WebRequest -Uri "http://localhost:5000/health"
```
Expected: Shows current game and player counts

### Reload Data
```powershell
Invoke-WebRequest -Uri "http://localhost:5000/api/reload-data" -Method POST
```
Expected: Returns success message with counts

### Query AI After Reload
```powershell
$body = @{
    message = "How many games have we played this season?"
    history = @()
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:5000/api/ai/chat" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body
```
Expected: AI responds with current game count
