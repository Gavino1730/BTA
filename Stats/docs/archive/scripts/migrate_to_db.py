#!/usr/bin/env python3
"""
Migration script to move data from JSON files to PostgreSQL database
Run this script to populate the database with existing data
"""

import os
import sys
import json
from datetime import datetime

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from flask import Flask
from models import db, Game, Player, PlayerGameStats, SeasonStats
from config import Config

def create_app():
    """Create Flask app for migration"""
    app = Flask(__name__)
    app.config.from_object(Config)
    
    # Override database URL for local migration with SQLite
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///basketball_stats.db'
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {'pool_pre_ping': True}
    
    db.init_app(app)
    return app

def load_json_data():
    """Load existing JSON data"""
    print("Loading JSON data...")
    
    # Load main stats data
    with open('data/vc_stats_output.json', 'r') as f:
        stats_data = json.load(f)
    
    # Load roster data
    with open('data/roster.json', 'r') as f:
        roster_data = json.load(f)
    
    print(f"Loaded {len(stats_data.get('games', []))} games")
    print(f"Loaded {len(stats_data.get('season_player_stats', {}))} players")
    print(f"Loaded {len(roster_data.get('roster', []))} roster entries")
    
    return stats_data, roster_data

def migrate_players(stats_data, roster_data):
    """Migrate player data"""
    print("\nMigrating players...")
    
    # Create roster lookup
    roster_dict = {p['name']: p for p in roster_data['roster']}
    
    migrated_count = 0
    for player_name, player_stats in stats_data.get('season_player_stats', {}).items():
        # Check if player already exists
        existing_player = Player.query.filter_by(name=player_name).first()
        if existing_player:
            print(f"  Player {player_name} already exists, updating...")
            player = existing_player
        else:
            player = Player(name=player_name)
        
        # Update player data from stats
        player.games = player_stats.get('games', 0)
        player.pts = player_stats.get('pts', 0)
        player.fg = player_stats.get('fg', 0)
        player.fga = player_stats.get('fga', 0)
        player.fg3 = player_stats.get('fg3', 0)
        player.fg3a = player_stats.get('fg3a', 0)
        player.ft = player_stats.get('ft', 0)
        player.fta = player_stats.get('fta', 0)
        player.oreb = player_stats.get('oreb', 0)
        player.dreb = player_stats.get('dreb', 0)
        player.reb = player_stats.get('reb', 0)
        player.asst = player_stats.get('asst', 0)
        player.to = player_stats.get('to', 0)
        player.stl = player_stats.get('stl', 0)
        player.blk = player_stats.get('blk', 0)
        player.fouls = player_stats.get('fouls', 0)
        player.ppg = player_stats.get('ppg', 0.0)
        player.rpg = player_stats.get('rpg', 0.0)
        player.apg = player_stats.get('apg', 0.0)
        player.fg_pct = player_stats.get('fg_pct', 0.0)
        player.fg3_pct = player_stats.get('fg3_pct', 0.0)
        player.ft_pct = player_stats.get('ft_pct', 0.0)
        
        # Add roster info if available
        if player_name in roster_dict:
            roster_info = roster_dict[player_name]
            player.number = roster_info.get('number')
            player.grade = roster_info.get('grade')
        
        if not existing_player:
            db.session.add(player)
        migrated_count += 1
    
    db.session.commit()
    print(f"  Migrated {migrated_count} players")

def migrate_games(stats_data):
    """Migrate game data"""
    print("\nMigrating games...")
    
    migrated_count = 0
    for game_data in stats_data.get('games', []):
        # Check if game already exists
        existing_game = Game.query.filter_by(game_id=game_data['gameId']).first()
        if existing_game:
            print(f"  Game {game_data['gameId']} already exists, updating...")
            game = existing_game
            # Clear existing player stats for this game
            PlayerGameStats.query.filter_by(game_id=game.id).delete()
        else:
            game = Game(game_id=game_data['gameId'])
        
        # Update game data
        game.date = game_data.get('date', '')
        game.opponent = game_data.get('opponent', '')
        game.location = game_data.get('location', 'Home')
        game.vc_score = game_data.get('vc_score', 0)
        game.opp_score = game_data.get('opp_score', 0)
        game.result = game_data.get('result', 'L')
        game.team_stats = game_data.get('team_stats', {})
        
        if not existing_game:
            db.session.add(game)
            db.session.flush()  # Get the ID
        
        # Migrate player game stats
        for player_stat in game_data.get('player_stats', []):
            player_name = player_stat.get('name', '')  # Use 'name' not 'player_name'
            player = Player.query.filter_by(name=player_name).first()
            if not player:
                print(f"  Warning: Player '{player_name}' not found for game {game.game_id}")
                continue
            
            # Map the field names from the JSON structure to database fields
            pgs = PlayerGameStats(
                game_id=game.id,
                player_id=player.id,
                pts=player_stat.get('pts', 0),
                fg=player_stat.get('fg_made', 0),  # JSON uses fg_made
                fga=player_stat.get('fg_att', 0),  # JSON uses fg_att  
                fg3=player_stat.get('fg3_made', 0),  # JSON uses fg3_made
                fg3a=player_stat.get('fg3_att', 0),  # JSON uses fg3_att
                ft=player_stat.get('ft_made', 0),  # JSON uses ft_made
                fta=player_stat.get('ft_att', 0),  # JSON uses ft_att
                oreb=player_stat.get('oreb', 0),
                dreb=player_stat.get('dreb', 0),
                reb=player_stat.get('oreb', 0) + player_stat.get('dreb', 0),  # Calculate total rebounds
                asst=player_stat.get('asst', 0),
                to=player_stat.get('to', 0),
                stl=player_stat.get('stl', 0),
                blk=player_stat.get('blk', 0),
                fouls=player_stat.get('fouls', 0)
            )
            db.session.add(pgs)
        
        migrated_count += 1
    
    db.session.commit()
    print(f"  Migrated {migrated_count} games")

def migrate_season_stats(stats_data):
    """Migrate season team stats"""
    print("\nMigrating season stats...")
    
    season_team_stats = stats_data.get('season_team_stats', {})
    if not season_team_stats:
        print("  No season team stats found")
        return
    
    # Check if season stats already exist
    existing_season = SeasonStats.query.filter_by(
        team_name="Valley Catholic",
        season="2025-2026"
    ).first()
    
    if existing_season:
        print("  Season stats already exist, updating...")
        season = existing_season
    else:
        season = SeasonStats(
            team_name="Valley Catholic",
            season="2025-2026"
        )
    
    # Update season stats
    games = stats_data.get('games', [])
    season.games = len(games)
    season.wins = len([g for g in games if g.get('result') == 'W'])
    season.losses = len([g for g in games if g.get('result') == 'L'])
    
    # Team totals
    season.pts = season_team_stats.get('pts', 0)
    season.opp_pts = sum(g.get('opp_score', 0) for g in games)
    season.fg = season_team_stats.get('fg', 0)
    season.fga = season_team_stats.get('fga', 0)
    season.fg3 = season_team_stats.get('fg3', 0)
    season.fg3a = season_team_stats.get('fg3a', 0)
    season.ft = season_team_stats.get('ft', 0)
    season.fta = season_team_stats.get('fta', 0)
    season.oreb = season_team_stats.get('oreb', 0)
    season.dreb = season_team_stats.get('dreb', 0)
    season.reb = season_team_stats.get('reb', 0)
    season.asst = season_team_stats.get('asst', 0)
    season.to = season_team_stats.get('to', 0)
    season.stl = season_team_stats.get('stl', 0)
    season.blk = season_team_stats.get('blk', 0)
    
    if not existing_season:
        db.session.add(season)
    
    db.session.commit()
    print("  Migrated season stats")

def main():
    """Main migration function"""
    print("Starting database migration...")
    
    # Check if running from correct directory
    if not os.path.exists('data/vc_stats_output.json'):
        print("Error: Run this script from the Stats directory")
        print("Current directory:", os.getcwd())
        sys.exit(1)
    
    app = create_app()
    
    with app.app_context():
        try:
            # Create all tables
            print("Creating database tables...")
            db.create_all()
            print("Tables created successfully")
            
            # Load JSON data
            stats_data, roster_data = load_json_data()
            
            # Migrate in order (players first, then games, then season stats)
            migrate_players(stats_data, roster_data)
            migrate_games(stats_data)
            migrate_season_stats(stats_data)
            
            print("\n✅ Migration completed successfully!")
            
            # Verify migration
            print("\nVerifying migration:")
            print(f"  Players: {Player.query.count()}")
            print(f"  Games: {Game.query.count()}")
            print(f"  Player Game Stats: {PlayerGameStats.query.count()}")
            print(f"  Season Stats: {SeasonStats.query.count()}")
            
        except Exception as e:
            print(f"\n❌ Migration failed: {e}")
            db.session.rollback()
            raise

if __name__ == '__main__':
    main()