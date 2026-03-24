"""
Smoke tests for the Basketball Stats Dashboard Flask API.

Run from the apps/stats-dashboard directory:
    .venv/Scripts/python -m pytest test/ -v
"""

import json
import os
import sys
import tempfile
import shutil

import pytest

# Ensure src/ is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    """Create a test client backed by a temporary data directory."""
    # Copy the real data files into a temp directory so tests don't corrupt them
    real_data = os.path.join(os.path.dirname(__file__), "..", "data")
    tmp = tempfile.mkdtemp()
    tmp_data = os.path.join(tmp, "data")
    shutil.copytree(real_data, tmp_data)

    # Patch the config paths before importing the app
    import src.config as cfg
    original_stats = cfg.Config.STATS_FILE
    original_roster = cfg.Config.ROSTER_FILE
    cfg.Config.STATS_FILE = os.path.join(tmp_data, "vc_stats_output.json")
    cfg.Config.ROSTER_FILE = os.path.join(tmp_data, "roster.json")

    # Now import and configure the app
    from src.app import app
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c

    # Restore config and clean up
    cfg.Config.STATS_FILE = original_stats
    cfg.Config.ROSTER_FILE = original_roster
    shutil.rmtree(tmp)


# ---------------------------------------------------------------------------
# Basic page routes
# ---------------------------------------------------------------------------

def test_dashboard_page_200(client):
    r = client.get("/")
    assert r.status_code == 200


def test_games_page_200(client):
    r = client.get("/games")
    assert r.status_code == 200


def test_players_page_200(client):
    r = client.get("/players")
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

def test_health_check(client):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.get_json()
    assert "status" in data
    assert data["status"] == "healthy"
    assert "games_loaded" in data
    assert "players_loaded" in data
    assert "openai_configured" in data


# ---------------------------------------------------------------------------
# Data API routes
# ---------------------------------------------------------------------------

def test_api_games_returns_list(client):
    r = client.get("/api/games")
    assert r.status_code == 200
    data = r.get_json()
    assert isinstance(data, list)
    if data:
        game = data[0]
        assert "gameId" in game
        assert "opponent" in game
        assert "vc_score" in game
        assert "opp_score" in game


def test_api_season_stats(client):
    r = client.get("/api/season-stats")
    assert r.status_code == 200
    data = r.get_json()
    assert isinstance(data, dict)


def test_api_players_returns_list(client):
    r = client.get("/api/players")
    assert r.status_code == 200
    data = r.get_json()
    assert isinstance(data, list)
    if data:
        player = data[0]
        assert "name" in player
        assert "ppg" in player


def test_api_leaderboards(client):
    r = client.get("/api/leaderboards")
    assert r.status_code == 200
    data = r.get_json()
    assert "pts" in data
    assert "reb" in data
    assert "asst" in data


def test_api_game_not_found(client):
    r = client.get("/api/game/999999")
    assert r.status_code == 404


def _seed_test_game(client, opponent: str, player_name: str = "T Smith"):
    payload = {
        "date": "Mar 22, 2026",
        "opponent": opponent,
        "vc_score": 55,
        "opp_score": 48,
        "location": "home",
        "team_stats": {
            "fg": 18, "fga": 42, "fg3": 4, "fg3a": 10,
            "ft": 15, "fta": 18, "oreb": 5, "dreb": 22,
            "reb": 27, "asst": 12, "to": 9, "stl": 7, "blk": 3, "fouls": 14,
        },
        "player_stats": [
            {
                "number": 12, "name": player_name,
                "fg_made": 6, "fg_att": 12, "fg_pct": "50%",
                "fg3_made": 1, "fg3_att": 3, "fg3_pct": "33%",
                "ft_made": 3, "ft_att": 4, "ft_pct": "75%",
                "oreb": 1, "dreb": 4, "fouls": 2,
                "stl": 2, "to": 1, "blk": 0, "asst": 3,
                "pts": 16, "plus_minus": 8,
            },
        ],
    }
    response = client.post(
        "/api/ingest-game",
        data=json.dumps(payload),
        content_type="application/json",
    )
    assert response.status_code == 201
    return response.get_json()["gameId"]


def test_api_delete_game_returns_json(client):
    game_id = _seed_test_game(client, "Delete Game Academy")
    delete_response = client.delete(f"/api/game/{game_id}")

    assert delete_response.status_code == 200
    assert delete_response.is_json
    payload = delete_response.get_json()
    assert payload["gameId"] == game_id

    verify_response = client.get(f"/api/game/{game_id}")
    assert verify_response.status_code == 404


def test_api_delete_player_returns_json(client):
    player_name = "Delete Player Test"
    _seed_test_game(client, "Delete Player Academy", player_name=player_name)
    delete_response = client.delete(f"/api/player/{player_name}")

    assert delete_response.status_code == 200
    assert delete_response.is_json
    payload = delete_response.get_json()
    assert payload["player"] == player_name

    verify_response = client.get(f"/api/player/{player_name}")
    assert verify_response.status_code == 404


# ---------------------------------------------------------------------------
# Ingest endpoint — happy path
# ---------------------------------------------------------------------------

VALID_INGEST_PAYLOAD = {
    "date": "Mar 22, 2026",
    "opponent": "Test Academy",
    "vc_score": 55,
    "opp_score": 48,
    "location": "home",
    "team_stats": {
        "fg": 18, "fga": 42, "fg3": 4, "fg3a": 10,
        "ft": 15, "fta": 18, "oreb": 5, "dreb": 22,
        "reb": 27, "asst": 12, "to": 9, "stl": 7, "blk": 3, "fouls": 14,
    },
    "player_stats": [
        {
            "number": 12, "name": "T Smith",
            "fg_made": 6, "fg_att": 12, "fg_pct": "50%",
            "fg3_made": 1, "fg3_att": 3, "fg3_pct": "33%",
            "ft_made": 3, "ft_att": 4, "ft_pct": "75%",
            "oreb": 1, "dreb": 4, "fouls": 2,
            "stl": 2, "to": 1, "blk": 0, "asst": 3,
            "pts": 16, "plus_minus": 8,
        },
    ],
}


def test_ingest_game_new(client):
    payload = {**VALID_INGEST_PAYLOAD, "opponent": "Ingest Test Opponent A"}
    r = client.post(
        "/api/ingest-game",
        data=json.dumps(payload),
        content_type="application/json",
    )
    assert r.status_code == 201
    data = r.get_json()
    assert "gameId" in data
    assert isinstance(data["gameId"], int)


def test_ingest_game_upsert(client):
    """Submit the same gameId twice — should update, not duplicate."""
    payload = {**VALID_INGEST_PAYLOAD, "opponent": "Ingest Test Opponent B"}
    r1 = client.post(
        "/api/ingest-game",
        data=json.dumps(payload),
        content_type="application/json",
    )
    assert r1.status_code == 201
    game_id = r1.get_json()["gameId"]

    payload2 = {**payload, "gameId": game_id, "vc_score": 60}
    r2 = client.post(
        "/api/ingest-game",
        data=json.dumps(payload2),
        content_type="application/json",
    )
    assert r2.status_code == 201
    assert r2.get_json()["gameId"] == game_id

    # Check the score was updated
    r3 = client.get(f"/api/game/{game_id}")
    assert r3.status_code == 200
    assert r3.get_json()["vc_score"] == 60


# ---------------------------------------------------------------------------
# Ingest endpoint — validation
# ---------------------------------------------------------------------------

def test_ingest_missing_required_field(client):
    bad_payload = {k: v for k, v in VALID_INGEST_PAYLOAD.items() if k != "date"}
    r = client.post(
        "/api/ingest-game",
        data=json.dumps(bad_payload),
        content_type="application/json",
    )
    assert r.status_code == 400
    assert "error" in r.get_json()


def test_ingest_invalid_score(client):
    bad_payload = {**VALID_INGEST_PAYLOAD, "vc_score": "not-a-number"}
    r = client.post(
        "/api/ingest-game",
        data=json.dumps(bad_payload),
        content_type="application/json",
    )
    assert r.status_code == 400


def test_ingest_empty_body(client):
    r = client.post("/api/ingest-game", data="", content_type="application/json")
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# AI routes return 503 when key not configured
# ---------------------------------------------------------------------------

def test_ai_chat_no_crash(client):
    """AI chat endpoint should return structured JSON (not crash) regardless of key."""
    r = client.post(
        "/api/ai/chat",
        data=json.dumps({"message": "hello"}),
        content_type="application/json",
    )
    # 200 = AI answered, 503 = no key configured — both are acceptable non-crash responses
    assert r.status_code in (200, 503)
    data = r.get_json()
    assert isinstance(data, dict)
    if r.status_code == 503:
        assert data.get("code") == "ai_unavailable"


def test_ai_analyze_no_crash(client):
    """AI analyze endpoint should return structured JSON (not crash)."""
    r = client.post(
        "/api/ai/analyze",
        data=json.dumps({"query": "how did we do?", "type": "general"}),
        content_type="application/json",
    )
    assert r.status_code in (200, 503)
    data = r.get_json()
    assert isinstance(data, dict)


def test_ai_chat_503_code_field(client, monkeypatch):
    """When API key is missing, response includes code=ai_unavailable."""
    import src.ai_service as ai_mod
    original_key = ai_mod.get_ai_service().api_key
    try:
        ai_mod.get_ai_service().api_key = ""
        r = client.post(
            "/api/ai/chat",
            data=json.dumps({"message": "test"}),
            content_type="application/json",
        )
        assert r.status_code == 503
        assert r.get_json()["code"] == "ai_unavailable"
    finally:
        ai_mod.get_ai_service().api_key = original_key
