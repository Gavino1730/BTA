"""
Configuration for Basketball Stats Application
All settings centralized here for easy maintenance.
"""

import os
from dotenv import load_dotenv

APP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MONOREPO_ROOT = os.path.dirname(APP_ROOT)

# Prefer the monorepo root .env so stats behaves like a first-class app.
load_dotenv(os.path.join(MONOREPO_ROOT, ".env"))
load_dotenv(os.path.join(APP_ROOT, ".env"))


class Config:
    """Application configuration"""

    # ==========================================================================
    # Database
    # ==========================================================================
    DATABASE_URL = os.getenv("DATABASE_URL")
    if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

    # ==========================================================================
    # OpenAI
    # ==========================================================================
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
    OPENAI_MODEL = "gpt-4o-mini"
    OPENAI_TIMEOUT = 30
    
    @classmethod
    def is_openai_configured(cls) -> bool:
        """Check if OpenAI is configured without exposing the key"""
        return bool(cls.OPENAI_API_KEY and len(cls.OPENAI_API_KEY) > 20)
    
    @classmethod
    def get_masked_api_key(cls) -> str:
        """Return a masked version of the API key for logging"""
        if not cls.OPENAI_API_KEY:
            return "Not configured"
        return f"{cls.OPENAI_API_KEY[:8]}...{cls.OPENAI_API_KEY[-4:] if len(cls.OPENAI_API_KEY) > 12 else ''}"

    # ==========================================================================
    # Flask
    # ==========================================================================

    # ==========================================================================
    # File Paths
    # ==========================================================================
    PROJECT_ROOT = APP_ROOT
    DATA_DIR = os.path.join(PROJECT_ROOT, "data")

    STATS_FILE = os.path.join(DATA_DIR, "vc_stats_output.json")
    ROSTER_FILE = os.path.join(DATA_DIR, "roster.json")
    ANALYSIS_CACHE = os.path.join(DATA_DIR, "season_analysis.json")
    PLAYER_CACHE = os.path.join(DATA_DIR, "player_analysis_cache.json")
    TEAM_CACHE = os.path.join(DATA_DIR, "team_summary.json")


# Players excluded from analysis (comma-separated names in EXCLUDED_PLAYERS env var)
_excluded_env = os.getenv("EXCLUDED_PLAYERS", "")
EXCLUDED_PLAYERS = {name.strip() for name in _excluded_env.split(",") if name.strip()}

# ==========================================================================
# Token Limits
# ==========================================================================
MAX_TOKENS = {
    "chat": 1000,
    "player": 800,
    "game": 1000,
    "team": 2000,
    "season": 2000,
}

# ==========================================================================
# Validation
# ==========================================================================
MAX_PLAYER_NAME_LENGTH = 100
MAX_QUERY_LENGTH = 1000
MAX_HISTORY_LENGTH = 20
