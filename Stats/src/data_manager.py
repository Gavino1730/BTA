"""
Data loading and management for basketball stats
"""

import json
import logging
from typing import Dict, Any, Optional
from src.config import Config

logger = logging.getLogger(__name__)


class DataManager:
    """Handles all data loading and caching"""

    def __init__(self):
        self.stats_data = self._load_stats()
        self.roster_data = self._load_roster()

    def reload(self):
        """Reload all data from files - call this when data is updated"""
        logger.info("Reloading data from files...")
        self.stats_data = self._load_stats()
        self.roster_data = self._load_roster()
        logger.info("Data reload complete")

    def _load_stats(self) -> Dict[str, Any]:
        """Load stats data from JSON file"""
        try:
            with open(Config.STATS_FILE) as f:
                data = json.load(f)
            logger.info(f"Loaded {len(data.get('games', []))} games")
            return data
        except FileNotFoundError:
            logger.error(f"Stats file not found: {Config.STATS_FILE}")
            return self._empty_stats()
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in stats file: {e}")
            return self._empty_stats()
        except PermissionError as e:
            logger.error(f"Permission denied reading stats file: {e}")
            return self._empty_stats()
        except OSError as e:
            logger.error(f"OS error reading stats file: {e}")
            return self._empty_stats()

    def _load_roster(self) -> Dict[str, Any]:
        """Load roster data from JSON file"""
        try:
            with open(Config.ROSTER_FILE) as f:
                return json.load(f)
        except FileNotFoundError:
            logger.warning(f"Roster file not found: {Config.ROSTER_FILE}")
            return {"roster": []}
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in roster file: {e}")
            return {"roster": []}
        except PermissionError as e:
            logger.error(f"Permission denied reading roster file: {e}")
            return {"roster": []}
        except OSError as e:
            logger.error(f"OS error reading roster file: {e}")
            return {"roster": []}

    @staticmethod
    def _empty_stats() -> Dict[str, Any]:
        """Return empty stats structure"""
        return {
            "games": [],
            "season_team_stats": {},
            "season_player_stats": {},
            "player_game_logs": {},
        }

    @property
    def games(self):
        return self.stats_data.get("games", [])

    @property
    def season_team_stats(self):
        return self.stats_data.get("season_team_stats", {})

    @property
    def season_player_stats(self):
        return self.stats_data.get("season_player_stats", {})

    @property
    def player_game_logs(self):
        return self.stats_data.get("player_game_logs", {})

    @property
    def roster(self):
        return self.roster_data.get("roster", [])

    def get_roster_dict(self) -> Dict[str, Any]:
        """Get roster as a dictionary keyed by player name"""
        return {p["name"]: p for p in self.roster}

    def get_game_by_id(self, game_id: int) -> Optional[Dict[str, Any]]:
        """Get a specific game by ID"""
        for game in self.games:
            if game["gameId"] == game_id:
                return game
        return None

    def get_player_stats(self, player_name: str) -> Optional[Dict[str, Any]]:
        """Get season stats for a specific player"""
        return self.season_player_stats.get(player_name)

    def get_player_game_logs(self, player_name: str) -> list:
        """Get game logs for a specific player"""
        return self.player_game_logs.get(player_name, [])


# Global data manager instance
data_manager: Optional[DataManager] = None


def get_data_manager() -> DataManager:
    """Get or create the global data manager"""
    global data_manager
    if data_manager is None:
        data_manager = DataManager()
    return data_manager
