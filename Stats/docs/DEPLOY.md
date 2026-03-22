# Quick Deploy Guide - Worker Timeout Fix

## ✅ Changes Made
- [x] Increased gunicorn timeout: 120s → 600s
- [x] Added worker recycling: `--max-requests 1000`
- [x] Added keep-alive: `--keep-alive 5`
- [x] Improved season analysis caching (cache-first)
- [x] Added logging throughout
- [x] Added `max_games` parameter for testing

## 📦 Files Changed
- `Procfile` - Gunicorn config
- `start.sh` - Startup script  
- `app.py` - Season analysis improvements
- `config.py` - New timeout constants
- `PRODUCTION_FIXES.md` - Full documentation
- `CODE_REVIEW.md` - Complete code review

## 🚀 Deploy Now

```bash
# 1. Review changes
git status

# 2. Commit
git add .
git commit -m "Fix: Worker timeout - increase to 600s and improve caching"

# 3. Push to Railway
git push

# 4. Monitor deployment
# Railway will automatically restart with new settings
```

## 🧪 Test After Deploy

```bash
# Replace YOUR_APP_URL with your actual Railway URL
APP_URL="https://your-app.railway.app"

# 1. Health check
curl $APP_URL/health

# 2. Test cached analysis (should be fast)
time curl $APP_URL/api/season-analysis

# 3. Test single player endpoint
curl $APP_URL/api/players

# 4. Check advanced stats
curl $APP_URL/api/advanced/volatility
```

## 📊 Expected Results

### Before Fix
```
❌ WORKER TIMEOUT after 120s
❌ Season analysis crashes
❌ No logging
```

### After Fix
```
✅ 600s timeout (10 minutes)
✅ Cache-first approach (instant response)
✅ Detailed logging
✅ Graceful error handling
✅ Worker recycling every 1000 requests
```

## 🔍 Monitor Logs

In Railway dashboard, watch for:
- ✅ "Returning cached season analysis"
- ✅ "Analyzing game X/Y"  
- ✅ "Successfully analyzed game X"
- ❌ "WORKER TIMEOUT" (should not appear)

## ⚠️ If Timeout Still Occurs

1. Check if analysis is being regenerated:
   ```bash
   # Should be fast (cached)
   curl $APP_URL/api/season-analysis
   ```

2. Clear cache and let it regenerate once:
   ```bash
   curl -X DELETE $APP_URL/api/season-analysis
   # Wait 5-10 minutes
   curl $APP_URL/api/season-analysis?force=true
   ```

3. If still failing, pre-generate locally:
   ```bash
   # Run locally first
   python app.py
   # In another terminal:
   curl http://localhost:5000/api/season-analysis?force=true
   # Commit the cache file
   git add season_analysis.json
   git commit -m "Add pre-generated cache"
   git push
   ```

## 📝 Notes

- First request after deploy may take 5-10 minutes IF cache is missing
- All subsequent requests will be instant (< 1 second)
- Workers restart every 1000 requests to prevent memory issues
- Cache persists across deployments in Railway
