"""
OpenAI API integration for AI-powered basketball analysis
"""

import logging
import requests
from typing import Optional, List, Dict, Any
from src.config import Config, EXCLUDED_PLAYERS, MAX_TOKENS

logger = logging.getLogger(__name__)


class AIService:
    """Handles all OpenAI API interactions"""

    def __init__(self):
        self.api_key = Config.OPENAI_API_KEY
        self.api_url = Config.OPENAI_API_URL
        self.model = Config.OPENAI_MODEL
        self.timeout = Config.OPENAI_TIMEOUT

    @property
    def is_configured(self) -> bool:
        """Check if OpenAI API is configured"""
        return bool(self.api_key)

    def call_api(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: int = 1500,
        temperature: float = 0.7,
        model: Optional[str] = None,
    ) -> str:
        """Make API call to OpenAI"""
        if not self.is_configured:
            raise ValueError("OpenAI API key not configured")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": model or self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        try:
            response = requests.post(
                self.api_url, headers=headers, json=payload, timeout=self.timeout
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

        except requests.exceptions.Timeout:
            logger.error("OpenAI API timeout")
            raise APIError("AI service timeout - please try again")
        except requests.exceptions.HTTPError as e:
            self._handle_http_error(e)
        except requests.exceptions.RequestException as e:
            logger.error(f"OpenAI API request failed: {e}")
            raise APIError("AI service connection error")
        except (KeyError, IndexError) as e:
            logger.error(f"OpenAI API response format error: {e}")
            raise APIError("AI service response error")

    def call_with_history(
        self,
        system_prompt: str,
        message: str,
        history: List[Dict[str, str]],
        max_tokens: int = 1000,
    ) -> str:
        """Make API call with conversation history"""
        if not self.is_configured:
            raise ValueError("OpenAI API key not configured")

        messages = [{"role": "system", "content": system_prompt}]

        # Add recent history
        for msg in history[-10:]:
            messages.append(
                {"role": msg.get("role", "user"), "content": msg.get("content", "")}
            )

        messages.append({"role": "user", "content": message})

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": max_tokens,
        }

        try:
            response = requests.post(
                self.api_url, headers=headers, json=payload, timeout=self.timeout
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

        except requests.exceptions.Timeout:
            raise APIError("AI service timeout - please try again")
        except requests.exceptions.HTTPError as e:
            self._handle_http_error(e)
        except requests.exceptions.RequestException as e:
            logger.error(f"OpenAI API request failed: {e}")
            raise APIError("AI service connection error")

    def _handle_http_error(self, error: requests.exceptions.HTTPError):
        """Handle HTTP errors from OpenAI API"""
        status = error.response.status_code
        if status == 429:
            logger.error("OpenAI API rate limit exceeded")
            raise APIError("AI service rate limit - please wait a moment")
        elif status == 401:
            logger.error("OpenAI API authentication failed")
            raise APIError("AI service authentication error")
        else:
            logger.error(f"OpenAI API HTTP error: {error}")
            raise APIError("AI service error - please try again")


class APIError(Exception):
    """Custom exception for API errors"""

    pass


def build_stats_context(data_manager, roster_metadata: Optional[Dict[str, Any]] = None) -> str:
    """Generate comprehensive stats context for AI analysis.

    This function always accesses the current data from data_manager,
    including any newly added games and updated player statistics.
    Call data_manager.reload() first if you need to refresh from files.

    Args:
        data_manager: DataManager instance with season stats.
        roster_metadata: Optional dict with keys coachStyle, playingStyle,
            teamContext, and players list (each with id, name, role, notes).
    """
    games = sorted(data_manager.games, key=lambda x: x["gameId"])
    season_stats = data_manager.season_team_stats

    if not season_stats:
        return "No season statistics available"

    total_games = season_stats.get("win", 0) + season_stats.get("loss", 0)
    win_pct = (season_stats.get("win", 0) / total_games * 100) if total_games > 0 else 0

    team_name = data_manager.stats_data.get("team", "Test Team")
    season_name = data_manager.stats_data.get("season", "Current Season")

    context = f"""
{team_name} - {season_name} Stats

TEAM RECORD: {season_stats.get('win', 0)}-{season_stats.get('loss', 0)}
Win Percentage: {win_pct:.1f}%

TEAM SEASON AVERAGES:
- Points Per Game: {season_stats.get('ppg', 0):.1f}
- Rebounds Per Game: {season_stats.get('rpg', 0):.1f}
- Assists Per Game: {season_stats.get('apg', 0):.1f}
- Turnovers Per Game: {season_stats.get('to_pg', 0):.1f}
- Steals Per Game: {season_stats.get('stl_pg', 0):.1f}
- Blocks Per Game: {season_stats.get('blk_pg', 0):.1f}
- Field Goal %: {season_stats.get('fg_pct', 0):.1f}%
- Three Point %: {season_stats.get('fg3_pct', 0):.1f}%
- Free Throw %: {season_stats.get('ft_pct', 0):.1f}%
"""

    # Inject coaching context from roster metadata when available
    if roster_metadata:
        coach_style = str(roster_metadata.get("coachStyle") or "").strip()
        playing_style = str(roster_metadata.get("playingStyle") or "").strip()
        team_context = str(roster_metadata.get("teamContext") or "").strip()
        combined_style = " | ".join(s for s in [coach_style, playing_style] if s)
        if combined_style:
            context += f"\nCOACH STYLE: {combined_style}"
        if team_context:
            context += f"\nTEAM CONTEXT: {team_context}"

    context += f"\nGAME-BY-GAME RESULTS ({len(games)} games):\n"

    for game in games:
        team_stats = game.get("team_stats", {})
        fg_pct = (
            (team_stats.get("fg", 0) / team_stats.get("fga", 1) * 100)
            if team_stats.get("fga", 0) > 0
            else 0
        )

        player_stats = game.get("player_stats", [])
        filtered = [
            p
            for p in player_stats
            if p.get("name") not in EXCLUDED_PLAYERS and "pts" in p
        ]
        top_scorers = sorted(filtered, key=lambda x: x.get("pts", 0), reverse=True)[:3]
        scorers_text = ", ".join(
            [f"{p.get('name')} {p.get('pts')}pts" for p in top_scorers]
        )

        context += f"""
Game {game.get('gameId')} - {game.get('date')} vs {game.get('opponent')}: {game.get('result')} {game.get('vc_score')}-{game.get('opp_score')}
  FG: {fg_pct:.1f}%, AST: {team_stats.get('asst', 0)}, TO: {team_stats.get('to', 0)}
  Top: {scorers_text}"""

    context += "\n\nPLAYER SEASON STATISTICS:\n"

    # Build a player metadata lookup from roster_metadata if present
    player_meta_by_name: Dict[str, Dict[str, str]] = {}
    if roster_metadata:
        for p in roster_metadata.get("players") or []:
            if not isinstance(p, dict):
                continue
            pname = str(p.get("name") or "").strip().lower()
            if pname:
                player_meta_by_name[pname] = {
                    "role": str(p.get("role") or "").strip(),
                    "notes": str(p.get("notes") or "").strip(),
                }

    for name, stats in sorted(
        data_manager.season_player_stats.items(),
        key=lambda x: x[1].get("ppg", 0),
        reverse=True,
    ):
        if name in EXCLUDED_PLAYERS:
            continue
        tpg = stats.get("to", 0) / max(stats.get("games", 1), 1)
        meta = player_meta_by_name.get(name.lower(), {})
        role_note = ""
        if meta.get("role"):
            role_note += f", role: {meta['role']}"
        if meta.get("notes"):
            role_note += f", notes: {meta['notes']}"
        context += f"""
{name}: {stats.get('games', 0)}GP, {stats.get('ppg', 0):.1f}PPG, {stats.get('rpg', 0):.1f}RPG, {stats.get('apg', 0):.1f}APG, {tpg:.1f}TPG{role_note}
  Shooting: {stats.get('fg_pct', 0):.1f}%FG, {stats.get('fg3_pct', 0):.1f}%3P, {stats.get('ft_pct', 0):.1f}%FT"""

    return context


# Analysis prompts
ANALYSIS_PROMPTS = {
    "general": """You are a diagnostic basketball analyst. Identify:
- MEASURABLE GAPS vs season averages
- ROOT CAUSES through measurable conditions
- ACTIONABLE TACTICAL ADJUSTMENTS

Do NOT speculate beyond data or suggest practice drills.""",
    "player": """Perform diagnostic player evaluation using box score data only. Identify:
- PERFORMANCE DELTA vs season baseline
- EFFICIENCY vs usage relationship
- ROLE ALIGNMENT""",
    "team": """Analyze team tactics using box score data. Identify:
- STAT-DRIVEN WIN/LOSS CONDITIONS
- OFFENSIVE DEPENDENCIES
- TOP 3 TACTICAL ADJUSTMENTS ranked by impact""",
    "trends": """Identify patterns using numeric trends. Analyze:
- VOLATILITY (highest variance stats)
- DIRECTIONAL SHIFTS
- RISK SIGNALS correlated with losses""",
    "coaching": """Evaluate game management from box score outcomes. Analyze:
- ROTATION IMPACT using +/-
- LINEUP DEPENDENCE
- GAME CONTROL METRICS""",
}


# Global AI service instance
ai_service: Optional[AIService] = None


def get_ai_service() -> AIService:
    """Get or create the global AI service"""
    global ai_service
    if ai_service is None:
        ai_service = AIService()
    return ai_service
