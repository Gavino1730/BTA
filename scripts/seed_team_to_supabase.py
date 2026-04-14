#!/usr/bin/env python3
"""
Seed a team dataset into your own Supabase project for BTA.

What this script does:
1) Creates/updates an owner user in Supabase Auth (Admin API).
2) Upserts school/team/player/game rows into BTA persistence tables via PostgREST.
3) Optionally upserts onboarding profile/member rows so the account is prelinked.

Important:
- Your realtime API must have initialized the schema in this Supabase database at least once.
  The expected tables are based on BTA's table base (default: realtime_snapshots).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import secrets
import sys
from datetime import datetime, timezone
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests


DEFAULT_INPUT = "demo-school-team.json"
DEFAULT_TABLE_BASE = "realtime_snapshots"


@dataclass
class SeedConfig:
    supabase_url: str
    service_role_key: str
    owner_email: str
    owner_password: str
    owner_name: str
    school_id: str
    table_base: str
    source_name: str
    include_games: bool
    allow_default_school: bool


class SeedError(RuntimeError):
    pass


def slugify(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    return normalized.strip("-") or "team"


def normalize_table_base(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9_]", "", value.strip().lower())
    return normalized or DEFAULT_TABLE_BASE


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def hash_password_for_bta(password: str, salt_hex: str) -> str:
    """Match Node scryptSync(password, salt, 64).toString('hex')."""
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt_hex.encode("utf-8"),
        n=16384,
        r=8,
        p=1,
        dklen=64,
    )
    return derived.hex()


def read_team_payload(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SeedError(f"Input file not found: {path}")

    data = json.loads(path.read_text(encoding="utf-8"))
    teams = data.get("teams") if isinstance(data, dict) else None
    if not isinstance(teams, list) or not teams:
        raise SeedError("Input must contain teams[0]")

    first_team = teams[0]
    if not isinstance(first_team, dict):
        raise SeedError("teams[0] must be an object")

    return first_team


def headers(service_role_key: str, prefer: str = "return=representation") -> dict[str, str]:
    return {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


def postgrest_upsert(
    session: requests.Session,
    supabase_url: str,
    service_role_key: str,
    table: str,
    rows: list[dict[str, Any]],
    conflict_columns: list[str],
) -> list[dict[str, Any]]:
    if not rows:
        return []

    conflict = ",".join(conflict_columns)
    url = f"{supabase_url.rstrip('/')}/rest/v1/{table}"
    params = {"on_conflict": conflict}

    response = session.post(
        url,
        headers=headers(service_role_key, prefer="resolution=merge-duplicates,return=representation"),
        params=params,
        json=rows,
        timeout=45,
    )
    if response.status_code >= 300:
        raise SeedError(
            f"Upsert failed for {table} ({response.status_code}): {response.text}"
        )

    parsed = response.json()
    if not isinstance(parsed, list):
        return []
    return [row for row in parsed if isinstance(row, dict)]


def create_or_update_auth_user(
    session: requests.Session,
    config: SeedConfig,
) -> tuple[str, bool]:
    base = config.supabase_url.rstrip("/")

    create_url = f"{base}/auth/v1/admin/users"
    create_payload = {
        "email": config.owner_email,
        "password": config.owner_password,
        "email_confirm": True,
        "user_metadata": {
            "name": config.owner_name,
            "full_name": config.owner_name,
        },
        "app_metadata": {
            "schoolId": config.school_id,
            "role": "owner",
        },
    }

    create_resp = session.post(create_url, headers=headers(config.service_role_key), json=create_payload, timeout=45)
    if create_resp.status_code in (200, 201):
        body = create_resp.json()
        user_id = str(body.get("id") or "").strip()
        if not user_id:
            raise SeedError("Supabase created user but did not return an id")
        return user_id, True

    if create_resp.status_code not in (400, 409, 422):
        raise SeedError(f"Auth user create failed ({create_resp.status_code}): {create_resp.text}")

    # User likely exists. Lookup by email, then patch app_metadata.
    list_url = f"{base}/auth/v1/admin/users"
    list_resp = session.get(
        list_url,
        headers=headers(config.service_role_key),
        params={"page": 1, "per_page": 1000},
        timeout=45,
    )
    if list_resp.status_code >= 300:
        raise SeedError(f"Auth user lookup failed ({list_resp.status_code}): {list_resp.text}")

    list_body = list_resp.json()
    users = list_body.get("users") if isinstance(list_body, dict) else None
    if not isinstance(users, list):
        raise SeedError("Unexpected auth admin users payload")

    matched = None
    for user in users:
        if not isinstance(user, dict):
            continue
        email = str(user.get("email") or "").strip().lower()
        if email == config.owner_email.lower():
            matched = user
            break

    if not matched:
        raise SeedError(
            "Owner email already reported as existing, but it was not returned by admin user list"
        )

    user_id = str(matched.get("id") or "").strip()
    if not user_id:
        raise SeedError("Matched auth user has no id")

    update_url = f"{base}/auth/v1/admin/users/{user_id}"
    update_payload = {
        "user_metadata": {
            "name": config.owner_name,
            "full_name": config.owner_name,
        },
        "app_metadata": {
            "schoolId": config.school_id,
            "role": "owner",
        },
    }
    update_resp = session.put(update_url, headers=headers(config.service_role_key), json=update_payload, timeout=45)
    if update_resp.status_code >= 300:
        raise SeedError(
            f"Auth user update failed ({update_resp.status_code}): {update_resp.text}"
        )

    return user_id, False


def build_seed_rows(team_payload: dict[str, Any], config: SeedConfig, source_name: str) -> dict[str, list[dict[str, Any]]]:
    team_name = str(team_payload.get("name") or "demo team").strip()
    team_id = str(team_payload.get("id") or f"team-{slugify(team_name)}").strip()
    abbreviation = str(team_payload.get("abbreviation") or team_name[:4].upper()).strip() or "TEAM"
    season = str(team_payload.get("season") or "").strip() or None

    school_row = [{"id": config.school_id}]

    team_row = [{
        "school_id": config.school_id,
        "id": team_id,
        "name": team_name,
        "abbreviation": abbreviation,
        "season": season,
        "team_color": team_payload.get("teamColor"),
        "coach_style": team_payload.get("coachStyle"),
        "playing_style": team_payload.get("playingStyle"),
        "team_context": team_payload.get("teamContext"),
        "custom_prompt": team_payload.get("customPrompt"),
        "focus_insights": team_payload.get("focusInsights"),
    }]

    players_in = team_payload.get("players") if isinstance(team_payload.get("players"), list) else []
    player_rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for idx, player in enumerate(players_in):
        if not isinstance(player, dict):
            continue
        player_id = str(player.get("id") or f"{team_id}-player-{idx+1}").strip()
        if not player_id:
            player_id = f"{team_id}-player-{idx+1}"
        if player_id in seen_ids:
            player_id = f"{player_id}-{idx+1}"
        seen_ids.add(player_id)

        notes_parts: list[str] = []
        base_notes = str(player.get("notes") or "").strip()
        if base_notes:
            notes_parts.append(base_notes)

        season_averages = player.get("seasonAverages")
        if isinstance(season_averages, dict):
            notes_parts.append(f"SeasonAverages: {json.dumps(season_averages, separators=(',', ':'))}")

        season_totals = player.get("seasonTotals")
        if isinstance(season_totals, dict):
            notes_parts.append(f"SeasonTotals: {json.dumps(season_totals, separators=(',', ':'))}")

        splits = player.get("shootingSplits")
        if isinstance(splits, dict):
            notes_parts.append(f"ShootingSplits: {json.dumps(splits, separators=(',', ':'))}")

        game_log = player.get("gameLog")
        if isinstance(game_log, list) and game_log:
            notes_parts.append(f"GameLog: {json.dumps(game_log, separators=(',', ':'))}")

        notes_value = " | ".join(notes_parts)

        player_rows.append({
            "school_id": config.school_id,
            "team_id": team_id,
            "id": player_id,
            "number": str(player.get("number") or "").strip(),
            "name": str(player.get("name") or f"Player {idx+1}").strip(),
            "position": str(player.get("position") or "").strip(),
            "height": player.get("height"),
            "weight": player.get("weight"),
            "grade": player.get("grade"),
            "role": player.get("role"),
            "notes": notes_value or None,
            "email": player.get("email"),
            "phone": player.get("phone"),
        })

    game_rows: list[dict[str, Any]] = []
    if config.include_games:
        schedule = team_payload.get("schedule") if isinstance(team_payload.get("schedule"), list) else []
        for idx, game in enumerate(schedule):
            if not isinstance(game, dict):
                continue

            date = str(game.get("date") or "unknown-date").strip() or "unknown-date"
            opponent = str(game.get("opponent") or "OPP").strip() or "OPP"
            home_away = str(game.get("home_away") or "HOME").upper()
            opponent_team_id = f"opp-{slugify(opponent)}"
            game_id = f"seed-{date}-{slugify(opponent)}-{idx+1}"

            is_home = home_away == "HOME"
            home_team_id = team_id if is_home else opponent_team_id
            away_team_id = opponent_team_id if is_home else team_id

            game_rows.append({
                "school_id": config.school_id,
                "game_id": game_id,
                "home_team_id": home_team_id,
                "away_team_id": away_team_id,
                "opponent_name": opponent,
                "opponent_team_id": opponent_team_id,
                "starting_lineup_by_team": None,
                "ai_settings": None,
                "ai_context": {
                    "seeded": True,
                    "source": source_name,
                    "status": game.get("status"),
                    "result": game.get("result"),
                    "vwb_score": game.get("vwb_score"),
                    "opp_score": game.get("opp_score"),
                    "venue": game.get("venue"),
                },
                "historical_context_summary": None,
                "historical_context_fetched_at_ms": None,
            })

    org_id = f"org-{slugify(team_name)}"
    now_iso = utc_now_iso()
    local_auth_salt = secrets.token_hex(16)
    local_auth_hash = hash_password_for_bta(config.owner_password, local_auth_salt)
    local_auth_account_id = f"local-{slugify(config.owner_email)}"
    org_profile_rows = [{
        "school_id": config.school_id,
        "organization_name": f"{team_name} Organization",
        "organization_slug": slugify(team_name),
        "coach_name": config.owner_name,
        "coach_email": config.owner_email,
        "team_name": team_name,
        "season": season,
        "completed_at_iso": None,
        "created_at_iso": now_iso,
        "updated_at_iso": now_iso,
    }]

    org_member_rows = [{
        "school_id": config.school_id,
        "member_id": f"member-{slugify(config.owner_email)}",
        "organization_id": org_id,
        "auth_subject": local_auth_account_id,
        "full_name": config.owner_name,
        "email": config.owner_email,
        "role": "owner",
        "status": "active",
        "invited_at_iso": None,
        "joined_at_iso": now_iso,
        "created_at_iso": now_iso,
        "updated_at_iso": now_iso,
    }]

    local_auth_rows = [{
        "school_id": config.school_id,
        "account_id": local_auth_account_id,
        "organization_id": org_id,
        "email": config.owner_email,
        "full_name": config.owner_name,
        "password_hash": local_auth_hash,
        "password_salt": local_auth_salt,
        "role": "owner",
        "status": "active",
        "created_at_iso": now_iso,
        "updated_at_iso": now_iso,
        "last_login_at_iso": None,
    }]

    return {
        "schools": school_row,
        "teams": team_row,
        "players": player_rows,
        "games": game_rows,
        "org_profiles": org_profile_rows,
        "org_members": org_member_rows,
        "local_auth": local_auth_rows,
    }


def run_seed(team_payload: dict[str, Any], config: SeedConfig) -> None:
    base = normalize_table_base(config.table_base)
    tables = {
        "schools": f"{base}_schools",
        "teams": f"{base}_teams",
        "players": f"{base}_players",
        "games": f"{base}_games",
        "org_profiles": f"{base}_org_profiles",
        "org_members": f"{base}_org_members",
        "local_auth": f"{base}_local_auth",
    }

    with requests.Session() as session:
        _owner_user_id, created = create_or_update_auth_user(session, config)
        rows = build_seed_rows(team_payload, config, config.source_name)

        postgrest_upsert(
            session,
            config.supabase_url,
            config.service_role_key,
            tables["schools"],
            rows["schools"],
            ["id"],
        )
        postgrest_upsert(
            session,
            config.supabase_url,
            config.service_role_key,
            tables["teams"],
            rows["teams"],
            ["school_id", "id"],
        )
        postgrest_upsert(
            session,
            config.supabase_url,
            config.service_role_key,
            tables["players"],
            rows["players"],
            ["school_id", "id"],
        )
        postgrest_upsert(
            session,
            config.supabase_url,
            config.service_role_key,
            tables["games"],
            rows["games"],
            ["school_id", "game_id"],
        )
        postgrest_upsert(
            session,
            config.supabase_url,
            config.service_role_key,
            tables["org_profiles"],
            rows["org_profiles"],
            ["school_id"],
        )
        postgrest_upsert(
            session,
            config.supabase_url,
            config.service_role_key,
            tables["org_members"],
            rows["org_members"],
            ["school_id", "member_id"],
        )
        postgrest_upsert(
            session,
            config.supabase_url,
            config.service_role_key,
            tables["local_auth"],
            rows["local_auth"],
            ["school_id", "account_id"],
        )

    print("Seed complete.")
    print(f"  Supabase: {config.supabase_url}")
    print(f"  School: {config.school_id}")
    print(f"  Owner user: {config.owner_email} ({'created' if created else 'updated'})")
    print(f"  Teams upserted: {len(rows['teams'])}")
    print(f"  Players upserted: {len(rows['players'])}")
    print(f"  Games upserted: {len(rows['games'])}")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed Vancouver team data into your own Supabase project")
    parser.add_argument("--input", default=DEFAULT_INPUT, help="Path to team JSON file")
    parser.add_argument("--supabase-url", default="", help="Supabase project URL, e.g. https://<ref>.supabase.co")
    parser.add_argument("--service-role-key", default="", help="Supabase service_role key")
    parser.add_argument("--owner-email", default="owner@example.com", help="Owner account email to create/update")
    parser.add_argument("--owner-password", default="12345678", help="Owner account password to set (min 8 chars)")
    parser.add_argument("--owner-name", default="Team Owner", help="Owner full name")
    parser.add_argument("--school-id", default="demo-school", help="Tenant school ID")
    parser.add_argument("--table-base", default=DEFAULT_TABLE_BASE, help="Base table name used by realtime API")
    parser.add_argument(
        "--include-games",
        action="store_true",
        help="Also seed schedule rows into <table-base>_games (disabled by default to avoid stale/discarded game reappearance)",
    )
    parser.add_argument(
        "--allow-default-school",
        action="store_true",
        help="Allow writing to school_id=default (disabled by default to avoid cross-tenant contamination)",
    )
    return parser.parse_args(argv)


def required(name: str, value: str) -> str:
    v = value.strip()
    if not v:
        raise SeedError(f"Missing required argument: {name}")
    return v


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    try:
        team_payload = read_team_payload(Path(args.input))

        config = SeedConfig(
            supabase_url=required("--supabase-url", args.supabase_url),
            service_role_key=required("--service-role-key", args.service_role_key),
            owner_email=required("--owner-email", args.owner_email).lower(),
            owner_password=required("--owner-password", args.owner_password),
            owner_name=args.owner_name.strip() or "Team Owner",
            school_id=(args.school_id.strip() or "demo-school"),
            table_base=args.table_base,
            source_name=Path(args.input).name,
            include_games=bool(args.include_games),
            allow_default_school=bool(args.allow_default_school),
        )

        if len(config.owner_password) < 8:
            raise SeedError("--owner-password must be at least 8 characters")

        if config.school_id == "default" and not config.allow_default_school:
            raise SeedError(
                "Refusing to seed school_id=default without --allow-default-school. "
                "Use a tenant-specific school id to avoid mixed-organization data."
            )

        run_seed(team_payload, config)
        return 0
    except SeedError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    except requests.RequestException as error:
        print(f"ERROR: Network failure: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
