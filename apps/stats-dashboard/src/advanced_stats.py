"""
Advanced Statistics Calculator
Calculates comprehensive metrics from box score data.
"""

import statistics
from typing import Dict, List, Any, Optional

# Constants
FREE_THROW_POSSESSION_FACTOR = 0.44
THREE_POINT_MULTIPLIER = 0.5
PRIMARY_SCORER_THRESHOLD = 20.0
SECONDARY_SCORER_THRESHOLD = 10.0
TURNOVER_THRESHOLD = 13
FG_PERCENTAGE_THRESHOLD = 44.0


class AdvancedStatsCalculator:
    """Calculate advanced metrics from box score data"""

    def __init__(self, stats_data: Dict):
        self.stats_data = stats_data
        self.games = stats_data.get("games", [])
        self.season_team_stats = stats_data.get("season_team_stats", {})
        self.season_player_stats = stats_data.get("season_player_stats", {})

    # =========================================================================
    # Team Stats
    # =========================================================================

    def calculate_team_advanced_stats(self) -> Dict:
        """Calculate advanced team-level statistics"""
        team = self.season_team_stats
        if not team or not self.games:
            return {}

        total_games = team.get("win", 0) + team.get("loss", 0)
        if total_games == 0:
            return {}

        # Estimated possessions
        est_poss = (
            team.get("fga", 0)
            + FREE_THROW_POSSESSION_FACTOR * team.get("fta", 0)
            - team.get("oreb", 0)
            + team.get("to", 0)
        )

        pts = team.get("ppg", 0) * total_games
        fga = team.get("fga", 0)
        fg = team.get("fg", 0)
        fg3 = team.get("fg3", 0)
        fg3a = team.get("fg3a", 0)
        fta = team.get("fta", 0)

        # 2-point calculations
        fg2 = fg - fg3
        fg2a = fga - fg3a

        # Scoring efficiency
        efg_pct = ((fg + 0.5 * fg3) / fga * 100) if fga > 0 else 0
        ts_pct = (pts / (2 * (fga + 0.44 * fta)) * 100) if (fga + fta) > 0 else 0
        ppp = pts / est_poss if est_poss > 0 else 0

        # Shot distribution
        pts_from_2 = fg2 * 2
        pts_from_3 = fg3 * 3
        pts_from_ft = team.get("ft", 0)

        return {
            "scoring_efficiency": {
                "ppg": team.get("ppg", 0),
                "ppp": round(ppp, 3),
                "fg_pct": team.get("fg_pct", 0),
                "fg2_pct": round((fg2 / fg2a * 100) if fg2a > 0 else 0, 1),
                "fg3_pct": team.get("fg3_pct", 0),
                "ft_pct": team.get("ft_pct", 0),
                "efg_pct": round(efg_pct, 1),
                "ts_pct": round(ts_pct, 1),
                "pts_per_shot": round(pts / fga if fga > 0 else 0, 2),
            },
            "shot_mix": {
                "fg3_attempt_rate": round((fg3a / fga * 100) if fga > 0 else 0, 1),
                "ft_rate": round((fta / fga * 100) if fga > 0 else 0, 1),
                "shot_balance": {
                    "2pt_share": round((pts_from_2 / pts * 100) if pts > 0 else 0, 1),
                    "3pt_share": round((pts_from_3 / pts * 100) if pts > 0 else 0, 1),
                    "ft_share": round((pts_from_ft / pts * 100) if pts > 0 else 0, 1),
                },
            },
            "possession_control": {
                "est_possessions": round(est_poss, 1),
                "to_per_100": round(
                    (team.get("to", 0) / est_poss * 100) if est_poss > 0 else 0, 1
                ),
                "ast_to_ratio": round(
                    (
                        team.get("asst", 0) / team.get("to", 1)
                        if team.get("to", 0) > 0
                        else 0
                    ),
                    2,
                ),
            },
            "ball_movement": {
                "apg": team.get("apg", 0),
                "ast_per_fg": round(team.get("asst", 0) / fg if fg > 0 else 0, 2),
                "assisted_scoring_rate": round(
                    (team.get("asst", 0) / fg * 100) if fg > 0 else 0, 1
                ),
            },
            "defense": {
                "spg": round(team.get("stl", 0) / total_games, 1),
                "bpg": round(team.get("blk", 0) / total_games, 1),
            },
            "discipline": {
                "fpg": (
                    round(team.get("fouls", 0) / total_games, 1)
                    if "fouls" in team
                    else 0
                ),
            },
        }

    # =========================================================================
    # Player Stats
    # =========================================================================

    def calculate_player_advanced_stats(self, player_name: str) -> Optional[Dict]:
        """Calculate advanced stats for a specific player"""
        if player_name not in self.season_player_stats:
            return None

        player = self.season_player_stats[player_name]
        team = self.season_team_stats
        games = player.get("games", 0)

        if games == 0:
            return None

        # Basic stats
        pts = player.get("ppg", 0) * games
        fga = player.get("fga", 0)
        fta = player.get("fta", 0)
        fg = player.get("fg", 0)
        fg3 = player.get("fg3", 0)
        fg3a = player.get("fg3a", 0)
        ft = player.get("ft", 0)
        to = player.get("to", 0)
        ast = player.get("asst", 0)
        reb = player.get("reb", 0)
        stl = player.get("stl", 0)
        blk = player.get("blk", 0)
        fouls = player.get("fouls", 0)

        # Advanced shooting
        efg_pct = ((fg + THREE_POINT_MULTIPLIER * fg3) / fga * 100) if fga > 0 else 0
        ts_pct = (
            (pts / (2 * (fga + FREE_THROW_POSSESSION_FACTOR * fta)) * 100)
            if (fga + fta) > 0
            else 0
        )

        # 2-point stats
        fg2a = fga - fg3a
        fg2 = fg - fg3
        fg2_pct = (fg2 / fg2a * 100) if fg2a > 0 else 0

        # Usage
        team_fga = team.get("fga", 0)
        team_fta = team.get("fta", 0)
        team_to = team.get("to", 0)
        total_team_games = team.get("win", 0) + team.get("loss", 0)

        usage_proxy = (
            (
                (fga + FREE_THROW_POSSESSION_FACTOR * fta + to)
                / (team_fga + FREE_THROW_POSSESSION_FACTOR * team_fta + team_to)
                * 100
            )
            if (team_fga + team_fta + team_to) > 0
            else 0
        )
        scoring_share = (
            (pts / (team.get("ppg", 0) * total_team_games) * 100)
            if team.get("ppg", 0) > 0 and total_team_games > 0
            else 0
        )
        shot_volume_share = (fga / team_fga * 100) if team_fga > 0 else 0

        # Efficiency rating
        per = (
            (pts + reb + ast + stl + blk - (fga - fg) - (fta - ft) - to) / games
            if games > 0
            else 0
        )

        # Turnover rate
        est_poss = fga + 0.44 * fta + to
        to_rate = (to / est_poss * 100) if est_poss > 0 else 0

        # Game logs for consistency
        game_logs = self.stats_data.get("player_game_logs", {}).get(player_name, [])
        pts_list = [g.get("stats", g).get("pts", 0) for g in game_logs]
        pts_variance = self._variance(pts_list)

        # Clutch games
        clutch_games = [
            g
            for g in game_logs
            if abs(g.get("team_score", 0) - g.get("opp_score", 0)) <= 10
        ]
        clutch_ppg = (
            sum(g.get("stats", g).get("pts", 0) for g in clutch_games)
            / len(clutch_games)
            if clutch_games
            else 0
        )

        # Role classification
        role = self._classify_role(
            player.get("ppg", 0), reb / games, ast / games, usage_proxy
        )

        return {
            "scoring_efficiency": {
                "ppg": player.get("ppg", 0),
                "pts_per_shot": round(pts / fga if fga > 0 else 0, 2),
                "efg_pct": round(efg_pct, 1),
                "ts_pct": round(ts_pct, 1),
                "fg_pct": player.get("fg_pct", 0),
                "fg2_pct": round(fg2_pct, 1),
                "fg3_pct": player.get("fg3_pct", 0),
                "ft_pct": player.get("ft_pct", 0),
                "per": round(per, 1),
            },
            "usage_role": {
                "usage_proxy": round(usage_proxy, 1),
                "scoring_share": round(scoring_share, 1),
                "shot_volume_share": round(shot_volume_share, 1),
                "to_rate": round(to_rate, 1),
                "role": role,
                "primary_scorer": scoring_share >= PRIMARY_SCORER_THRESHOLD,
                "secondary_scorer": SECONDARY_SCORER_THRESHOLD
                <= scoring_share
                < PRIMARY_SCORER_THRESHOLD,
            },
            "ball_handling": {
                "apg": round(ast / games, 1) if games > 0 else 0,
                "ast_to_ratio": round(ast / to if to > 0 else 0, 2),
                "tpg": round(to / games, 1) if games > 0 else 0,
                "total_assists": ast,
                "total_turnovers": to,
            },
            "rebounding": {
                "rpg": player.get("rpg", 0),
                "oreb": player.get("oreb", 0),
                "dreb": player.get("dreb", 0),
                "reb_share": round(
                    (reb / team.get("reb", 1) * 100) if team.get("reb", 0) > 0 else 0, 1
                ),
            },
            "defense_activity": {
                "spg": round(stl / games, 1) if games > 0 else 0,
                "bpg": round(blk / games, 1) if games > 0 else 0,
                "defensive_rating": round((stl + blk) / games, 1) if games > 0 else 0,
                "deflections_per_game": (
                    round((stl + blk) / games, 1) if games > 0 else 0
                ),
            },
            "discipline": {
                "fpg": round(fouls / games, 1) if games > 0 else 0,
            },
            "consistency": {
                "pts_variance": round(pts_variance, 1),
                "consistency_score": round(100 - pts_variance, 1),
                "games_played": games,
            },
            "clutch_performance": {
                "clutch_games": len(clutch_games),
                "clutch_ppg": round(clutch_ppg, 1),
                "clutch_factor": round(
                    (
                        clutch_ppg / player.get("ppg", 1)
                        if player.get("ppg", 0) > 0
                        else 0
                    ),
                    2,
                ),
            },
            "impact": {
                "plus_minus": player.get("plus_minus", 0),
                "pm_per_game": (
                    round(player.get("plus_minus", 0) / games, 1) if games > 0 else 0
                ),
            },
        }

    # =========================================================================
    # Game Stats
    # =========================================================================

    def calculate_game_advanced_stats(self, game_id: int) -> Optional[Dict]:
        """Calculate advanced stats for a specific game"""
        game = next((g for g in self.games if g["gameId"] == game_id), None)
        if not game:
            return None

        ts = game.get("team_stats", {})
        if not ts:
            return None

        pts = game.get("vc_score", 0)
        fga = ts.get("fga", 0)
        fg = ts.get("fg", 0)
        fg3 = ts.get("fg3", 0)
        fta = ts.get("fta", 0)

        est_poss = (
            fga
            + FREE_THROW_POSSESSION_FACTOR * fta
            - ts.get("oreb", 0)
            + ts.get("to", 0)
        )
        ppp = pts / est_poss if est_poss > 0 else 0
        efg_pct = ((fg + THREE_POINT_MULTIPLIER * fg3) / fga * 100) if fga > 0 else 0
        ts_pct = (
            (pts / (2 * (fga + FREE_THROW_POSSESSION_FACTOR * fta)) * 100)
            if (fga + fta) > 0
            else 0
        )

        return {
            "game_id": game_id,
            "opponent": game["opponent"],
            "result": game["result"],
            "score": f"{game['vc_score']}-{game['opp_score']}",
            "efficiency": {
                "ppp": round(ppp, 3),
                "efg_pct": round(efg_pct, 1),
                "ts_pct": round(ts_pct, 1),
                "fg_pct": round(fg / fga * 100, 1) if fga > 0 else 0,
            },
            "possession": {
                "est_poss": round(est_poss, 1),
                "to_per_100": round(
                    (ts["to"] / est_poss * 100) if est_poss > 0 else 0, 1
                ),
                "ast_to_ratio": round(ts["asst"] / ts["to"] if ts["to"] > 0 else 0, 2),
            },
            "ball_movement": {
                "assists": ts["asst"],
                "ast_pct": round((ts["asst"] / fg * 100) if fg > 0 else 0, 1),
            },
        }

    # =========================================================================
    # Patterns & Insights
    # =========================================================================

    def calculate_win_loss_patterns(self) -> Dict:
        """Identify win/loss patterns"""
        wins = [g for g in self.games if g["result"] == "W"]
        losses = [g for g in self.games if g["result"] == "L"]

        def get_fg_pcts(games):
            return [
                g["team_stats"]["fg"] / g["team_stats"]["fga"] * 100
                for g in games
                if g["team_stats"]["fga"] > 0
            ]

        win_fg = get_fg_pcts(wins)
        loss_fg = get_fg_pcts(losses)
        win_tos = [g["team_stats"]["to"] for g in wins]
        loss_tos = [g["team_stats"]["to"] for g in losses]

        # Threshold records
        low_to_games = [
            g for g in self.games if g["team_stats"]["to"] <= TURNOVER_THRESHOLD
        ]
        high_fg_games = [
            g
            for g in self.games
            if g["team_stats"]["fga"] > 0
            and g["team_stats"]["fg"] / g["team_stats"]["fga"] * 100
            >= FG_PERCENTAGE_THRESHOLD
        ]

        return {
            "win_conditions": {
                "avg_fg_pct": round(statistics.mean(win_fg), 1) if win_fg else 0,
                "min_fg_pct": round(min(win_fg), 1) if win_fg else 0,
                "avg_to": round(statistics.mean(win_tos), 1) if win_tos else 0,
                "max_to": max(win_tos) if win_tos else 0,
            },
            "loss_conditions": {
                "avg_fg_pct": round(statistics.mean(loss_fg), 1) if loss_fg else 0,
                "avg_to": round(statistics.mean(loss_tos), 1) if loss_tos else 0,
            },
            "threshold_records": {
                f"to_{TURNOVER_THRESHOLD}_or_less": f"{len([g for g in low_to_games if g['result'] == 'W'])}-{len([g for g in low_to_games if g['result'] == 'L'])}",
                f"fg_{int(FG_PERCENTAGE_THRESHOLD)}_or_higher": f"{len([g for g in high_fg_games if g['result'] == 'W'])}-{len([g for g in high_fg_games if g['result'] == 'L'])}",
            },
            "total_wins": len(wins),
            "total_losses": len(losses),
        }

    def calculate_volatility_metrics(self) -> Dict:
        """Calculate variance and consistency metrics"""
        game_pts = [g["vc_score"] for g in self.games]
        game_fg = [
            g["team_stats"]["fg"] / g["team_stats"]["fga"] * 100
            for g in self.games
            if g["team_stats"]["fga"] > 0
        ]
        game_tos = [g["team_stats"]["to"] for g in self.games]

        team_volatility = {
            "ppg_std_dev": (
                round(statistics.stdev(game_pts), 1) if len(game_pts) > 1 else 0
            ),
            "ppg_range": f"{min(game_pts)}-{max(game_pts)}" if game_pts else "0-0",
            "fg_pct_std_dev": (
                round(statistics.stdev(game_fg), 1) if len(game_fg) > 1 else 0
            ),
            "to_std_dev": (
                round(statistics.stdev(game_tos), 1) if len(game_tos) > 1 else 0
            ),
        }

        # Top 5 scorers volatility
        top_scorers = sorted(
            self.season_player_stats.values(),
            key=lambda x: x.get("ppg", 0),
            reverse=True,
        )[:5]

        player_volatility = []
        logs = self.stats_data.get("player_game_logs", {})

        for p in top_scorers:
            name = p.get("name")
            if not name or name not in logs:
                continue

            pts_list = [g.get("stats", g).get("pts", 0) for g in logs[name]]
            if len(pts_list) > 1:
                player_volatility.append(
                    {
                        "name": name,
                        "ppg": p.get("ppg", 0),
                        "std_dev": round(statistics.stdev(pts_list), 1),
                        "range": f"{min(pts_list)}-{max(pts_list)}",
                    }
                )

        return {
            "team_volatility": team_volatility,
            "player_volatility": player_volatility,
        }

    def generate_auto_insights(self) -> List[str]:
        """Generate data-driven insights"""
        insights = []
        patterns = self.calculate_win_loss_patterns()

        if patterns["win_conditions"]["max_to"] <= 15:
            insights.append(
                f"Team is {patterns['total_wins']}-0 when TO ≤ {patterns['win_conditions']['max_to']}"
            )

        if patterns["win_conditions"]["min_fg_pct"] > 0:
            insights.append(
                f"Undefeated when FG% ≥ {patterns['win_conditions']['min_fg_pct']}%"
            )

        if patterns["total_losses"] > 0:
            insights.append(
                f"In losses: {patterns['loss_conditions']['avg_to']:.1f} TO vs {patterns['win_conditions']['avg_to']:.1f} in wins"
            )

        insights.append(
            f"Record with TO ≤ 13: {patterns['threshold_records']['to_13_or_less']}"
        )
        insights.append(
            f"Record with FG% ≥ 44%: {patterns['threshold_records']['fg_44_or_higher']}"
        )

        return insights

    # =========================================================================
    # Helpers
    # =========================================================================

    def _variance(self, values: List[float]) -> float:
        """Calculate variance safely"""
        if len(values) < 2:
            return 0
        try:
            return statistics.variance(values)
        except:
            return 0

    def _classify_role(self, ppg: float, rpg: float, apg: float, usage: float) -> str:
        """Classify player role based on stats"""
        if ppg >= 20 and usage >= 25:
            return "Primary Scorer"
        elif ppg >= 15 and usage >= 20:
            return "Secondary Scorer"
        elif apg >= 4 and usage >= 15:
            return "Playmaker"
        elif rpg >= 8:
            return "Rebounder"
        elif ppg >= 12:
            return "Shooter"
        elif ppg < 8 and rpg < 5 and apg < 3:
            return "Role Player"
        return "All-Around"
