"""
Configuration for Valley Catholic Basketball Stats Application
All settings centralized here for easy maintenance.
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Application configuration"""

    # ==========================================================================
    # Database
    # ==========================================================================
    DATABASE_URL = os.getenv("DATABASE_URL")
    if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

    SQLALCHEMY_DATABASE_URI = DATABASE_URL or "sqlite:///basketball_stats.db"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    if not DATABASE_URL and os.getenv("RAILWAY_ENVIRONMENT"):
        raise ValueError("DATABASE_URL required in production!")

    if DATABASE_URL and "postgres" in DATABASE_URL:
        SQLALCHEMY_ENGINE_OPTIONS = {
            "pool_pre_ping": True,
            "pool_recycle": 300,
            "connect_args": {"connect_timeout": 10, "sslmode": "prefer"},
        }
    else:
        SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

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
    JSON_SORT_KEYS = False
    SEND_FILE_MAX_AGE_DEFAULT = 31536000

    # ==========================================================================
    # File Paths
    # ==========================================================================
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DATA_DIR = os.path.join(PROJECT_ROOT, "data")

    STATS_FILE = os.path.join(DATA_DIR, "vc_stats_output.json")
    ROSTER_FILE = os.path.join(DATA_DIR, "roster.json")
    ANALYSIS_CACHE = os.path.join(DATA_DIR, "season_analysis.json")
    PLAYER_CACHE = os.path.join(DATA_DIR, "player_analysis_cache.json")
    TEAM_CACHE = os.path.join(DATA_DIR, "team_summary.json")


# ==========================================================================
# Basketball Constants
# ==========================================================================
FREE_THROW_POSSESSION_FACTOR = 0.44
THREE_POINT_MULTIPLIER = 0.5
PRIMARY_SCORER_THRESHOLD = 20.0
SECONDARY_SCORER_THRESHOLD = 10.0
TURNOVER_THRESHOLD = 13
FG_PERCENTAGE_THRESHOLD = 44.0
MIN_GAMES_FOR_VARIANCE = 2

# Players excluded from analysis
EXCLUDED_PLAYERS = {"Matthew Gunther", "Liam Plep", "Gavin Galan", "Kye Fixter"}

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
