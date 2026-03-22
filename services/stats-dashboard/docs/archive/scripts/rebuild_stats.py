import pdfplumber
import re
import json

pdf_files = [
    ('Knappa.pdf', 'Knappa', 'home'),
    ('Gladstone.pdf', 'Gladstone', 'home'),
    ('Scappoose.pdf', 'Scappoose', 'away'),
    ('Pleasant Hill.pdf', 'Pleasant Hill', 'home'),
    ('Banks.pdf', 'Banks', 'home'),
    ('Tillamook.pdf', 'Tillamook', 'away'),
    ('Jefferson.pdf', 'Jefferson', 'away'),
    ('Mid Pacific.pdf', 'Mid Pacific', 'away'),
    ('Regis.pdf', 'Regis', 'away'),
    ('Western.pdf', 'Western', 'home'),
    ('Horizon.pdf', 'Horizon', 'home'),
    ('Westside.pdf', 'Westside', 'away'),
    ('De La Salle.pdf', 'De La Salle', 'away'),
    ('OES.pdf', 'OES', 'home'),
    ('Catlin.pdf', 'Catlin Gabel', 'home'),
    ('Riverside.pdf', 'Riverside', 'home'),
    ('PAA2.pdf', 'PAA', 'away'),
    ('Horizon2.pdf', 'Horizon', 'home'),
    ('Westside2.pdf', 'Westside', 'away'),
    ('De La Salle2.pdf', 'De La Salle', 'away'),
    ('OES2.pdf', 'OES', 'home'),
    ('Catlin2.pdf', 'Catlin Gabel', 'away'),
    ('Riverside2.pdf', 'Riverside', 'away'),
]

import os
base_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'Stat Sheets', 'Stats')
games_data = []
player_game_logs = {}
season_player_stats = {}

game_id = 1
for pdf_name, opponent, location in pdf_files:
    pdf_path = os.path.join(base_path, pdf_name)
    
    with pdfplumber.open(pdf_path) as pdf:
        text = pdf.pages[0].extract_text()
        lines = text.split('\n')
        
        # Extract score
        score_line = None
        team_line = None
        for i, line in enumerate(lines[:5]):
            if re.match(r'^\d+\s+\d+$', line):
                score_line = line
                team_line = lines[i+1]
                break
        
        if not score_line or not team_line:
            continue
        
        score1, score2 = map(int, score_line.split())
        
        # Determine VC score
        if 'Valley' in team_line or 'Catholic' in team_line:
            vc_idx = 0 if ('Valley' in team_line.split()[0] or 'Catholic' in team_line.split()[0]) else 1
            vc_score = score1 if vc_idx == 0 else score2
            opp_score = score2 if vc_idx == 0 else score1
        
        # Extract date
        date_match = re.search(r'(\w+ \d+, \d+)', text)
        date = date_match.group(1) if date_match else "Unknown"
        result = 'W' if vc_score > opp_score else 'L'
        
        # Extract player stats and team totals
        players_in_game = []
        team_stats = {
            'fg': 0, 'fga': 0, 'fg3': 0, 'fg3a': 0, 'ft': 0, 'fta': 0,
            'oreb': 0, 'dreb': 0, 'reb': 0, 'asst': 0, 'to': 0, 'stl': 0, 'blk': 0, 'fouls': 0
        }
        
        for line in lines:
            match = re.match(r'#(\d+)\s+([A-Z]\.?\s+[A-Za-z\-]+)\s+(.+)', line)
            if match:
                number, name, stats_part = match.groups()
                number = int(number)
                name = name.strip().replace('. ', ' ')
                
                parts = stats_part.split()
                
                if len(parts) >= 14:
                    try:
                        fg_made, fg_att = map(int, parts[0].split('-'))
                        fg_pct = float(parts[1].rstrip('%')) if '%' in parts[1] else 0
                        
                        fg3_made, fg3_att = map(int, parts[2].split('-'))
                        fg3_pct = float(parts[3].rstrip('%')) if '%' in parts[3] else 0
                        
                        ft_made, ft_att = map(int, parts[4].split('-'))
                        ft_pct = float(parts[5].rstrip('%')) if '%' in parts[5] else 0
                        
                        oreb = int(parts[6])
                        dreb = int(parts[7])
                        fouls = int(parts[8])
                        stl = int(parts[9])
                        to = int(parts[10])
                        blk = int(parts[11])
                        asst = int(parts[12])
                        
                        # Parse +/- and pts
                        # Points are always the last column
                        pts = int(parts[-1])
                        
                        # +/- parsing depends on format
                        # Format A (15 parts): ... ASST +/- PTS  -> use parts[-2]
                        # Format B (16 parts): ... ASST +/- MINS PTS -> use parts[-3]
                        if len(parts) >= 16:
                            plus_minus_str = parts[-3]
                        elif len(parts) == 15:
                            plus_minus_str = parts[-2]
                        else:
                            plus_minus_str = '0'
                        
                        try:
                            plus_minus = int(plus_minus_str)
                        except:
                            plus_minus = 0
                        
                        player_stat = {
                            'number': number,
                            'name': name,
                            'fg_made': fg_made,
                            'fg_att': fg_att,
                            'fg_pct': f"{fg_pct:.0f}%" if fg_pct > 0 else "-",
                            'fg3_made': fg3_made,
                            'fg3_att': fg3_att,
                            'fg3_pct': f"{fg3_pct:.0f}%" if fg3_pct > 0 else "-",
                            'ft_made': ft_made,
                            'ft_att': ft_att,
                            'ft_pct': f"{ft_pct:.0f}%" if ft_pct > 0 else "-",
                            'oreb': oreb,
                            'dreb': dreb,
                            'fouls': fouls,
                            'stl': stl,
                            'to': to,
                            'blk': blk,
                            'asst': asst,
                            'pts': pts,
                            'plus_minus': plus_minus
                        }
                        
                        players_in_game.append(player_stat)
                        
                        # Add to team stats
                        team_stats['fg'] += fg_made
                        team_stats['fga'] += fg_att
                        team_stats['fg3'] += fg3_made
                        team_stats['fg3a'] += fg3_att
                        team_stats['ft'] += ft_made
                        team_stats['fta'] += ft_att
                        team_stats['oreb'] += oreb
                        team_stats['dreb'] += dreb
                        team_stats['asst'] += asst
                        team_stats['to'] += to
                        team_stats['stl'] += stl
                        team_stats['blk'] += blk
                        team_stats['fouls'] += fouls
                        
                    except:
                        pass
        
        team_stats['reb'] = team_stats['oreb'] + team_stats['dreb']
        
        # Store game
        games_data.append({
            'gameId': game_id,
            'date': date,
            'opponent': opponent,
            'location': location,
            'vc_score': vc_score,
            'opp_score': opp_score,
            'result': result,
            'team_stats': team_stats,
            'player_stats': players_in_game
        })
        
        game_id += 1

# Build player logs
all_players = set()
for game in games_data:
    for player in game['player_stats']:
        all_players.add(player['name'])

for player in sorted(all_players):
    player_game_logs[player] = []
    for game in games_data:
        for player_stat in game['player_stats']:
            if player_stat['name'] == player:
                player_game_logs[player].append({
                    'gameId': game['gameId'],
                    'date': game['date'],
                    'opponent': game['opponent'],
                    'location': game['location'],
                    'result': game['result'],
                    'stats': player_stat
                })

# Calculate season stats
for player in all_players:
    total_pts = 0
    total_fg = 0
    total_fga = 0
    total_fg3 = 0
    total_fg3a = 0
    total_ft = 0
    total_fta = 0
    total_oreb = 0
    total_dreb = 0
    total_asst = 0
    total_to = 0
    total_stl = 0
    total_blk = 0
    total_fouls = 0
    total_plus_minus = 0
    games_played = 0
    
    for log in player_game_logs[player]:
        stats = log['stats']
        total_pts += stats['pts']
        total_fg += stats['fg_made']
        total_fga += stats['fg_att']
        total_fg3 += stats['fg3_made']
        total_fg3a += stats['fg3_att']
        total_ft += stats['ft_made']
        total_fta += stats['ft_att']
        total_oreb += stats['oreb']
        total_dreb += stats['dreb']
        total_asst += stats['asst']
        total_to += stats['to']
        total_stl += stats['stl']
        total_blk += stats['blk']
        total_fouls += stats['fouls']
        total_plus_minus += stats.get('plus_minus', 0)
        games_played += 1
    
    ppg = total_pts / games_played if games_played > 0 else 0
    rpg = (total_oreb + total_dreb) / games_played if games_played > 0 else 0
    apg = total_asst / games_played if games_played > 0 else 0
    fg_pct = (total_fg / total_fga * 100) if total_fga > 0 else 0
    fg3_pct = (total_fg3 / total_fg3a * 100) if total_fg3a > 0 else 0
    ft_pct = (total_ft / total_fta * 100) if total_fta > 0 else 0
    
    season_player_stats[player] = {
        'name': player,
        'games': games_played,
        'pts': total_pts,
        'fg': total_fg,
        'fga': total_fga,
        'fg3': total_fg3,
        'fg3a': total_fg3a,
        'ft': total_ft,
        'fta': total_fta,
        'oreb': total_oreb,
        'dreb': total_dreb,
        'reb': total_oreb + total_dreb,
        'asst': total_asst,
        'to': total_to,
        'stl': total_stl,
        'blk': total_blk,
        'fouls': total_fouls,
        'plus_minus': total_plus_minus,
        'ppg': round(ppg, 1),
        'rpg': round(rpg, 1),
        'apg': round(apg, 1),
        'fg_pct': round(fg_pct, 1),
        'fg3_pct': round(fg3_pct, 1),
        'ft_pct': round(ft_pct, 1)
    }

# Calculate season team stats
season_team_stats = {
    'fg': 0, 'fga': 0, 'fg3': 0, 'fg3a': 0, 'ft': 0, 'fta': 0,
    'oreb': 0, 'dreb': 0, 'reb': 0, 'asst': 0, 'to': 0, 'stl': 0, 'blk': 0,
    'pf': 0, 'ppg': 0, 'win': 0, 'loss': 0
}

for game in games_data:
    stats = game['team_stats']
    season_team_stats['fg'] += stats['fg']
    season_team_stats['fga'] += stats['fga']
    season_team_stats['fg3'] += stats['fg3']
    season_team_stats['fg3a'] += stats['fg3a']
    season_team_stats['ft'] += stats['ft']
    season_team_stats['fta'] += stats['fta']
    season_team_stats['oreb'] += stats['oreb']
    season_team_stats['dreb'] += stats['dreb']
    season_team_stats['asst'] += stats['asst']
    season_team_stats['to'] += stats['to']
    season_team_stats['stl'] += stats['stl']
    season_team_stats['blk'] += stats['blk']
    season_team_stats['pf'] += stats.get('fouls', 0)
    
    if game['result'] == 'W':
        season_team_stats['win'] += 1
    else:
        season_team_stats['loss'] += 1

season_team_stats['reb'] = season_team_stats['oreb'] + season_team_stats['dreb']
games_count = len(games_data) if games_data else 1
season_team_stats['ppg'] = round(sum(g['vc_score'] for g in games_data) / games_count, 1) if games_data else 0
season_team_stats['rpg'] = round(season_team_stats['reb'] / games_count, 1)
season_team_stats['apg'] = round(season_team_stats['asst'] / games_count, 1)
season_team_stats['to_pg'] = round(season_team_stats['to'] / games_count, 1)
season_team_stats['stl_pg'] = round(season_team_stats['stl'] / games_count, 1)
season_team_stats['blk_pg'] = round(season_team_stats['blk'] / games_count, 1)
season_team_stats['oreb_pg'] = round(season_team_stats['oreb'] / games_count, 1)
season_team_stats['dreb_pg'] = round(season_team_stats['dreb'] / games_count, 1)
season_team_stats['fouls_pg'] = round(season_team_stats['pf'] / games_count, 1)
season_team_stats['fg_pct'] = round(season_team_stats['fg'] / season_team_stats['fga'] * 100, 1) if season_team_stats['fga'] > 0 else 0
season_team_stats['fg3_pct'] = round(season_team_stats['fg3'] / season_team_stats['fg3a'] * 100, 1) if season_team_stats['fg3a'] > 0 else 0
season_team_stats['ft_pct'] = round(season_team_stats['ft'] / season_team_stats['fta'] * 100, 1) if season_team_stats['fta'] > 0 else 0

# Build output JSON
output = {
    'team': 'Valley Catholic',
    'season': '2025-2026',
    'games': games_data,
    'player_game_logs': player_game_logs,
    'season_player_stats': season_player_stats,
    'season_team_stats': season_team_stats
}

# Write to file - both root and data directory
root_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'vc_stats_output.json')
data_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'vc_stats_output.json')

with open(root_path, 'w') as f:
    json.dump(output, f, indent=2)
    
with open(data_path, 'w') as f:
    json.dump(output, f, indent=2)

output_path = data_path

print(f"✓ Updated stats written to {output_path}")
print(f"  Record: {season_team_stats['win']}-{season_team_stats['loss']}")
print(f"  PPG: {season_team_stats['ppg']}")
print(f"  Players: {len(season_player_stats)}")
print(f"  Games: {len(games_data)}")
