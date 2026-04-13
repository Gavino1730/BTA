"""
USBL team extractor.

This script uses the same Supabase REST data source that usbl.com uses at
runtime. It auto-discovers the Supabase URL and anon key from the USBL web
bundle, then exports a BTA-friendly team JSON with:
- roster (with duplicate cleanup)
- season averages and totals
- per-player game logs
- full schedule/results

Usage:
  python scripts/scrape_team.py
  python scripts/scrape_team.py --out team-data.json
  python scripts/scrape_team.py --no-dedupe
  python scripts/scrape_team.py --supabase-url ... --anon-key ...
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests

USBL_BASE = "https://usbl.com"
TEAM_SLUG = "school-123"
DEFAULT_OUT = "team-data.json"

HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; BTA-DataExtractor/2.0)",
    "Accept": "application/json,text/html,*/*",
    "Accept-Language": "en-US,en;q=0.9",
}


def as_ascii(text: str | None) -> str:
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", text)
    return normalized.encode("ascii", "ignore").decode("ascii").strip()


def normalize_name(text: str) -> str:
    collapsed = re.sub(r"[^a-z0-9\s]", " ", as_ascii(text).lower())
    return " ".join(collapsed.split())


def split_name(first: str, last: str) -> tuple[str, str]:
    return normalize_name(first), normalize_name(last)


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        curr = [i]
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            curr.append(min(curr[-1] + 1, prev[j] + 1, prev[j - 1] + cost))
        prev = curr
    return prev[-1]


def decode_jwt_payload(token: str) -> dict[str, Any] | None:
    parts = token.split(".")
    if len(parts) != 3:
        return None
    payload = parts[1]
    payload += "=" * (-len(payload) % 4)
    try:
        decoded = base64.urlsafe_b64decode(payload.encode("ascii")).decode("utf-8")
        obj = json.loads(decoded)
        return obj if isinstance(obj, dict) else None
    except Exception:
        return None


def discover_supabase_config(session: requests.Session) -> tuple[str, str]:
    roster_url = f"{USBL_BASE}/teams/{TEAM_SLUG}/roster"
    roster_html = session.get(roster_url, headers=HTTP_HEADERS, timeout=25)
    roster_html.raise_for_status()

    bundle_match = re.search(r'src="(/assets/index-[^"]+\.js)"', roster_html.text)
    if not bundle_match:
        raise RuntimeError("Could not locate USBL frontend bundle URL.")

    bundle_url = urljoin(USBL_BASE, bundle_match.group(1))
    bundle_resp = session.get(bundle_url, headers=HTTP_HEADERS, timeout=35)
    bundle_resp.raise_for_status()
    bundle_text = bundle_resp.text

    url_match = re.search(r"https://[a-z0-9]+\.supabase\.co", bundle_text)
    if not url_match:
        raise RuntimeError("Could not find Supabase URL in USBL bundle.")
    supabase_url = url_match.group(0)

    jwt_candidates = re.findall(
        r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",
        bundle_text,
    )
    anon_key = ""
    for token in dict.fromkeys(jwt_candidates):
        payload = decode_jwt_payload(token)
        if payload and payload.get("iss") == "supabase" and payload.get("role") == "anon":
            anon_key = token
            break

    if not anon_key:
        raise RuntimeError("Could not find Supabase anon key in USBL bundle.")

    return supabase_url, anon_key


class SupabaseRestClient:
    def __init__(self, base_url: str, anon_key: str, session: requests.Session):
        self.base_url = base_url.rstrip("/")
        self.anon_key = anon_key
        self.session = session

    @property
    def headers(self) -> dict[str, str]:
        return {
            "apikey": self.anon_key,
            "Authorization": f"Bearer {self.anon_key}",
            "Accept": "application/json",
            "User-Agent": HTTP_HEADERS["User-Agent"],
        }

    def get(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        url = f"{self.base_url}/rest/v1/{table}"
        resp = self.session.get(url, params=params, headers=self.headers, timeout=30)
        if resp.status_code >= 400:
            preview = resp.text[:400]
            raise RuntimeError(f"Supabase query failed for {table}: {resp.status_code} {preview}")
        data = resp.json()
        if not isinstance(data, list):
            raise RuntimeError(f"Unexpected response shape for {table}: {type(data)}")
        return data

    def get_all(
        self,
        table: str,
        params: dict[str, str],
        page_size: int = 1000,
    ) -> list[dict[str, Any]]:
        offset = 0
        all_rows: list[dict[str, Any]] = []
        while True:
            page_params = dict(params)
            page_params["limit"] = str(page_size)
            page_params["offset"] = str(offset)
            rows = self.get(table, page_params)
            all_rows.extend(rows)
            if len(rows) < page_size:
                break
            offset += page_size
        return all_rows


def choose_best_stats_row(rows: list[dict[str, Any]]) -> dict[str, Any]:
    def row_key(row: dict[str, Any]) -> tuple[int, int, int]:
        return (
            int(row.get("games_played") or 0),
            int(row.get("total_minutes") or 0),
            int(row.get("total_points") or 0),
        )

    return max(rows, key=row_key)


def player_display_name(row: dict[str, Any]) -> str:
    p = row.get("player") or {}
    first = as_ascii(str(p.get("first_name") or "")).strip()
    last = as_ascii(str(p.get("last_name") or "")).strip()
    return " ".join(part for part in (first, last) if part) or "Unknown Player"


def same_identity(a: dict[str, Any], b: dict[str, Any]) -> bool:
    pa = a.get("player") or {}
    pb = b.get("player") or {}

    name_a = normalize_name(player_display_name(a))
    name_b = normalize_name(player_display_name(b))
    if name_a and name_a == name_b:
        return True

    jersey_a = a.get("jersey_number")
    jersey_b = b.get("jersey_number")
    if jersey_a is None or jersey_b is None:
        return False
    if str(jersey_a) != str(jersey_b):
        return False

    first_a, last_a = split_name(str(pa.get("first_name") or ""), str(pa.get("last_name") or ""))
    first_b, last_b = split_name(str(pb.get("first_name") or ""), str(pb.get("last_name") or ""))

    if not first_a or not first_b:
        return False
    if first_a[0] != first_b[0]:
        return False

    if last_a == last_b:
        return True
    if last_a and last_b and (last_a in last_b or last_b in last_a):
        return True
    return levenshtein(last_a, last_b) <= 2


def cluster_roster_rows(rows: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    clusters: list[list[dict[str, Any]]] = []
    for row in rows:
        matched = False
        for cluster in clusters:
            if any(same_identity(row, existing) for existing in cluster):
                cluster.append(row)
                matched = True
                break
        if not matched:
            clusters.append([row])
    return clusters


def row_score(
    row: dict[str, Any],
    averages_by_player: dict[str, dict[str, Any]],
    logs_by_player: dict[str, list[dict[str, Any]]],
) -> tuple[int, int, int, int]:
    player_id = str(row.get("player_id") or "")
    stats = averages_by_player.get(player_id, {})
    games_played = int(stats.get("games_played") or 0)
    logs_count = len(logs_by_player.get(player_id, []))
    player = row.get("player") or {}
    slug = str(player.get("slug") or "")
    has_position = 1 if player.get("position") else 0
    prefer_non_merged = 1 if "merged" not in slug else 0
    return (games_played, logs_count, has_position, prefer_non_merged)


def make_player_id(slug: str, fallback_name: str) -> str:
    if slug:
        safe = re.sub(r"[^a-z0-9]+", "-", slug.lower()).strip("-")
    else:
        safe = re.sub(r"[^a-z0-9]+", "-", normalize_name(fallback_name)).strip("-")
    return f"vwb-{safe or 'player'}"


def pct(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), 1)
    except (TypeError, ValueError):
        return None


def int_or_none(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def fmt_pair(made: Any, attempted: Any) -> str | None:
    m = int_or_none(made)
    a = int_or_none(attempted)
    if m is None or a is None:
        return None
    return f"{m}/{a}"


def build_player_notes(
    season_averages: dict[str, Any] | None,
    season_totals: dict[str, Any] | None,
    shooting_splits: dict[str, Any] | None,
) -> str:
    if not season_averages:
        return ""

    pieces: list[str] = []
    gp = int_or_none(season_averages.get("GP")) or 0
    stat_parts: list[str] = []
    for key in ("PPG", "RPG", "APG", "SPG", "BPG"):
        value = season_averages.get(key)
        if value is not None:
            stat_parts.append(f"{value} {key}")
    if gp and stat_parts:
        pieces.append(f"{gp} GP: " + ", ".join(stat_parts))

    if shooting_splits:
        shooting_parts: list[str] = []
        if shooting_splits.get("FGM/FGA"):
            shooting_parts.append(f"FG {shooting_splits['FGM/FGA']}")
        if shooting_splits.get("3PM/3PA"):
            shooting_parts.append(f"3P {shooting_splits['3PM/3PA']}")
        if shooting_splits.get("FTM/FTA"):
            shooting_parts.append(f"FT {shooting_splits['FTM/FTA']}")
        if shooting_parts:
            pieces.append(" | ".join(shooting_parts))

    if season_totals:
        totals_parts: list[str] = []
        for k in ("pts", "reb", "ast", "stl", "blk", "tov"):
            if season_totals.get(k) is not None:
                totals_parts.append(f"{season_totals[k]} {k}")
        if totals_parts:
            pieces.append("Totals: " + ", ".join(totals_parts))

    return " | ".join(pieces)


def drop_none(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: drop_none(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [drop_none(v) for v in value]
    return value


def season_label_from_year(season: dict[str, Any] | None) -> str:
    if not season:
        return "Current"
    year = int_or_none(season.get("year"))
    if year:
        prev = year - 1
        return f"{prev}-{str(year)[-2:]}"
    return as_ascii(str(season.get("name") or "Current"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract team data from USBL backend")
    parser.add_argument("--out", default=DEFAULT_OUT, help="Output path relative to repo root")
    parser.add_argument("--supabase-url", default="", help="Optional override for Supabase project URL")
    parser.add_argument("--anon-key", default="", help="Optional override for Supabase anon key")
    parser.add_argument(
        "--no-dedupe",
        action="store_true",
        help="Disable duplicate roster cleanup and keep all roster assignment rows",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).parent.parent
    out_path = repo_root / args.out

    session = requests.Session()

    print("Discovering USBL backend config...")
    if args.supabase_url and args.anon_key:
        supabase_url = args.supabase_url
        anon_key = args.anon_key
    else:
        supabase_url, anon_key = discover_supabase_config(session)
    print(f"  Supabase project: {supabase_url}")

    api = SupabaseRestClient(supabase_url, anon_key, session)

    print("Fetching team...")
    teams = api.get(
        "teams",
        {
            "slug": f"eq.{TEAM_SLUG}",
            "select": "id,slug,name,city,full_name,abbreviation,primary_color",
            "limit": "1",
        },
    )
    if not teams:
        raise RuntimeError(f"Team slug not found: {TEAM_SLUG}")
    team = teams[0]
    team_id = str(team["id"])

    seasons = api.get(
        "seasons",
        {
            "is_current": "eq.true",
            "select": "id,name,year,is_current",
            "limit": "1",
        },
    )
    current_season = seasons[0] if seasons else None
    season_id = str(current_season["id"]) if current_season else ""

    print("Fetching roster assignments...")
    roster_rows = api.get_all(
        "player_team_seasons",
        {
            "team_id": f"eq.{team_id}",
            "is_current": "eq.true",
            "select": (
                "id,player_id,jersey_number,is_current,"
                "player:players(id,first_name,last_name,slug,position,height,weight)"
            ),
            "order": "jersey_number.asc.nullslast",
        },
    )

    print("Fetching season averages...")
    avg_params = {
        "team_id": f"eq.{team_id}",
        "select": (
            "player_id,games_played,mpg,ppg,rpg,apg,spg,bpg,topg,fg_pct,three_pct,ft_pct,"
            "total_minutes,total_points,total_rebounds,total_assists,total_steals,total_blocks,"
            "total_turnovers,total_fgm,total_fga,total_tpm,total_tpa,total_ftm,total_fta"
        ),
    }
    if season_id:
        avg_params["season_id"] = f"eq.{season_id}"
    avg_rows = api.get_all("player_season_averages", avg_params)

    averages_by_player_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in avg_rows:
        pid = str(row.get("player_id") or "")
        if pid:
            averages_by_player_rows[pid].append(row)
    averages_by_player = {
        pid: choose_best_stats_row(rows) for pid, rows in averages_by_player_rows.items()
    }

    print("Fetching player game logs...")
    game_stat_params = {
        "team_id": f"eq.{team_id}",
        "select": (
            "player_id,minutes,points,rebounds,assists,steals,blocks,turnovers,fgm,fga,tpm,tpa,ftm,fta,"
            "game:games(game_date,status,home_team_id,away_team_id,home_score,away_score)"
        ),
        "order": "created_at.asc",
    }
    if season_id:
        game_stat_params["season_id"] = f"eq.{season_id}"
    stat_rows = api.get_all("player_game_stats", game_stat_params)

    print("Fetching schedule...")
    games = api.get_all(
        "games",
        {
            "or": f"(home_team_id.eq.{team_id},away_team_id.eq.{team_id})",
            "select": "id,game_date,status,home_team_id,away_team_id,home_score,away_score,venue",
            "order": "game_date.asc",
        },
    )

    related_team_ids = {team_id}
    for game in games:
        if game.get("home_team_id"):
            related_team_ids.add(str(game["home_team_id"]))
        if game.get("away_team_id"):
            related_team_ids.add(str(game["away_team_id"]))

    team_lookup: dict[str, dict[str, Any]] = {}
    if related_team_ids:
        ids_csv = ",".join(sorted(related_team_ids))
        team_rows = api.get_all(
            "teams",
            {
                "id": f"in.({ids_csv})",
                "select": "id,abbreviation,name,city,full_name",
            },
        )
        team_lookup = {str(row["id"]): row for row in team_rows}

    logs_by_player: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in stat_rows:
        player_id = str(row.get("player_id") or "")
        game = row.get("game") or {}
        if not player_id or not game:
            continue

        home_team_id = str(game.get("home_team_id") or "")
        away_team_id = str(game.get("away_team_id") or "")
        is_home = home_team_id == team_id
        opponent_id = away_team_id if is_home else home_team_id
        opponent = (team_lookup.get(opponent_id) or {}).get("abbreviation") or "UNK"

        home_score = int_or_none(game.get("home_score"))
        away_score = int_or_none(game.get("away_score"))
        vwb_score = home_score if is_home else away_score
        opp_score = away_score if is_home else home_score

        result = ""
        if game.get("status") == "final" and vwb_score is not None and opp_score is not None:
            result = "W" if vwb_score > opp_score else "L"

        entry = {
            "date": as_ascii(str(game.get("game_date") or "")),
            "opponent": opponent,
            "result": result,
            "status": as_ascii(str(game.get("status") or "")),
            "min": int_or_none(row.get("minutes")),
            "pts": int_or_none(row.get("points")),
            "reb": int_or_none(row.get("rebounds")),
            "ast": int_or_none(row.get("assists")),
            "stl": int_or_none(row.get("steals")),
            "blk": int_or_none(row.get("blocks")),
            "tov": int_or_none(row.get("turnovers")),
            "fg": fmt_pair(row.get("fgm"), row.get("fga")),
            "fg3": fmt_pair(row.get("tpm"), row.get("tpa")),
            "ft": fmt_pair(row.get("ftm"), row.get("fta")),
        }
        logs_by_player[player_id].append(drop_none(entry))

    for entries in logs_by_player.values():
        entries.sort(key=lambda item: item.get("date") or "")

    selected_roster_rows = roster_rows
    alias_map: dict[str, list[str]] = defaultdict(list)

    if not args.no_dedupe:
        clusters = cluster_roster_rows(roster_rows)
        deduped_rows: list[dict[str, Any]] = []
        for cluster in clusters:
            best = max(
                cluster,
                key=lambda row: row_score(row, averages_by_player, logs_by_player),
            )
            deduped_rows.append(best)

            aliases = []
            for row in cluster:
                if row is best:
                    continue
                aliases.append(player_display_name(row))
            if aliases:
                best_pid = str(best.get("player_id") or "")
                alias_map[best_pid] = sorted(set(aliases))

        selected_roster_rows = deduped_rows

    selected_roster_rows.sort(
        key=lambda row: (
            int_or_none(row.get("jersey_number")) if row.get("jersey_number") is not None else 999,
            player_display_name(row),
        )
    )

    players_payload: list[dict[str, Any]] = []
    for row in selected_roster_rows:
        player = row.get("player") or {}
        pid = str(row.get("player_id") or "")
        slug = as_ascii(str(player.get("slug") or ""))
        name = player_display_name(row)
        position = as_ascii(str(player.get("position") or ""))

        avg = averages_by_player.get(pid) or {}
        season_averages = {
            "GP": int_or_none(avg.get("games_played")),
            "MPG": pct(avg.get("mpg")),
            "PPG": pct(avg.get("ppg")),
            "RPG": pct(avg.get("rpg")),
            "APG": pct(avg.get("apg")),
            "SPG": pct(avg.get("spg")),
            "BPG": pct(avg.get("bpg")),
            "TOV": pct(avg.get("topg")),
            "FG%": pct(avg.get("fg_pct")),
            "3P%": pct(avg.get("three_pct")),
            "FT%": pct(avg.get("ft_pct")),
        }
        season_totals = {
            "pts": int_or_none(avg.get("total_points")),
            "reb": int_or_none(avg.get("total_rebounds")),
            "ast": int_or_none(avg.get("total_assists")),
            "stl": int_or_none(avg.get("total_steals")),
            "blk": int_or_none(avg.get("total_blocks")),
            "tov": int_or_none(avg.get("total_turnovers")),
        }
        shooting_splits = {
            "FGM/FGA": fmt_pair(avg.get("total_fgm"), avg.get("total_fga")),
            "3PM/3PA": fmt_pair(avg.get("total_tpm"), avg.get("total_tpa")),
            "FTM/FTA": fmt_pair(avg.get("total_ftm"), avg.get("total_fta")),
            "FG%": pct(avg.get("fg_pct")),
            "3PT%": pct(avg.get("three_pct")),
            "FT%": pct(avg.get("ft_pct")),
        }

        player_payload = {
            "id": make_player_id(slug, name),
            "number": "" if row.get("jersey_number") is None else str(row.get("jersey_number")),
            "name": name,
            "position": position,
            "height": as_ascii(str(player.get("height") or "")) or None,
            "weight": as_ascii(str(player.get("weight") or "")) or None,
            "seasonAverages": drop_none(season_averages) or None,
            "seasonTotals": drop_none(season_totals) or None,
            "shootingSplits": drop_none(shooting_splits) or None,
            "gameLog": logs_by_player.get(pid, []),
            "notes": build_player_notes(
                drop_none(season_averages),
                drop_none(season_totals),
                drop_none(shooting_splits),
            ),
            "sourcePlayerId": pid,
            "aliases": alias_map.get(pid) or None,
        }
        players_payload.append(drop_none(player_payload))

    schedule_payload: list[dict[str, Any]] = []
    wins = 0
    losses = 0

    for game in sorted(games, key=lambda g: (g.get("game_date") or "", g.get("id") or "")):
        home_team_id = str(game.get("home_team_id") or "")
        away_team_id = str(game.get("away_team_id") or "")
        is_home = home_team_id == team_id
        opponent_id = away_team_id if is_home else home_team_id
        opponent = (team_lookup.get(opponent_id) or {}).get("abbreviation") or "UNK"

        home_score = int_or_none(game.get("home_score"))
        away_score = int_or_none(game.get("away_score"))
        vwb_score = home_score if is_home else away_score
        opp_score = away_score if is_home else home_score

        status = as_ascii(str(game.get("status") or ""))
        result = None
        if status == "final" and vwb_score is not None and opp_score is not None:
            result = "W" if vwb_score > opp_score else "L"
            if result == "W":
                wins += 1
            else:
                losses += 1

        schedule_entry = {
            "date": as_ascii(str(game.get("game_date") or "")),
            "opponent": opponent,
            "home_away": "HOME" if is_home else "AWAY",
            "status": status,
            "result": result,
            "vwb_score": vwb_score,
            "opp_score": opp_score,
            "venue": as_ascii(str(game.get("venue") or "")) or None,
        }
        schedule_payload.append(drop_none(schedule_entry))

    record = f"{wins}-{losses}"
    season_label = season_label_from_year(current_season)

    output = {
        "teams": [
            {
                "id": "team-school-123",
                "name": as_ascii(str(team.get("full_name") or "Team Name")),
                "abbreviation": as_ascii(str(team.get("abbreviation") or "TEAM")),
                "season": season_label,
                "teamColor": as_ascii(str(team.get("primary_color") or "#000000")),
                "record": record,
                "conference": "Western",
                "arena": "Home Arena",
                "teamContext": (
                    "Semi-pro team in the USBL Western Conference. "
                    f"Season record {record}. "
                    "Data imported from USBL backend for setup/testing."
                ),
                "coachStyle": "balanced",
                "schedule": schedule_payload,
                "players": players_payload,
            }
        ]
    }

    out_path.write_text(json.dumps(output, indent=2, ensure_ascii=True), encoding="utf-8")

    print("\nDone.")
    print(f"  Output: {out_path}")
    print(f"  Roster assignments (raw): {len(roster_rows)}")
    print(f"  Players written: {len(players_payload)}")
    print(f"  Schedule games: {len(schedule_payload)}")
    print(f"  Final record: {record}")
    if not args.no_dedupe:
        print(f"  Deduped rows removed: {len(roster_rows) - len(players_payload)}")


if __name__ == "__main__":
    main()
