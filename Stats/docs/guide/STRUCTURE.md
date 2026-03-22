# Project Structure

```
Stats/
├── src/                      # Application source code
│   ├── __init__.py
│   ├── app.py               # Main Flask application
│   ├── config.py            # Configuration constants
│   └── advanced_stats.py    # Advanced statistics calculator
│
├── templates/               # HTML templates
│   ├── base.html
│   ├── dashboard.html
│   ├── games.html
│   ├── players.html
│   ├── trends.html
│   ├── ai-insights.html
│   ├── analysis.html
│   └── roster.html
│
├── static/                  # Static assets (CSS, JS)
│   ├── style.css
│   ├── main.js
│   ├── dashboard.js
│   ├── games.js
│   ├── players.js
│   ├── trends.js
│   ├── ai-insights.js
│   └── service-worker.js
│
├── data/                    # Data files (JSON)
│   ├── .gitkeep
│   ├── vc_stats_output.json
│   ├── roster.json
│   ├── parsed_games.json
│   ├── raw_pdfs.json
│   ├── season_analysis.json
│   └── player_analysis_cache.json
│
├── scripts/                 # Runtime scripts
│   ├── start.sh
│   └── start_with_diagnostics.sh
│
├── docs/                    # Documentation
│   ├── project/             # Project docs (moved from root)
│   │   ├── README.md
│   │   ├── LICENSE
│   │   ├── CHANGELOG.md
│   │   ├── CONTRIBUTING.md
│   │   ├── CONTRIBUTORS.md
│   │   ├── CODE_OF_CONDUCT.md
│   │   └── SECURITY.md
│   ├── archive/
│   │   └── scripts/         # Archived utilities
│   ├── CODE_REVIEW.md
│   ├── DEPLOY.md
│   ├── DEPLOYMENT.md
│   ├── PRODUCTION_FIXES.md
│   ├── OUTPUT_STRUCTURE.md
│   ├── AI_PROMPTS.txt
│   ├── ADVANCED_STATS_API.txt
│   └── schedule.txt
│
├── Stat Sheets/            # Original PDF stat sheets
│   └── Stats/
│
├── main.py                 # Application entry point
├── requirements.txt        # Python dependencies
├── Procfile               # Railway/Heroku deployment config
├── railway.json           # Railway configuration
├── nixpacks.toml          # Nixpacks build configuration
├── runtime.txt            # Python version specification
├── verify_stats_v2.py     # Stats verification utility
└── .gitignore            # Git ignore rules
```

## Running the Application

### Local Development
```bash
python main.py
```

### Production (with Gunicorn)
```bash
gunicorn src.app:app --bind 0.0.0.0:5000
```

### Environment Variables
Create a `.env` file in the project root:
```
OPENAI_API_KEY=your_api_key_here
FLASK_DEBUG=false
PORT=5000
```
