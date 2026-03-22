"""
Valley Catholic Basketball Stats Application
"""

__version__ = "2.0.0"

from src.app import app
from src.config import Config
from src.data_manager import get_data_manager
from src.ai_service import get_ai_service
from src.advanced_stats import AdvancedStatsCalculator

__all__ = [
    "app",
    "Config",
    "get_data_manager",
    "get_ai_service",
    "AdvancedStatsCalculator",
]
