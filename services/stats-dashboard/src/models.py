from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSON

db = SQLAlchemy()


class Game(db.Model):
    __tablename__ = "games"

    id = db.Column(db.Integer, primary_key=True)
    game_id = db.Column(db.Integer, unique=True, nullable=False, index=True)
    date = db.Column(db.String(20), nullable=False)
    opponent = db.Column(db.String(100), nullable=False)
    location = db.Column(db.String(10), nullable=False)  # 'Home' or 'Away'
    vc_score = db.Column(db.Integer, nullable=False)
    opp_score = db.Column(db.Integer, nullable=False)
    result = db.Column(db.String(10), nullable=False)  # 'W' or 'L'

    # Team stats as JSON
    team_stats = db.Column(JSON)

    # Relationships
    player_game_stats = db.relationship(
        "PlayerGameStats", backref="game", lazy=True, cascade="all, delete-orphan"
    )

    def to_dict(self):
        return {
            "gameId": self.game_id,
            "date": self.date,
            "opponent": self.opponent,
            "location": self.location,
            "vc_score": self.vc_score,
            "opp_score": self.opp_score,
            "result": self.result,
            "team_stats": self.team_stats,
            "player_stats": [pgs.to_dict() for pgs in self.player_game_stats],
        }


class Player(db.Model):
    __tablename__ = "players"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False, index=True)
    number = db.Column(db.Integer)
    grade = db.Column(db.String(20))

    # Season totals
    games = db.Column(db.Integer, default=0)
    pts = db.Column(db.Integer, default=0)
    fg = db.Column(db.Integer, default=0)
    fga = db.Column(db.Integer, default=0)
    fg3 = db.Column(db.Integer, default=0)
    fg3a = db.Column(db.Integer, default=0)
    ft = db.Column(db.Integer, default=0)
    fta = db.Column(db.Integer, default=0)
    oreb = db.Column(db.Integer, default=0)
    dreb = db.Column(db.Integer, default=0)
    reb = db.Column(db.Integer, default=0)
    asst = db.Column(db.Integer, default=0)
    to = db.Column(db.Integer, default=0)
    stl = db.Column(db.Integer, default=0)
    blk = db.Column(db.Integer, default=0)
    fouls = db.Column(db.Integer, default=0)

    # Season averages (calculated fields)
    ppg = db.Column(db.Float, default=0.0)
    rpg = db.Column(db.Float, default=0.0)
    apg = db.Column(db.Float, default=0.0)
    fg_pct = db.Column(db.Float, default=0.0)
    fg3_pct = db.Column(db.Float, default=0.0)
    ft_pct = db.Column(db.Float, default=0.0)

    # Relationships
    player_game_stats = db.relationship("PlayerGameStats", backref="player", lazy=True)

    def to_dict(self):
        return {
            "name": self.name,
            "number": self.number,
            "grade": self.grade,
            "games": self.games,
            "pts": self.pts,
            "fg": self.fg,
            "fga": self.fga,
            "fg3": self.fg3,
            "fg3a": self.fg3a,
            "ft": self.ft,
            "fta": self.fta,
            "oreb": self.oreb,
            "dreb": self.dreb,
            "reb": self.reb,
            "asst": self.asst,
            "to": self.to,
            "stl": self.stl,
            "blk": self.blk,
            "fouls": self.fouls,
            "ppg": self.ppg,
            "rpg": self.rpg,
            "apg": self.apg,
            "fg_pct": self.fg_pct,
            "fg3_pct": self.fg3_pct,
            "ft_pct": self.ft_pct,
        }

    def update_averages(self):
        """Calculate and update season averages"""
        if self.games > 0:
            self.ppg = round(self.pts / self.games, 1)
            self.rpg = round(self.reb / self.games, 1)
            self.apg = round(self.asst / self.games, 1)
            self.fg_pct = round(self.fg / self.fga * 100, 1) if self.fga > 0 else 0.0
            self.fg3_pct = (
                round(self.fg3 / self.fg3a * 100, 1) if self.fg3a > 0 else 0.0
            )
            self.ft_pct = round(self.ft / self.fta * 100, 1) if self.fta > 0 else 0.0


class PlayerGameStats(db.Model):
    __tablename__ = "player_game_stats"

    id = db.Column(db.Integer, primary_key=True)
    game_id = db.Column(db.Integer, db.ForeignKey("games.id"), nullable=False)
    player_id = db.Column(db.Integer, db.ForeignKey("players.id"), nullable=False)

    # Game stats
    pts = db.Column(db.Integer, default=0)
    fg = db.Column(db.Integer, default=0)
    fga = db.Column(db.Integer, default=0)
    fg3 = db.Column(db.Integer, default=0)
    fg3a = db.Column(db.Integer, default=0)
    ft = db.Column(db.Integer, default=0)
    fta = db.Column(db.Integer, default=0)
    oreb = db.Column(db.Integer, default=0)
    dreb = db.Column(db.Integer, default=0)
    reb = db.Column(db.Integer, default=0)
    asst = db.Column(db.Integer, default=0)
    to = db.Column(db.Integer, default=0)
    stl = db.Column(db.Integer, default=0)
    blk = db.Column(db.Integer, default=0)
    fouls = db.Column(db.Integer, default=0)

    # Unique constraint to prevent duplicate player stats per game
    __table_args__ = (
        db.UniqueConstraint("game_id", "player_id", name="unique_player_game"),
    )

    def to_dict(self):
        return {
            "player_name": self.player.name,
            "pts": self.pts,
            "fg": self.fg,
            "fga": self.fga,
            "fg3": self.fg3,
            "fg3a": self.fg3a,
            "ft": self.ft,
            "fta": self.fta,
            "oreb": self.oreb,
            "dreb": self.dreb,
            "reb": self.reb,
            "asst": self.asst,
            "to": self.to,
            "stl": self.stl,
            "blk": self.blk,
            "fouls": self.fouls,
        }


class SeasonStats(db.Model):
    __tablename__ = "season_stats"

    id = db.Column(db.Integer, primary_key=True)
    team_name = db.Column(db.String(100), nullable=False)
    season = db.Column(db.String(20), nullable=False)

    # Team totals
    games = db.Column(db.Integer, default=0)
    wins = db.Column(db.Integer, default=0)
    losses = db.Column(db.Integer, default=0)
    pts = db.Column(db.Integer, default=0)
    opp_pts = db.Column(db.Integer, default=0)
    fg = db.Column(db.Integer, default=0)
    fga = db.Column(db.Integer, default=0)
    fg3 = db.Column(db.Integer, default=0)
    fg3a = db.Column(db.Integer, default=0)
    ft = db.Column(db.Integer, default=0)
    fta = db.Column(db.Integer, default=0)
    oreb = db.Column(db.Integer, default=0)
    dreb = db.Column(db.Integer, default=0)
    reb = db.Column(db.Integer, default=0)
    asst = db.Column(db.Integer, default=0)
    to = db.Column(db.Integer, default=0)
    stl = db.Column(db.Integer, default=0)
    blk = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            "team": self.team_name,
            "season": self.season,
            "games": self.games,
            "wins": self.wins,
            "losses": self.losses,
            "record": f"{self.wins}-{self.losses}",
            "pts": self.pts,
            "opp_pts": self.opp_pts,
            "ppg": round(self.pts / self.games, 1) if self.games > 0 else 0,
            "opp_ppg": round(self.opp_pts / self.games, 1) if self.games > 0 else 0,
            "fg": self.fg,
            "fga": self.fga,
            "fg_pct": round(self.fg / self.fga * 100, 1) if self.fga > 0 else 0,
            "fg3": self.fg3,
            "fg3a": self.fg3a,
            "fg3_pct": round(self.fg3 / self.fg3a * 100, 1) if self.fg3a > 0 else 0,
            "ft": self.ft,
            "fta": self.fta,
            "ft_pct": round(self.ft / self.fta * 100, 1) if self.fta > 0 else 0,
            "reb": self.reb,
            "rpg": round(self.reb / self.games, 1) if self.games > 0 else 0,
            "asst": self.asst,
            "apg": round(self.asst / self.games, 1) if self.games > 0 else 0,
            "to": self.to,
            "stl": self.stl,
            "blk": self.blk,
        }
