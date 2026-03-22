# Production Issue: Gunicorn Worker Timeout - FIXED ✅

## Issue
```
[2026-01-11 09:01:13 +0000] [5] [CRITICAL] WORKER TIMEOUT (pid:6)
```

## Root Cause
The `/api/season-analysis` endpoint generates AI analysis for every game in the season by making sequential OpenAI API calls. With 15+ games and ~30 seconds per call, this takes 5-10 minutes, far exceeding the 120-second gunicorn timeout.

## Fixes Applied

### 1. Increased Gunicorn Timeout ✅
**Files Modified**: `Procfile`, `start.sh`

Changed timeout from 120 seconds → 600 seconds (10 minutes)

```bash
# Old
gunicorn app:app --timeout 120

# New  
gunicorn app:app --timeout 600 --keep-alive 5 --max-requests 1000 --max-requests-jitter 50
```

**Additional improvements**:
- `--keep-alive 5`: Prevents connection drops during long requests
- `--max-requests 1000`: Worker recycling to prevent memory leaks
- `--max-requests-jitter 50`: Prevents all workers restarting simultaneously

### 2. Improved Season Analysis Caching ✅
**File Modified**: `app.py`

- **Cache-first approach**: Returns cached results immediately unless `force=true`
- **Logging added**: Track progress through analysis generation
- **Max games limit**: Optional `max_games` parameter to limit analysis scope
- **Better error handling**: Individual game failures don't crash entire process

**Usage**:
```bash
# Get cached results (fast)
GET /api/season-analysis

# Force regenerate (slow, 5-10 minutes)
GET /api/season-analysis?force=true

# Analyze only first 5 games (faster testing)
GET /api/season-analysis?force=true&max_games=5
```

### 3. Added Logging ✅
**File Modified**: `app.py`

Now logs:
- When analysis starts
- Progress through each game
- OpenAI API calls
- Completion status
- Errors

### 4. Configuration Constants ✅
**File Modified**: `config.py`

Added:
```python
GUNICORN_TIMEOUT = 600
GUNICORN_WORKERS = 2
GUNICORN_KEEP_ALIVE = 5
```

## Deployment Steps

1. **Commit changes**:
```bash
git add Procfile start.sh app.py config.py
git commit -m "Fix: Increase gunicorn timeout and improve season analysis caching"
git push
```

2. **Clear existing workers** (Railway will auto-restart):
```bash
# Railway automatically restarts on push
```

3. **Verify deployment**:
```bash
# Check health
curl https://your-app.railway.app/health

# Test cached analysis (should be fast)
curl https://your-app.railway.app/api/season-analysis
```

## Prevention Strategies

### Immediate
- ✅ Cache-first approach implemented
- ✅ Increased timeout to 600s
- ✅ Added logging for monitoring

### Recommended (Future)
1. **Background Job Processing**
   - Use Celery or RQ for long-running tasks
   - Return immediately with job ID
   - Poll for completion

2. **Rate Limiting**
   - Prevent multiple users triggering expensive analysis
   - Use `flask-limiter`

3. **Batch OpenAI Requests**
   - Use OpenAI's batch API when available
   - Reduce sequential calls

4. **Progressive Loading**
   - Return partial results as they complete
   - Use Server-Sent Events (SSE) or WebSockets

## Monitoring

Check logs for these patterns:

### Good (Normal Operation)
```
INFO: Returning cached season analysis
INFO: Analyzing game 5/15: Opponent Name
INFO: Successfully analyzed game 5
```

### Warning Signs
```
WARNING: Force regenerating season analysis - this may take 5-10 minutes
ERROR: Failed to analyze game 10: AI service timeout
CRITICAL: WORKER TIMEOUT
```

## Testing

### Test Long-Running Endpoint
```bash
# Should complete without timeout
time curl -X GET "https://your-app.railway.app/api/season-analysis?force=true&max_games=3"
```

### Test Cache
```bash
# First call (generates cache)
time curl https://your-app.railway.app/api/season-analysis

# Second call (uses cache - should be <1s)
time curl https://your-app.railway.app/api/season-analysis
```

### Clear Cache
```bash
curl -X DELETE https://your-app.railway.app/api/season-analysis
```

## Emergency Rollback

If issues persist:

1. **Quick fix** - Reduce timeout but return error for uncached requests:
```python
if not os.path.exists(ANALYSIS_CACHE_FILE):
    return jsonify({
        'error': 'Analysis not generated yet. Please contact admin.'
    }), 503
```

2. **Disable endpoint** - Comment out the route temporarily

3. **Pre-generate analysis** - Run locally and commit cache file:
```bash
# Local
python -c "import requests; requests.get('http://localhost:5000/api/season-analysis?force=true')"
git add season_analysis.json
git commit -m "Add pre-generated season analysis"
git push
```

## Configuration Summary

| Setting | Old Value | New Value | Reason |
|---------|-----------|-----------|--------|
| Timeout | 120s | 600s | Allow long AI analysis |
| Keep-Alive | Default (2s) | 5s | Prevent connection drops |
| Max Requests | Infinite | 1000 | Prevent memory leaks |
| Caching | Optional | Cache-first | Reduce API calls |

## Related Files
- ✅ `Procfile` - Gunicorn configuration
- ✅ `start.sh` - Startup script
- ✅ `app.py` - Season analysis endpoint
- ✅ `config.py` - Configuration constants
- ✅ `CODE_REVIEW.md` - Full code review
