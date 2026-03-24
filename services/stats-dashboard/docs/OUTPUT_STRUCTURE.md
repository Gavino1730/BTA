# BTA Team Stats Output - JSON Structure

**File:** `vc_stats_output.json`  
**Size:** Example output  
**Team:** BTA Team  
**Season:** 2026-2027 Test Season  

## Summary Stats
- **Record:** 3-1 (75%)
- **PPG:** 75.0
- **FG%:** 49.5%
- **3P%:** 40.0%
- **FT%:** 69.6%
- **RPG:** 33.8
- **APG:** 18.3

---

## JSON Structure Overview

### Root Level
```json
{
  "team": "BTA Team",
  "season": "2026-2027 Test Season",
  "games": [...],
  "player_game_logs": {...},
  "season_team_stats": {...},
  "season_player_stats": {...}
}
```

---

## 1. GAMES (Array of 4 games)

Each game contains:
```json
{
  "gameId": 1,
  "date": "Nov 3, 2026",
  "opponent": "Harbor Tech",
  "location": "home",
  "vc_score": 78,
  "opp_score": 64,
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
      "name": "T Morgan",
      "fg_made": 9,
      "fg_att": 16,
      "fg_pct": "56%",
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
- **gameId**: Unique game identifier
- **date**: Game date in format "Mon DD, YYYY"
- **opponent**: Opponent team name
- **location**: "home" or "away"
- **vc_score**: Tracked team points
- **opp_score**: Opponent points
- **result**: "W" or "L"
- **team_stats**: Tracked team box score
- **player_stats**: Individual player stats sorted by points (descending)

---

## 2. PLAYER GAME LOGS (Object with player names as keys)

```json
{
  "T Morgan": [
    {
      "gameId": 1,
      "date": "Nov 3, 2026",
      "opponent": "Harbor Tech",
      "location": "home",
      "stats": {
        "number": 20,
        "name": "T Morgan",
        "fg_made": 9,
        "fg_att": 16,
        "fg_pct": "56%",
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
  "J Carter": [...],
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
  "games": 4,
  "wins": 3,
  "losses": 1,
  "pts": 300,
  "fg": 111,
  "fga": 227,
  "fg3": 38,
  "fg3a": 100,
  "ft": 41,
  "fta": 58,
  "oreb": 35,
  "dreb": 100,
  "reb": 135,
  "asst": 73,
  "to": 44,
  "stl": 23,
  "blk": 11,
  "ppg": 75.0,
  "rpg": 33.8,
  "apg": 18.3,
  "fg_pct": 48.9,
  "fg3_pct": 38.0,
  "ft_pct": 70.7
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
  "T Morgan": {
    "name": "T Morgan",
    "games": 4,
    "pts": 85,
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
  "J Carter": {...},
  ...
}
```

### Stats Available for Each Player:
- **Games Played**: games
- **Totals**: pts, fg, fga, fg3, fg3a, ft, fta, oreb, dreb, reb, asst, to, stl, blk, fouls
- **Per-Game Averages**: ppg, rpg, apg
- **Shooting Percentages**: fg_pct, fg3_pct, ft_pct

---

## Games Included (4 Total)

| Game ID | Date | Opponent | Result | Score |
|---------|------|----------|--------|-------|
| 1 | Nov 3, 2026 | Harbor Tech | W | 78-64 |
| 2 | Nov 7, 2026 | Summit Prep | L | 66-70 |
| 3 | Nov 12, 2026 | Eastview Academy | W | 82-59 |
| 4 | Nov 18, 2026 | Northside HS | W | 74-68 |

---

## Players Tracked (9 Total)

1. J Carter (#1)
2. M Brooks (#2)
3. E Novak (#3)
4. O Price (#4)
5. N Kim (#5)
6. D Lane (#11)
7. T Morgan (#20)
8. L Reed (#22)
9. I Shaw (#24)

---

## How to Use This Data

### For ESPN-Style Website:

1. **Team Page**: Use `season_team_stats` for overview stats
2. **Schedule/Results**: Use `games` array with gameId and dates
3. **Box Scores**: Use `games[i].player_stats` and `games[i].team_stats`
4. **Player Pages**: Use `season_player_stats[playerName]` for season stats
5. **Game Logs**: Use `player_game_logs[playerName]` to show all games for a player

### Data Types:
- **Strings**: names, dates, percentages (with %)
- **Numbers**: scores, stats, totals
- **Floats**: per-game averages, percentages (decimal)

### Notes:
- Player names are formatted as initial + last name (e.g., "T Morgan")
- Percentages are stored as strings with % in stats fields, and as decimals in aggregate fields
- "-" indicates no attempts (e.g., no 3-pointers attempted)
- All stats aggregated from PDF stat sheets automatically
