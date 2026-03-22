# Valley Catholic Stats Output - JSON Structure

**File:** `vc_stats_output.json`  
**Size:** 126 KB  
**Team:** Valley Catholic (Valiants)  
**Season:** 2025-2026  

## Summary Stats
- **Record:** 8-1 (89%)
- **PPG:** 83.3
- **FG%:** 47.0%
- **3P%:** 32.0%
- **FT%:** 73.0%
- **RPG:** 32.0
- **APG:** 18.4

---

## JSON Structure Overview

### Root Level
```json
{
  "team": "Valley Catholic",
  "season": "2025-2026",
  "games": [...],
  "player_game_logs": {...},
  "season_team_stats": {...},
  "season_player_stats": {...}
}
```

---

## 1. GAMES (Array of 9 games)

Each game contains:
```json
{
  "gameId": 5,
  "date": "Dec 16, 2025",
  "opponent": "Banks",
  "location": "home",
  "vc_score": 87,
  "opp_score": 65,
  "result": "W",
  "team_stats": {
    "fg": 32,
    "fga": 68,
    "fg3": 11,
    "fg3a": 28,
    "ft": 12,
    "fta": 19,
    "oreb": 7,
    "dreb": 11,
    "reb": 18,
    "asst": 17,
    "to": 12,
    "stl": 24,
    "blk": 7
  },
  "player_stats": [
    {
      "number": 20,
      "name": "H Lomber",
      "fg_made": 11,
      "fg_att": 24,
      "fg_pct": "46%",
      "fg3_made": 3,
      "fg3_att": 9,
      "fg3_pct": "33%",
      "ft_made": 4,
      "ft_att": 4,
      "ft_pct": "100%",
      "oreb": 0,
      "dreb": 3,
      "fouls": 3,
      "stl": 7,
      "to": 4,
      "blk": 3,
      "asst": 0,
      "pts": 30
    },
    ...
  ]
}
```

### Key Fields:
- **gameId**: Unique game identifier (1-9)
- **date**: Game date in format "Mon DD, YYYY"
- **opponent**: Opponent team name
- **location**: "home" or "away"
- **vc_score**: Valley Catholic points
- **opp_score**: Opponent points
- **result**: "W" or "L"
- **team_stats**: Valley Catholic team box score
- **player_stats**: Individual player stats sorted by points (descending)

---

## 2. PLAYER GAME LOGS (Object with player names as keys)

```json
{
  "H Lomber": [
    {
      "gameId": 1,
      "date": "Dec 3, 2025",
      "opponent": "Valley",
      "location": "away",
      "stats": {
        "number": 20,
        "name": "H Lomber",
        "fg_made": 10,
        "fg_att": 21,
        "fg_pct": "48%",
        "fg3_made": 3,
        "fg3_att": 8,
        "fg3_pct": "38%",
        "ft_made": 7,
        "ft_att": 8,
        "ft_pct": "88%",
        "oreb": 5,
        "dreb": 4,
        "fouls": 3,
        "stl": 3,
        "to": 1,
        "blk": 1,
        "asst": 0,
        "pts": 30
      }
    },
    ...
  ],
  "M Mehta": [...],
  ...
}
```

### Usage:
- Filter by player name to see all game logs for that player
- Track performance trends throughout the season
- Compare stats across opponents and locations

---

## 3. SEASON TEAM STATS (Object)

```json
{
  "games": 9,
  "wins": 8,
  "losses": 1,
  "pts": 750,
  "fg": 424,
  "fga": 903,
  "fg3": 288,
  "fg3a": 900,
  "ft": 657,
  "fta": 900,
  "oreb": 145,
  "dreb": 143,
  "reb": 288,
  "asst": 166,
  "to": 117,
  "stl": 165,
  "blk": 31,
  "ppg": 83.3,
  "rpg": 32.0,
  "apg": 18.4,
  "fg_pct": 47.0,
  "fg3_pct": 32.0,
  "ft_pct": 73.0
}
```

### Metrics Included:
- **Wins/Losses**: Win-loss record
- **Totals**: FG, FGA, 3P, 3PA, FT, FTA, OREB, DREB, REB, ASST, TO, STL, BLK
- **Per-Game Averages**: PPG, RPG, APG
- **Shooting Percentages**: FG%, 3P%, FT%

---

## 4. SEASON PLAYER STATS (Object with player names as keys)

```json
{
  "H Lomber": {
    "name": "H Lomber",
    "games": 9,
    "pts": 185,
    "fg": 81,
    "fga": 161,
    "fg3": 20,
    "fg3a": 60,
    "ft": 29,
    "fta": 32,
    "oreb": 20,
    "dreb": 31,
    "reb": 51,
    "asst": 14,
    "to": 19,
    "stl": 30,
    "blk": 9,
    "fouls": 24,
    "ppg": 20.6,
    "rpg": 5.7,
    "apg": 1.6,
    "fg_pct": 50.3,
    "fg3_pct": 33.3,
    "ft_pct": 90.6
  },
  "M Mehta": {...},
  ...
}
```

### Stats Available for Each Player:
- **Games Played**: games
- **Totals**: pts, fg, fga, fg3, fg3a, ft, fta, oreb, dreb, reb, asst, to, stl, blk, fouls
- **Per-Game Averages**: ppg, rpg, apg
- **Shooting Percentages**: fg_pct, fg3_pct, ft_pct

---

## Games Included (9 Total)

| Game ID | Date | Opponent | Result | Score |
|---------|------|----------|--------|-------|
| 1 | Dec 3, 2025 | Knappa | W | 83-58 |
| 2 | Dec 5, 2025 | Gladstone | W | 88-41 |
| 3 | Dec 9, 2025 | Scappoose | L | 69-90 |
| 4 | Dec 12, 2025 | Pleasant Hill | W | 73-45 |
| 5 | Dec 16, 2025 | Banks | W | 87-65 |
| 6 | Dec 22, 2025 | Tillamook | W | 85-35 |
| 7 | Dec 28, 2025 | Jefferson | W | 97-13 |
| 8 | Dec 29, 2025 | Mid Pacific | W | 80-54 |
| 9 | Dec 30, 2025 | Regis | W | 92-86 |

---

## Players Tracked (13 Total)

1. A Post (#2)
2. C Bonnett (#1)
3. E Schaal (#15)
4. G Frank (#23)
5. G Galan (#3)
6. H Lomber (#20)
7. K Fixter (#4)
8. L Plep (#44)
9. M Gunther (#10)
10. M Mehta (#24)
11. M Mueller (#5)
12. S Robbins (#22)
13. T Eddy (#11)

---

## How to Use This Data

### For ESPN-Style Website:

1. **Team Page**: Use `season_team_stats` for overview stats
2. **Schedule/Results**: Use `games` array with gameId and dates
3. **Box Scores**: Use `games[i].player_stats` and `games[i].team_stats`
4. **Player Pages**: Use `season_player_stats[playerName]` for career stats
5. **Game Logs**: Use `player_game_logs[playerName]` to show all games for a player

### Data Types:
- **Strings**: names, dates, percentages (with %)
- **Numbers**: scores, stats, totals
- **Floats**: per-game averages, percentages (decimal)

### Notes:
- Player names are formatted as initial + last name (e.g., "H Lomber")
- Percentages are stored as strings with % in stats fields, and as decimals in aggregate fields
- "-" indicates no attempts (e.g., no 3-pointers attempted)
- All stats aggregated from PDF stat sheets automatically
