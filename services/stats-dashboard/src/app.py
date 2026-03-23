"""
Basketball Stats - Flask Application
Clean, refactored version with organized routes and services.
"""

from flask import Flask, render_template, jsonify, request, make_response, make_response
from functools import lru_cache
import json
import os
import logging
import threading
from datetime import datetime
from dotenv import load_dotenv

from src.config import Config, EXCLUDED_PLAYERS, MAX_TOKENS
from src.data_manager import get_data_manager
from src.ai_service import (
    get_ai_service,
    build_stats_context,
    ANALYSIS_PROMPTS,
    APIError,
)
from src.advanced_stats import AdvancedStatsCalculator

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(
    __name__,
    template_folder=os.path.join(Config.PROJECT_ROOT, "templates"),
    static_folder=os.path.join(Config.PROJECT_ROOT, "static"),
)

app.config["JSON_SORT_KEYS"] = False
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 31536000
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16MB max request size

# Initialize services
data = get_data_manager()
advanced_calc = AdvancedStatsCalculator(data.stats_data)


# =============================================================================
# Middleware
# =============================================================================


@app.after_request
def add_security_headers(response):
    """Add security headers to all responses"""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # Allow the iPad operator app to call the ingest endpoint cross-origin
    if request.path == "/api/ingest-game":
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return response


# =============================================================================
# Page Routes
# =============================================================================


@app.route("/")
def dashboard():
    return render_template("dashboard.html")


@app.route("/games")
def games():
    return render_template("games.html")


@app.route("/players")
def players():
    return render_template("players.html")


@app.route("/trends")
def trends():
    return render_template("trends.html")


@app.route("/ai-insights")
def ai_insights():
    return render_template("ai-insights.html")


@app.route("/analysis")
def analysis():
    return render_template("analysis.html")


@app.route("/health")
def health_check():
    return jsonify(
        {
            "status": "healthy",
            "games_loaded": len(data.games),
            "players_loaded": len(data.season_player_stats),
            "openai_configured": get_ai_service().is_configured,
        }
    )


# Global lock for data reload to prevent race conditions
reload_lock = threading.Lock()

@app.route("/api/reload-data", methods=["POST"])
def reload_data():
    """Reload data from files to pick up new games and player stats"""
    with reload_lock:
        try:
            data.reload()
            # Also reinitialize advanced stats calculator with fresh data
            global advanced_calc
            advanced_calc = AdvancedStatsCalculator(data.stats_data)

            # Clear any AI caches so they regenerate with new data
            try:
                if os.path.exists(Config.TEAM_CACHE):
                    os.remove(Config.TEAM_CACHE)
                if os.path.exists(Config.ANALYSIS_CACHE):
                    os.remove(Config.ANALYSIS_CACHE)
            except OSError as e:
                logger.warning(f"Failed to clear cache files: {e}")

            return jsonify(
                {
                    "message": "Data reloaded successfully",
                    "games_loaded": len(data.games),
                    "players_loaded": len(data.season_player_stats),
                }
            )
        except Exception as e:
            logger.error(f"Reload error: {e}")
            return jsonify({"error": str(e)}), 500


# =============================================================================
# Data Ingestion  (iPad Operator App → Stats Dashboard)
# =============================================================================


def _build_game_dict(game_id: int, payload: dict) -> dict:
    """Build a game dict in vc_stats_output format from an ingest payload."""
    vc = int(payload["vc_score"])
    opp = int(payload["opp_score"])
    result = "W" if vc > opp else ("L" if vc < opp else "T")
    return {
        "gameId": game_id,
        "date": str(payload["date"])[:50],
        "opponent": str(payload["opponent"])[:100],
        "location": str(payload.get("location", "home")),
        "vc_score": vc,
        "opp_score": opp,
        "result": result,
        "team_stats": payload["team_stats"],
        "player_stats": payload["player_stats"],
    }


def _recompute_season_stats(stats: dict) -> None:
    """Rebuild season_player_stats, season_team_stats, and player_game_logs
    from scratch by iterating all games[]. Modifies stats in-place."""
    games = stats.get("games", [])
    season_player_stats: dict = {}
    player_game_logs: dict = {}
    team_totals = {
        "fg": 0, "fga": 0, "fg3": 0, "fg3a": 0,
        "ft": 0, "fta": 0, "oreb": 0, "dreb": 0, "reb": 0,
        "asst": 0, "to": 0, "stl": 0, "blk": 0, "pf": 0,
        "win": 0, "loss": 0, "vc_total": 0, "games": 0,
    }

    for game in games:
        ts = game.get("team_stats", {})
        result = game.get("result", "")
        for k in ["fg", "fga", "fg3", "fg3a", "ft", "fta",
                  "oreb", "dreb", "reb", "asst", "to", "stl", "blk"]:
            team_totals[k] += ts.get(k, 0)
        team_totals["pf"] += ts.get("fouls", ts.get("pf", 0))
        team_totals["vc_total"] += game.get("vc_score", 0)
        team_totals["games"] += 1
        if result == "W":
            team_totals["win"] += 1
        elif result == "L":
            team_totals["loss"] += 1

        for ps in game.get("player_stats", []):
            name = ps.get("name", "").strip()
            if not name:
                continue
            if name not in season_player_stats:
                season_player_stats[name] = {
                    "name": name, "games": 0,
                    "pts": 0, "fg": 0, "fga": 0, "fg3": 0, "fg3a": 0,
                    "ft": 0, "fta": 0, "oreb": 0, "dreb": 0, "reb": 0,
                    "asst": 0, "to": 0, "stl": 0, "blk": 0, "fouls": 0,
                    "plus_minus": 0,
                }
            sp = season_player_stats[name]
            sp["games"] += 1
            sp["pts"] += ps.get("pts", 0)
            # Support both iPad format (fg_made/fg_att) and legacy format (fg/fga)
            sp["fg"] += ps.get("fg_made", ps.get("fg", 0))
            sp["fga"] += ps.get("fg_att", ps.get("fga", 0))
            sp["fg3"] += ps.get("fg3_made", ps.get("fg3", 0))
            sp["fg3a"] += ps.get("fg3_att", ps.get("fg3a", 0))
            sp["ft"] += ps.get("ft_made", ps.get("ft", 0))
            sp["fta"] += ps.get("ft_att", ps.get("fta", 0))
            sp["oreb"] += ps.get("oreb", 0)
            sp["dreb"] += ps.get("dreb", 0)
            sp["reb"] += ps.get("oreb", 0) + ps.get("dreb", 0)
            sp["asst"] += ps.get("asst", 0)
            sp["to"] += ps.get("to", 0)
            sp["stl"] += ps.get("stl", 0)
            sp["blk"] += ps.get("blk", 0)
            sp["fouls"] += ps.get("fouls", 0)
            sp["plus_minus"] += ps.get("plus_minus", 0)

            if name not in player_game_logs:
                player_game_logs[name] = []
            player_game_logs[name].append({
                "gameId": game["gameId"],
                "date": game["date"],
                "opponent": game["opponent"],
                "location": game["location"],
                "result": game["result"],
                "stats": ps,
            })

    for sp in season_player_stats.values():
        g = max(sp["games"], 1)
        sp["ppg"] = round(sp["pts"] / g, 1)
        sp["rpg"] = round(sp["reb"] / g, 1)
        sp["apg"] = round(sp["asst"] / g, 1)
        sp["fg_pct"] = round(sp["fg"] / sp["fga"] * 100, 1) if sp["fga"] > 0 else 0.0
        sp["fg3_pct"] = round(sp["fg3"] / sp["fg3a"] * 100, 1) if sp["fg3a"] > 0 else 0.0
        sp["ft_pct"] = round(sp["ft"] / sp["fta"] * 100, 1) if sp["fta"] > 0 else 0.0

    g_total = max(team_totals["games"], 1)
    stats["season_player_stats"] = season_player_stats
    stats["season_team_stats"] = {
        "fg": team_totals["fg"],
        "fga": team_totals["fga"],
        "fg3": team_totals["fg3"],
        "fg3a": team_totals["fg3a"],
        "ft": team_totals["ft"],
        "fta": team_totals["fta"],
        "oreb": team_totals["oreb"],
        "dreb": team_totals["dreb"],
        "reb": team_totals["reb"],
        "asst": team_totals["asst"],
        "to": team_totals["to"],
        "stl": team_totals["stl"],
        "blk": team_totals["blk"],
        "pf": team_totals["pf"],
        "win": team_totals["win"],
        "loss": team_totals["loss"],
        "ppg": round(team_totals["vc_total"] / g_total, 1),
        "rpg": round(team_totals["reb"] / g_total, 1),
        "apg": round(team_totals["asst"] / g_total, 1),
        "to_pg": round(team_totals["to"] / g_total, 1),
        "stl_pg": round(team_totals["stl"] / g_total, 1),
        "blk_pg": round(team_totals["blk"] / g_total, 1),
        "oreb_pg": round(team_totals["oreb"] / g_total, 1),
        "dreb_pg": round(team_totals["dreb"] / g_total, 1),
        "fouls_pg": round(team_totals["pf"] / g_total, 1),
        "fg_pct": round(team_totals["fg"] / team_totals["fga"] * 100, 1) if team_totals["fga"] > 0 else 0.0,
        "fg3_pct": round(team_totals["fg3"] / team_totals["fg3a"] * 100, 1) if team_totals["fg3a"] > 0 else 0.0,
        "ft_pct": round(team_totals["ft"] / team_totals["fta"] * 100, 1) if team_totals["fta"] > 0 else 0.0,
    }
    stats["player_game_logs"] = player_game_logs


@app.route("/api/ingest-game", methods=["POST", "OPTIONS"])
def ingest_game():
    """Receive a completed game from the iPad operator app and persist it."""
    if request.method == "OPTIONS":
        return "", 204

    payload = request.get_json(force=True, silent=True)
    if not payload or not isinstance(payload, dict):
        return jsonify({"error": "Invalid or missing JSON payload"}), 400

    required_fields = ["date", "opponent", "vc_score", "opp_score", "team_stats", "player_stats"]
    for field in required_fields:
        if field not in payload:
            return jsonify({"error": f"Missing required field: {field}"}), 400

    if not str(payload["date"]).strip() or not str(payload["opponent"]).strip():
        return jsonify({"error": "date and opponent must be non-empty"}), 400

    try:
        int(payload["vc_score"])
        int(payload["opp_score"])
    except (ValueError, TypeError):
        return jsonify({"error": "vc_score and opp_score must be integers"}), 400

    with reload_lock:
        try:
            stats = data.stats_data
            existing_ids = [g.get("gameId", 0) for g in stats.get("games", [])]

            incoming_id = payload.get("gameId")
            if incoming_id is not None:
                try:
                    gid = int(incoming_id)
                except (ValueError, TypeError):
                    return jsonify({"error": "gameId must be an integer"}), 400
                existing_game = next((g for g in stats["games"] if g["gameId"] == gid), None)
                game_dict = _build_game_dict(gid, payload)
                if existing_game:
                    stats["games"] = [
                        game_dict if g["gameId"] == gid else g
                        for g in stats["games"]
                    ]
                    logger.info(f"Updated existing game #{gid}")
                else:
                    stats["games"].append(game_dict)
                    logger.info(f"Inserted new game #{gid}")
            else:
                gid = max(existing_ids, default=0) + 1
                game_dict = _build_game_dict(gid, payload)
                stats["games"].append(game_dict)
                logger.info(f"Inserted new game #{gid} (auto-assigned ID)")

            stats["games"].sort(key=lambda g: g["gameId"])
            _recompute_season_stats(stats)

            with open(Config.STATS_FILE, "w") as f:
                json.dump(stats, f, indent=2)

            # Sync roster.json from the full roster field sent by the iPad.
            # Falls back to the abbreviated player_stats names when roster is absent.
            try:
                with open(Config.ROSTER_FILE) as rf:
                    roster_data = json.load(rf)

                incoming_roster = payload.get("roster", [])
                if incoming_roster:
                    # Preferred path: iPad sends full player objects keyed by jersey
                    existing_by_number = {
                        p.get("number"): p
                        for p in roster_data.get("roster", [])
                        if p.get("number") is not None
                    }
                    existing_by_name = {
                        p["name"].lower(): p
                        for p in roster_data.get("roster", [])
                    }
                    changed = False
                    for incoming in incoming_roster:
                        jersey = incoming.get("number")
                        full_name = (incoming.get("name") or "").strip()
                        if not full_name:
                            continue
                        # Match by jersey number first, then by name
                        existing = existing_by_number.get(jersey) or existing_by_name.get(full_name.lower())
                        if existing:
                            # Update attributes on existing entry
                            for attr in ("name", "number", "position", "height", "grade"):
                                val = incoming.get(attr)
                                if val is not None and val != "":
                                    if existing.get(attr) != val:
                                        existing[attr] = val
                                        changed = True
                        else:
                            new_entry = {k: v for k, v in incoming.items() if v is not None and v != ""}
                            roster_data.setdefault("roster", []).append(new_entry)
                            existing_by_name[full_name.lower()] = new_entry
                            if jersey is not None:
                                existing_by_number[jersey] = new_entry
                            changed = True
                            logger.info(f"Auto-added player to roster: {full_name}")
                    if changed:
                        roster_data["roster"].sort(key=lambda p: p.get("number", 999))
                        with open(Config.ROSTER_FILE, "w") as rf:
                            json.dump(roster_data, rf, indent=2)
                else:
                    # Fallback: add any completely unknown abbreviated names
                    existing_names = {p["name"].lower() for p in roster_data.get("roster", [])}
                    added_any = False
                    for ps in payload.get("player_stats", []):
                        player_name = (ps.get("name") or "").strip()
                        if player_name and player_name.lower() not in existing_names:
                            new_entry = {"name": player_name}
                            jersey = ps.get("number")
                            if jersey is not None:
                                try:
                                    new_entry["number"] = int(jersey)
                                except (ValueError, TypeError):
                                    pass
                            roster_data.setdefault("roster", []).append(new_entry)
                            existing_names.add(player_name.lower())
                            added_any = True
                            logger.info(f"Auto-added player (fallback) to roster: {player_name}")
                    if added_any:
                        with open(Config.ROSTER_FILE, "w") as rf:
                            json.dump(roster_data, rf, indent=2)
            except OSError as roster_err:
                logger.warning(f"Could not update roster.json: {roster_err}")

            data.reload()
            global advanced_calc
            advanced_calc = AdvancedStatsCalculator(data.stats_data)

            for cache_path in [Config.TEAM_CACHE, Config.ANALYSIS_CACHE]:
                try:
                    if os.path.exists(cache_path):
                        os.remove(cache_path)
                except OSError:
                    pass

            return jsonify({"message": "Game saved successfully", "gameId": gid}), 201

        except OSError as e:
            logger.error(f"File error during game ingest: {e}")
            return jsonify({"error": "Failed to write stats file"}), 500
        except Exception as e:
            logger.error(f"Game ingest error: {e}")
            return jsonify({"error": "Internal server error"}), 500


# =============================================================================
# Data API Routes
# =============================================================================


@app.route("/api/season-stats")
def api_season_stats():
    return jsonify(data.season_team_stats)


@app.route("/api/games")
def api_games():
    games_list = sorted(data.games, key=lambda x: x["gameId"])

    # Create roster lookup for first names
    roster_by_abbrev = {}
    for roster_player in data.roster:
        full_name = roster_player.get("name", "")
        if " " in full_name:
            parts = full_name.split(" ", 1)
            abbrev = f"{parts[0][0]} {parts[1]}"
            roster_by_abbrev[abbrev] = full_name.split(" ")[0]  # Store first name

    # Add first names to player stats in each game
    for game in games_list:
        if "player_stats" in game:
            for player in game["player_stats"]:
                player_name = player.get("name", "")
                player["first_name"] = roster_by_abbrev.get(
                    player_name, player_name.split(" ")[0] if player_name else "Unknown"
                )

    return jsonify(games_list)


@app.route("/api/game/<int:game_id>")
def api_game(game_id):
    game = data.get_game_by_id(game_id)
    if game:
        return jsonify(game)
    return jsonify({"error": "Game not found"}), 404


@app.route("/api/players")
def api_players():
    """Get all player stats with enhanced metrics"""
    players = list(data.season_player_stats.values())
    roster_dict = data.get_roster_dict()

    # Create roster lookup by abbreviated name (first initial + last name)
    roster_by_abbrev = {}
    for roster_player in data.roster:
        full_name = roster_player.get("name", "")
        if " " in full_name:
            parts = full_name.split(" ", 1)
            abbrev = f"{parts[0][0]} {parts[1]}"  # e.g., "Trey Morgan" -> "T Morgan"
            roster_by_abbrev[abbrev] = roster_player

    enhanced = []
    for player in players:
        p = player.copy()
        games = player.get("games", 1)
        player_name = player.get("name", "")

        # Try to match abbreviated name to roster
        if player_name in roster_by_abbrev:
            roster_player = roster_by_abbrev[player_name]
            p["full_name"] = roster_player.get("name")
            p["first_name"] = roster_player.get("name", "").split(" ")[0]
            p["number"] = roster_player.get("number")
            p["grade"] = roster_player.get("grade")
        elif player_name in roster_dict:
            # Direct name match (if full name is used)
            p["full_name"] = roster_dict[player_name].get("name")
            p["first_name"] = roster_dict[player_name].get("name", "").split(" ")[0]
            p["number"] = roster_dict[player_name].get("number")
            p["grade"] = roster_dict[player_name].get("grade")
        else:
            # Use abbreviated name if no match found
            p["full_name"] = player_name
            p["first_name"] = player_name.split(" ")[0]

        # Add per-game stats
        p["spg"] = player.get("stl", 0) / games
        p["bpg"] = player.get("blk", 0) / games
        p["tpg"] = player.get("to", 0) / games
        p["fpg"] = player.get("fouls", 0) / games
        p["plus_minus"] = player.get("plus_minus", 0)

        # Add advanced metrics
        advanced = advanced_calc.calculate_player_advanced_stats(player["name"])
        if advanced:
            p["efg_pct"] = advanced["scoring_efficiency"]["efg_pct"]
            p["ts_pct"] = advanced["scoring_efficiency"]["ts_pct"]
            p["per"] = advanced["scoring_efficiency"]["per"]
            p["usage_rate"] = advanced["usage_role"]["usage_proxy"]
            p["ast_to_ratio"] = advanced["ball_handling"]["ast_to_ratio"]
            p["defensive_rating"] = advanced["defense_activity"]["defensive_rating"]
            p["pm_per_game"] = advanced["impact"]["pm_per_game"]
            p["role"] = advanced["usage_role"]["role"]
            p["consistency_score"] = advanced["consistency"]["consistency_score"]
            p["clutch_factor"] = advanced["clutch_performance"]["clutch_factor"]

        enhanced.append(p)

    return jsonify(sorted(enhanced, key=lambda x: x.get("ppg", 0), reverse=True))


@app.route("/api/player/<player_name>")
def api_player(player_name):
    player_name = player_name.strip()
    if not player_name or len(player_name) > 100:
        return jsonify({"error": "Invalid player name"}), 400

    stats = data.get_player_stats(player_name)
    if stats:
        # Enrich stats with per-game averages (same as /api/players endpoint)
        enhanced_stats = stats.copy()
        games = stats.get("games", 1)

        # Add per-game stats if not present
        enhanced_stats["spg"] = stats.get("stl", 0) / games
        enhanced_stats["bpg"] = stats.get("blk", 0) / games
        enhanced_stats["tpg"] = stats.get("to", 0) / games
        enhanced_stats["fpg"] = stats.get("fouls", 0) / games
        enhanced_stats["plus_minus"] = stats.get("plus_minus", 0)

        # Add roster info
        roster_info = next((p for p in data.roster if p["name"] == player_name), None)
        roster_match = roster_info
        if roster_match is None:
            roster_by_abbrev = {}
            for roster_player in data.roster:
                full_name = roster_player.get("name", "")
                if " " in full_name:
                    parts = full_name.split(" ", 1)
                    abbrev = f"{parts[0][0]} {parts[1]}"
                    roster_by_abbrev[abbrev] = roster_player
            roster_match = roster_by_abbrev.get(player_name)

        if roster_match:
            enhanced_stats["number"] = roster_match.get("number")
            enhanced_stats["grade"] = roster_match.get("grade")
            enhanced_stats["full_name"] = roster_match.get("name")
            enhanced_stats["first_name"] = roster_match.get("name", "").split(" ")[0]
            roster_info = roster_match
        else:
            enhanced_stats["full_name"] = player_name
            enhanced_stats["first_name"] = player_name.split(" ")[0]

        return jsonify(
            {
                "season_stats": enhanced_stats,
                "game_logs": data.get_player_game_logs(player_name),
                "roster_info": roster_info,
            }
        )
    return jsonify({"error": "Player not found"}), 404


@app.route("/api/leaderboards")
def api_leaderboards():
    players = list(data.season_player_stats.values())
    roster_dict = data.get_roster_dict()

    # Create roster lookup by abbreviated name
    roster_by_abbrev = {}
    for roster_player in data.roster:
        full_name = roster_player.get("name", "")
        if " " in full_name:
            parts = full_name.split(" ", 1)
            abbrev = f"{parts[0][0]} {parts[1]}"
            roster_by_abbrev[abbrev] = full_name.split(" ")[0]  # Store first name

    # Add first names to all players
    for player in players:
        player_name = player.get("name", "")
        player["first_name"] = roster_by_abbrev.get(
            player_name, player_name.split(" ")[0] if player_name else "Unknown"
        )

    return jsonify(
        {
            "pts": sorted(players, key=lambda x: x.get("pts", 0), reverse=True)[:10],
            "reb": sorted(players, key=lambda x: x.get("reb", 0), reverse=True)[:10],
            "asst": sorted(players, key=lambda x: x.get("asst", 0), reverse=True)[:10],
            "fg_pct": sorted(
                [p for p in players if p.get("fga", 0) > 0],
                key=lambda x: x.get("fg_pct", 0),
                reverse=True,
            )[:10],
            "fg3_pct": sorted(
                [p for p in players if p.get("fg3a", 0) > 0],
                key=lambda x: x.get("fg3_pct", 0),
                reverse=True,
            )[:10],
            "ft_pct": sorted(
                [p for p in players if p.get("fta", 0) > 0],
                key=lambda x: x.get("ft_pct", 0),
                reverse=True,
            )[:10],
            "stl": sorted(players, key=lambda x: x.get("stl", 0), reverse=True)[:10],
            "blk": sorted(players, key=lambda x: x.get("blk", 0), reverse=True)[:10],
        }
    )


@app.route("/api/player-trends/<player_name>")
def api_player_trends(player_name):
    player_name = player_name.strip()
    if not player_name or len(player_name) > 100:
        return jsonify({"error": "Invalid player name"}), 400

    logs = data.get_player_game_logs(player_name)
    if not logs:
        return jsonify({"error": "Player not found"}), 404

    logs = sorted(logs, key=lambda x: x.get("gameId", 0))
    return jsonify(
        {
            "games": [g.get("gameId", 0) for g in logs],
            "opponents": [g.get("opponent", "Unknown") for g in logs],
            "dates": [g.get("date", "") for g in logs],
            "pts": [g.get("stats", {}).get("pts", 0) for g in logs],
            "fg": [g.get("stats", {}).get("fg_made", 0) for g in logs],
            "fg_att": [g.get("stats", {}).get("fg_att", 0) for g in logs],
            "fg3": [g.get("stats", {}).get("fg3_made", 0) for g in logs],
            "asst": [g.get("stats", {}).get("asst", 0) for g in logs],
            "reb": [g.get("stats", {}).get("oreb", 0) + g.get("stats", {}).get("dreb", 0) for g in logs],
            "stl": [g.get("stats", {}).get("stl", 0) for g in logs],
            "plus_minus": [g.get("stats", {}).get("plus_minus", 0) for g in logs],
            "to": [g.get("stats", {}).get("to", 0) for g in logs],
            "fouls": [g.get("stats", {}).get("fouls", 0) for g in logs],
        }
    )


@app.route("/api/team-trends")
def api_team_trends():
    games = sorted(data.games, key=lambda x: x["gameId"])
    return jsonify(
        {
            "games": [g["gameId"] for g in games],
            "opponents": [g["opponent"] for g in games],
            "dates": [g["date"] for g in games],
            "vc_score": [g["vc_score"] for g in games],
            "opp_score": [g["opp_score"] for g in games],
            "fg_pct": [
                (
                    g["team_stats"]["fg"] / g["team_stats"]["fga"] * 100
                    if g["team_stats"]["fga"] > 0
                    else 0
                )
                for g in games
            ],
            "fg3_pct": [
                (
                    g["team_stats"]["fg3"] / g["team_stats"]["fg3a"] * 100
                    if g["team_stats"]["fg3a"] > 0
                    else 0
                )
                for g in games
            ],
            "asst": [g["team_stats"]["asst"] for g in games],
            "to": [g["team_stats"]["to"] for g in games],
            "reb": [g["team_stats"].get("reb", 0) for g in games],
            "oreb": [g["team_stats"].get("oreb", 0) for g in games],
            "dreb": [g["team_stats"].get("dreb", 0) for g in games],
            "stl": [g["team_stats"].get("stl", 0) for g in games],
            "blk": [g["team_stats"].get("blk", 0) for g in games],
            "ft": [g["team_stats"].get("ft", 0) for g in games],
            "fta": [g["team_stats"].get("fta", 0) for g in games],
        }
    )


@app.route("/api/player-comparison")
def api_player_comparison():
    """Compare two or more players"""
    player_names = request.args.getlist("players")

    if len(player_names) < 2:
        return jsonify({"error": "At least 2 players required for comparison"}), 400

    # Validate player names
    for player_name in player_names:
        if not player_name or len(player_name.strip()) > 100:
            return jsonify({"error": "Invalid player name in comparison"}), 400

    comparison_players = []

    for player_name in player_names:
        player_name = player_name.strip()
        player_stats = data.season_player_stats.get(player_name)

        if not player_stats:
            continue

        advanced = advanced_calc.calculate_player_advanced_stats(player_name)

        # Efficiency grade
        per = advanced["scoring_efficiency"]["per"] if advanced else 0
        if per >= 20:
            efficiency_grade = "A"
        elif per >= 15:
            efficiency_grade = "B"
        elif per >= 10:
            efficiency_grade = "C"
        else:
            efficiency_grade = "D"

        comparison_players.append(
            {
                "name": player_name,
                "basic_stats": {
                    "ppg": player_stats.get("ppg", 0),
                    "rpg": player_stats.get("rpg", 0),
                    "apg": player_stats.get("apg", 0),
                    "tpg": round(
                        player_stats.get("to", 0)
                        / max(player_stats.get("games", 1), 1),
                        1,
                    ),
                    "fg_pct": player_stats.get("fg_pct", 0),
                    "fg3_pct": player_stats.get("fg3_pct", 0),
                    "ft_pct": player_stats.get("ft_pct", 0),
                    "spg": round(
                        player_stats.get("stl", 0)
                        / max(player_stats.get("games", 1), 1),
                        1,
                    ),
                    "bpg": round(
                        player_stats.get("blk", 0)
                        / max(player_stats.get("games", 1), 1),
                        1,
                    ),
                },
                "role": advanced["usage_role"]["role"] if advanced else "Unknown",
                "efficiency_grade": efficiency_grade,
            }
        )

    return jsonify({"players": comparison_players})


# =============================================================================
# Advanced Stats API Routes
# =============================================================================


@app.route("/api/advanced/team")
def api_team_advanced():
    return jsonify(advanced_calc.calculate_team_advanced_stats())


@app.route("/api/advanced/player/<player_name>")
def api_player_advanced(player_name):
    player_name = player_name.strip()
    if not player_name or len(player_name) > 100:
        return jsonify({"error": "Invalid player name"}), 400

    stats = advanced_calc.calculate_player_advanced_stats(player_name)
    if not stats:
        return jsonify({"error": "Player not found"}), 404
    return jsonify(stats)


@app.route("/api/advanced/game/<int:game_id>")
def api_game_advanced(game_id):
    stats = advanced_calc.calculate_game_advanced_stats(game_id)
    if not stats:
        return jsonify({"error": "Game not found"}), 404
    return jsonify(stats)


@app.route("/api/advanced/patterns")
def api_patterns():
    return jsonify(advanced_calc.calculate_win_loss_patterns())


@app.route("/api/advanced/volatility")
def api_volatility():
    return jsonify(advanced_calc.calculate_volatility_metrics())


@app.route("/api/advanced/insights")
def api_auto_insights():
    return jsonify({"insights": advanced_calc.generate_auto_insights()})


@app.route("/api/advanced/all")
def api_all_advanced():
    return jsonify(
        {
            "team": advanced_calc.calculate_team_advanced_stats(),
            "patterns": advanced_calc.calculate_win_loss_patterns(),
            "volatility": advanced_calc.calculate_volatility_metrics(),
            "insights": advanced_calc.generate_auto_insights(),
        }
    )


@app.route("/api/comprehensive-insights")
def api_comprehensive_insights():
    """Generate comprehensive insights for trends page"""
    try:
        # Get recent games (last 5) for trend analysis
        recent_games = (
            sorted(data.games, key=lambda x: x.get("gameId", 0))[-5:]
            if len(data.games) >= 5
            else data.games
        )
        early_games = (
            sorted(data.games, key=lambda x: x.get("gameId", 0))[:5]
            if len(data.games) >= 5
            else []
        )

        # Calculate recent performance
        recent_wins = sum(1 for g in recent_games if g.get("result") == "W")
        recent_losses = len(recent_games) - recent_wins
        recent_avg_score = (
            sum(g.get("vc_score", 0) for g in recent_games) / len(recent_games)
            if recent_games
            else 0
        )
        recent_avg_opp = (
            sum(g.get("opp_score", 0) for g in recent_games) / len(recent_games)
            if recent_games
            else 0
        )
        point_diff = recent_avg_score - recent_avg_opp

        # Calculate early season averages
        early_avg_score = (
            sum(g.get("vc_score", 0) for g in early_games) / len(early_games)
            if early_games
            else 0
        )
        early_avg_opp = (
            sum(g.get("opp_score", 0) for g in early_games) / len(early_games)
            if early_games
            else 0
        )

        # Scoring trend
        scoring_improvement = recent_avg_score - early_avg_score if early_games else 0
        defensive_improvement = early_avg_opp - recent_avg_opp if early_games else 0

        # Get team stats
        team_stats = data.season_team_stats
        total_games = team_stats.get("win", 0) + team_stats.get("loss", 0)
        win_pct = (
            (team_stats.get("win", 0) / total_games * 100) if total_games > 0 else 0
        )

        # Generate recommendations
        recommendations = []
        patterns = advanced_calc.calculate_win_loss_patterns()

        if patterns["loss_conditions"]["avg_to"] > 15:
            recommendations.append(
                {
                    "category": "Ball Security",
                    "priority": "High",
                    "recommendation": f"Reduce turnovers - averaging {patterns['loss_conditions']['avg_to']:.1f} in losses vs {patterns['win_conditions']['avg_to']:.1f} in wins",
                    "reason": "Turnover differential is a key factor in losses",
                }
            )

        if patterns["loss_conditions"]["avg_fg_pct"] < 40:
            recommendations.append(
                {
                    "category": "Shooting",
                    "priority": "High",
                    "recommendation": f"Improve shot selection - {patterns['loss_conditions']['avg_fg_pct']:.1f}% FG in losses vs {patterns['win_conditions']['avg_fg_pct']:.1f}% in wins",
                    "reason": "Shooting efficiency drops significantly in losses",
                }
            )

        if team_stats.get("apg", 0) / max(team_stats.get("tpg", 1), 1) < 1.5:
            recommendations.append(
                {
                    "category": "Playmaking",
                    "priority": "Medium",
                    "recommendation": "Improve assist-to-turnover ratio through better ball movement",
                    "reason": f"Current AST/TO ratio is below optimal threshold",
                }
            )

        # Player insights
        player_insights = []
        players = sorted(
            data.season_player_stats.values(),
            key=lambda x: x.get("ppg", 0),
            reverse=True,
        )[:10]

        for player in players:
            advanced = advanced_calc.calculate_player_advanced_stats(player["name"])
            if not advanced:
                continue

            strengths = []
            improvements = []

            # Analyze strengths and weaknesses
            if advanced["scoring_efficiency"]["ppg"] >= 15:
                strengths.append("Scoring")
            if advanced["scoring_efficiency"]["ts_pct"] >= 55:
                strengths.append("Efficiency")
            if advanced["ball_handling"]["apg"] >= 3:
                strengths.append("Playmaking")
            if advanced["rebounding"]["rpg"] >= 6:
                strengths.append("Rebounding")
            if advanced["defense_activity"]["spg"] >= 1.5:
                strengths.append("Defense")

            if advanced["scoring_efficiency"]["ts_pct"] < 45:
                improvements.append("Shot Selection")
            if (
                advanced["ball_handling"]["ast_to_ratio"] < 1.5
                and advanced["ball_handling"]["tpg"] > 2
            ):
                improvements.append("Ball Security")
            if advanced["scoring_efficiency"]["fg_pct"] < 35:
                improvements.append("Shooting")

            # Efficiency grade
            per = advanced["scoring_efficiency"]["per"]
            if per >= 20:
                efficiency_grade = "A"
            elif per >= 15:
                efficiency_grade = "B"
            elif per >= 10:
                efficiency_grade = "C"
            else:
                efficiency_grade = "D"

            player_insights.append(
                {
                    "name": player["name"],
                    "role": advanced["usage_role"]["role"],
                    "strengths": strengths,
                    "areas_for_improvement": improvements,
                    "efficiency_grade": efficiency_grade,
                }
            )

        return jsonify(
            {
                "team_trends": {
                    "recent_performance": {
                        "record": f"{recent_wins}-{recent_losses}",
                        "avg_score": round(recent_avg_score, 1),
                        "point_differential": round(point_diff, 1),
                        "trend": (
                            "Improving"
                            if recent_wins > recent_losses
                            else (
                                "Struggling"
                                if recent_wins < recent_losses
                                else "Stable"
                            )
                        ),
                    },
                    "scoring_trends": {
                        "recent_avg": round(recent_avg_score, 1),
                        "early_avg": round(early_avg_score, 1),
                        "improvement": round(scoring_improvement, 1),
                        "trend": (
                            "Up"
                            if scoring_improvement > 2
                            else "Down" if scoring_improvement < -2 else "Stable"
                        ),
                    },
                    "defensive_trends": {
                        "recent_avg_allowed": round(recent_avg_opp, 1),
                        "early_avg_allowed": round(early_avg_opp, 1),
                        "improvement": round(defensive_improvement, 1),
                        "trend": (
                            "Improving"
                            if defensive_improvement > 2
                            else "Declining" if defensive_improvement < -2 else "Stable"
                        ),
                    },
                },
                "key_metrics": {
                    "win_pct": round(win_pct, 1),
                    "fg_pct": team_stats.get("fg_pct", 0),
                    "fg3_pct": team_stats.get("fg3_pct", 0),
                    "apg": team_stats.get("apg", 0),
                    "tpg": (
                        round(team_stats.get("to", 0) / total_games, 1)
                        if total_games > 0
                        else 0
                    ),
                },
                "recommendations": recommendations,
                "player_insights": player_insights,
            }
        )
    except Exception as e:
        logger.error(f"Comprehensive insights error: {e}")
        return jsonify({"error": str(e)}), 500


# =============================================================================
# AI Analysis API Routes
# =============================================================================


@app.route("/api/ai/chat", methods=["POST"])
def ai_chat():
    """Chat endpoint with conversation history"""
    try:
        if not request.json:
            return jsonify({"error": "Invalid JSON data"}), 400

        message = request.json.get("message", "").strip()
        history = request.json.get("history", [])

        if not message:
            return jsonify({"error": "No message provided"}), 400
        if len(message) > 1000:
            return jsonify({"error": "Message too long"}), 400

        ai = get_ai_service()
        if not ai.is_configured:
            return jsonify({"error": "AI features unavailable \u2014 set OPENAI_API_KEY to enable", "code": "ai_unavailable"}), 503

        # Clean history with better validation
        clean_history = []
        for msg in (history or [])[-20:]:
            if not isinstance(msg, dict):
                continue
            if "role" not in msg or "content" not in msg:
                continue
            if msg["role"] not in ["user", "assistant"]:
                continue
            if not isinstance(msg["content"], (str, int, float)):
                continue
            content = str(msg["content"]).strip()
            if len(content) > 2000:
                continue
            clean_history.append({"role": msg["role"], "content": content})

        # Always get fresh stats context (no caching)
        context = build_stats_context(data)
        system_prompt = f"""You are an expert basketball statistics analyst. Use ONLY the provided stats data.
Always reference exact numbers from the data. Never make up statistics.

TEAM STATS DATA:
{context}"""

        response = ai.call_with_history(system_prompt, message, clean_history)
        return jsonify({"response": response, "message": message})

    except APIError as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/analyze", methods=["POST"])
def ai_analyze():
    """General AI analysis endpoint"""
    try:
        if not request.json:
            return jsonify({"error": "Invalid JSON data"}), 400

        query = request.json.get("query", "").strip()
        analysis_type = request.json.get("type", "general").strip().lower()

        if not query:
            return jsonify({"error": "No query provided"}), 400
        if len(query) > 1000:
            return jsonify({"error": "Query too long"}), 400

        ai = get_ai_service()
        if not ai.is_configured:
            return jsonify({"error": "AI features unavailable \u2014 set OPENAI_API_KEY to enable", "code": "ai_unavailable"}), 503

        valid_types = {"general", "player", "team", "trends", "coaching"}
        if analysis_type not in valid_types:
            analysis_type = "general"

        # Always get fresh stats context (no caching)
        context = build_stats_context(data)
        prompt = ANALYSIS_PROMPTS.get(analysis_type, ANALYSIS_PROMPTS["general"])
        system_prompt = f"{prompt}\n\nTEAM DATA:\n{context}"

        analysis = ai.call_api(system_prompt, query, max_tokens=1500)
        return jsonify({"analysis": analysis, "type": analysis_type, "query": query})

    except APIError as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/player-insights/<player_name>")
def ai_player_insights(player_name):
    """Get AI insights for a specific player"""
    try:
        player_name = player_name.strip()
        if not player_name or len(player_name) > 100:
            return jsonify({"error": "Invalid player name"}), 400

        if player_name not in data.season_player_stats:
            return jsonify({"error": "Player not found"}), 404

        if player_name in EXCLUDED_PLAYERS:
            return jsonify({"error": "Analysis not available"}), 404

        ai = get_ai_service()
        if not ai.is_configured:
            return jsonify({"error": "AI features unavailable \u2014 set OPENAI_API_KEY to enable", "code": "ai_unavailable"}), 503

        # Get fresh player stats and game logs
        stats = data.season_player_stats[player_name]
        logs = sorted(
            data.get_player_game_logs(player_name), key=lambda x: x["gameId"]
        )[-5:]

        # Build player context
        logs_text = "\n".join(
            [
                f"G{g['gameId']} vs {g['opponent']}: {g['stats']['pts']}pts, {g['stats']['oreb']+g['stats']['dreb']}reb, {g['stats']['asst']}ast"
                for g in logs
            ]
        )

        prompt = f"""Analyze {player_name}

SEASON ({stats['games']} games):
{stats['ppg']:.1f}PPG | {stats['rpg']:.1f}RPG | {stats['apg']:.1f}APG
{stats['fg_pct']:.1f}%FG | {stats['fg3_pct']:.1f}%3P | {stats['ft_pct']:.1f}%FT

RECENT GAMES:
{logs_text}

Analyze: 1) Scoring Output 2) Efficiency 3) Consistency 4) Role 5) Trend"""

        insights = ai.call_api(
            "Analyze player performance. Be specific with numbers.",
            prompt,
            max_tokens=800,
        )

        return jsonify({"player": player_name, "insights": insights})

    except APIError as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        logger.error(f"Player insights error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/game-analysis/<int:game_id>")
def ai_game_analysis(game_id):
    """Get AI analysis of a specific game"""
    try:
        # Get fresh game data (important for newly added games)
        game = data.get_game_by_id(game_id)
        if not game:
            return jsonify({"error": "Game not found"}), 404

        ai = get_ai_service()
        if not ai.is_configured:
            return jsonify({"error": "AI features unavailable \u2014 set OPENAI_API_KEY to enable", "code": "ai_unavailable"}), 503

        ts = game["team_stats"]
        season = data.season_team_stats

        fg_pct = (ts["fg"] / ts["fga"] * 100) if ts["fga"] > 0 else 0
        fg3_pct = (ts["fg3"] / ts["fg3a"] * 100) if ts["fg3a"] > 0 else 0

        # Player performances
        players_text = "\n".join(
            [
                f"{p['name']}: {p['pts']}pts, {p.get('reb', 0)}reb, {p.get('asst', 0)}ast"
                for p in sorted(
                    game.get("player_stats", []), key=lambda x: x["pts"], reverse=True
                )[:5]
                if p["name"] not in EXCLUDED_PLAYERS
            ]
        )

        prompt = f"""VC vs {game['opponent']} ({game['date']})
Result: {game['vc_score']}-{game['opp_score']} ({game['result']})

GAME: {fg_pct:.1f}%FG (season {season['fg_pct']:.1f}%), {fg3_pct:.1f}%3P, {ts['asst']}AST, {ts['to']}TO

TOP PLAYERS:
{players_text}

Analyze: Shooting deviation, possession control, scoring distribution, key performances."""

        analysis = ai.call_api(
            "Analyze this basketball game. Compare to season averages.",
            prompt,
            max_tokens=1000,
        )

        return jsonify(
            {"game": f"{game['opponent']} ({game['date']})", "analysis": analysis}
        )

    except APIError as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        logger.error(f"Game analysis error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/team-summary")
def ai_team_summary():
    """Get AI team summary with caching"""
    try:
        # Check cache (cache is cleared when data is reloaded)
        if os.path.exists(Config.TEAM_CACHE):
            try:
                with open(Config.TEAM_CACHE) as f:
                    return jsonify(json.load(f))
            except (json.JSONDecodeError, OSError) as e:
                logger.warning(f"Failed to load team cache, regenerating: {e}")
                # Continue to regenerate if cache is corrupted

        ai = get_ai_service()
        if not ai.is_configured:
            return jsonify({"error": "AI features unavailable \u2014 set OPENAI_API_KEY to enable", "code": "ai_unavailable"}), 503

        # Build fresh context with all current data
        context = build_stats_context(data)

        prompt = """Diagnose this season using only box score data.
1. Primary Win Condition - what stat pattern predicts wins?
2. Critical Thresholds - what values separate wins from losses?
3. Failure Modes - what breakdown causes losses?
4. Actionable Changes - what can realistically improve?

Be specific with numbers. No speculation."""

        summary = ai.call_api(
            f"Performance diagnostician analyzing basketball data.\n\nDATA:\n{context}",
            prompt,
            max_tokens=2000,
            temperature=0,
        )

        result = {"summary": summary}
        try:
            with open(Config.TEAM_CACHE, "w") as f:
                json.dump(result, f)
        except (OSError, IOError) as e:
            logger.error(f"Failed to save team cache: {e}")
            # Continue anyway - cache is optional

        return jsonify(result)

    except APIError as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        logger.error(f"Team summary error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/team-summary", methods=["DELETE"])
def clear_team_summary():
    """Clear team summary cache"""
    try:
        if os.path.exists(Config.TEAM_CACHE):
            os.remove(Config.TEAM_CACHE)
        return jsonify({"message": "Cache cleared"})
    except OSError as e:
        logger.error(f"Failed to clear team cache: {e}")
        return jsonify({"error": "Failed to clear cache"}), 500


# =============================================================================
# Season Analysis API
# =============================================================================


@app.route("/api/season-analysis")
def get_season_analysis():
    """Get cached season analysis"""
    try:
        force = request.args.get("force", "false").lower() == "true"

        if not force and os.path.exists(Config.ANALYSIS_CACHE):
            try:
                with open(Config.ANALYSIS_CACHE) as f:
                    return jsonify(json.load(f))
            except (json.JSONDecodeError, OSError) as e:
                logger.warning(f"Failed to load analysis cache, regenerating: {e}")
                # Continue to regenerate

        ai = get_ai_service()
        if not ai.is_configured:
            return jsonify({"error": "AI features unavailable \u2014 set OPENAI_API_KEY to enable", "code": "ai_unavailable"}), 503

        games = sorted(data.games, key=lambda x: x["gameId"])
        season = data.season_team_stats

        # Generate per-game analysis
        per_game = []
        for game in games:
            ts = game["team_stats"]
            fg_pct = (ts["fg"] / ts["fga"] * 100) if ts["fga"] > 0 else 0

            # Get player performances
            players = []
            for p in sorted(
                game.get("player_stats", []), key=lambda x: x["pts"], reverse=True
            ):
                if p["name"] in EXCLUDED_PLAYERS:
                    continue
                season_ppg = data.season_player_stats.get(p["name"], {}).get("ppg", 0)
                diff = p["pts"] - season_ppg
                players.append(
                    {
                        "name": p["name"],
                        "pts": p["pts"],
                        "season_ppg": season_ppg,
                        "diff": diff,
                        "indicator": "↑" if diff > 1 else ("↓" if diff < -1 else "→"),
                    }
                )

            prompt = f"""Game {game['gameId']}: VC vs {game['opponent']} - {game['result']} {game['vc_score']}-{game['opp_score']}
FG: {fg_pct:.1f}%, AST: {ts['asst']}, TO: {ts['to']}
Top: {', '.join([f"{p['name']} {p['pts']}pts ({p['indicator']}{abs(p['diff']):.0f})" for p in players[:3]])}

Output: PRIMARY DRIVER, SECONDARY DRIVER, RISK EXPOSED"""

            try:
                analysis = ai.call_api(
                    "Generate compact game diagnostics.", prompt, max_tokens=400
                )
            except:
                analysis = "Analysis pending..."

            per_game.append(
                {
                    "game": game["gameId"],
                    "opponent": game["opponent"],
                    "date": game["date"],
                    "score": f"{game['vc_score']}-{game['opp_score']}",
                    "result": game["result"],
                    "player_performances": players,
                    "analysis": analysis,
                }
            )

        # Season summary
        summary_prompt = f"""Season: {season['win']}-{season['loss']} ({season['win']/(season['win']+season['loss'])*100:.0f}%)
{season['ppg']:.1f}PPG, {season['fg_pct']:.1f}%FG, {season['fg3_pct']:.1f}%3P

Comprehensive analysis: strengths, weaknesses, evolution, improvements needed."""

        summary = ai.call_api(
            "Expert basketball coach providing season analysis.",
            summary_prompt,
            max_tokens=2000,
        )

        result = {
            "generated_at": datetime.now().isoformat(),
            "season_summary": summary,
            "per_game_analysis": per_game,
        }

        try:
            with open(Config.ANALYSIS_CACHE, "w") as f:
                json.dump(result, f, indent=2)
        except (OSError, IOError) as e:
            logger.error(f"Failed to save analysis cache: {e}")
            # Continue anyway - cache is optional

        return jsonify(result)

    except APIError as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        logger.error(f"Season analysis error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/season-analysis", methods=["DELETE"])
def clear_analysis():
    """Clear season analysis cache"""
    try:
        if os.path.exists(Config.ANALYSIS_CACHE):
            os.remove(Config.ANALYSIS_CACHE)
        return jsonify({"message": "Cache cleared"})
    except OSError as e:
        logger.error(f"Failed to clear analysis cache: {e}")
        return jsonify({"error": "Failed to clear cache"}), 500


# =============================================================================
# Player Analysis API
# =============================================================================


def _load_player_cache():
    if os.path.exists(Config.PLAYER_CACHE):
        try:
            with open(Config.PLAYER_CACHE) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"Failed to load player cache: {e}")
            return {}
    return {}


def _save_player_cache(cache):
    try:
        with open(Config.PLAYER_CACHE, "w") as f:
            json.dump(cache, f, indent=2)
    except (OSError, IOError) as e:
        logger.error(f"Failed to save player cache: {e}")


@app.route("/api/ai/player-analysis/<player_name>")
def get_player_analysis(player_name):
    """Get comprehensive player analysis with caching"""
    try:
        player_name = player_name.strip()
        if not player_name or len(player_name) > 100:
            return jsonify({"error": "Invalid player name"}), 400

        if player_name not in data.season_player_stats:
            return jsonify({"error": "Player not found"}), 404

        ai = get_ai_service()
        if not ai.is_configured:
            return jsonify({"error": "AI features unavailable \u2014 set OPENAI_API_KEY to enable", "code": "ai_unavailable"}), 503

        force = request.args.get("regenerate", "false").lower() == "true"
        cache = _load_player_cache()

        if not force and player_name in cache:
            cached = cache[player_name]
            cached["cached"] = True
            return jsonify(cached)

        stats = data.season_player_stats[player_name]
        advanced = advanced_calc.calculate_player_advanced_stats(player_name)
        logs = data.get_player_game_logs(player_name)

        # Build context
        context = f"""
PLAYER: {player_name}

SEASON ({stats['games']} Games):
- {stats['ppg']:.1f}PPG, {stats['rpg']:.1f}RPG, {stats['apg']:.1f}APG
- {stats['fg_pct']:.1f}%FG, {stats['fg3_pct']:.1f}%3P, {stats['ft_pct']:.1f}%FT
- {stats.get('stl', 0)/stats['games']:.1f}SPG, {stats.get('blk', 0)/stats['games']:.1f}BPG
"""

        if advanced:
            context += f"""
ADVANCED:
- eFG%: {advanced['scoring_efficiency']['efg_pct']:.1f}%
- TS%: {advanced['scoring_efficiency']['ts_pct']:.1f}%
- Usage: {advanced['usage_role']['usage_proxy']:.1f}%
- Role: {advanced['usage_role']['role']}
"""

        if logs:
            pts_list = [
                g["stats"]["pts"] if "stats" in g else g.get("pts", 0) for g in logs
            ]
            if pts_list:
                context += f"""
CONSISTENCY:
- Range: {min(pts_list)}-{max(pts_list)} pts
- Recent (last 3): {sum(pts_list[-3:])/min(3, len(pts_list)):.1f}PPG
"""

        prompt = f"""{context}

COMPREHENSIVE ANALYSIS:
1. Performance Profile (strengths, weaknesses)
2. Scoring Analysis (efficiency, volume)
3. Role & Impact
4. Consistency & Trends
5. Development Areas
6. Key Insights (3-5 data-driven observations)"""

        analysis = ai.call_api(
            "Expert basketball analyst. Use specific statistics. Be thorough but concise.",
            prompt,
            max_tokens=2000,
        )

        result = {
            "player": player_name,
            "analysis": analysis,
            "generated_at": datetime.now().isoformat(),
            "stats_summary": {
                "games": stats["games"],
                "ppg": round(stats["ppg"], 1),
                "rpg": round(stats["rpg"], 1),
                "apg": round(stats["apg"], 1),
                "fg_pct": round(stats["fg_pct"], 1),
                "fg3_pct": round(stats["fg3_pct"], 1),
                "ft_pct": round(stats["ft_pct"], 1),
            },
            "cached": False,
        }

        cache[player_name] = result
        _save_player_cache(cache)

        return jsonify(result)

    except APIError as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        logger.error(f"Player analysis error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/player-analysis/<player_name>", methods=["DELETE"])
def clear_player_analysis(player_name):
    """Clear cached analysis for a player"""
    try:
        player_name = player_name.strip()
        cache = _load_player_cache()
        if player_name in cache:
            del cache[player_name]
            _save_player_cache(cache)
            return jsonify({"message": f"Cache cleared for {player_name}"})
        return jsonify({"message": "No cached analysis found"})
    except Exception as e:
        logger.error(f"Failed to clear player cache: {e}")
        return jsonify({"error": "Failed to clear cache"}), 500
