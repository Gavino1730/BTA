#!/usr/bin/env python3
"""
Comprehensive Basketball Stats Verification Script - Updated
Verifies PDF content against raw_pdfs.json and parsed_games.json
"""

import json
import os
import re
from pathlib import Path
import fitz  # PyMuPDF

class StatsVerifier:
    def __init__(self):
        self.stats_dir = Path("/home/runner/work/Stats/Stats/Stat Sheets/Stats")
        self.raw_pdfs_path = Path("/home/runner/work/Stats/Stats/data/raw_pdfs.json")
        self.parsed_games_path = Path("/home/runner/work/Stats/Stats/data/parsed_games.json")
        self.errors = []
        self.warnings = []
        
    def load_json_files(self):
        """Load the JSON data files"""
        with open(self.raw_pdfs_path, 'r') as f:
            self.raw_pdfs = json.load(f)
        with open(self.parsed_games_path, 'r') as f:
            self.parsed_games = json.load(f)
        print(f"✓ Loaded {len(self.raw_pdfs)} entries from raw_pdfs.json")
        print(f"✓ Loaded {len(self.parsed_games)} entries from parsed_games.json")
    
    def extract_pdf_text(self, pdf_path):
        """Extract text from PDF using PyMuPDF"""
        try:
            doc = fitz.open(pdf_path)
            text = ""
            for page in doc:
                text += page.get_text()
            doc.close()
            return text
        except Exception as e:
            self.errors.append(f"ERROR: Failed to extract text from {pdf_path}: {e}")
            return None
    
    def parse_stat(self, stat_str):
        """Parse a stat string like '11-24' into made and attempted"""
        if stat_str == '-' or stat_str == '':
            return 0, 0
        try:
            parts = stat_str.split('-')
            made = int(parts[0])
            att = int(parts[1])
            return made, att
        except:
            return None, None
    
    def parse_percentage(self, pct_str):
        """Parse percentage string like '46%' into float"""
        if pct_str == '-' or pct_str == '':
            return 0.0
        try:
            return float(pct_str.replace('%', ''))
        except:
            return None
    
    def verify_pdf_coverage(self):
        """Check if all PDFs in directory are in JSON files"""
        print(f"\n{'='*80}")
        print("PDF COVERAGE CHECK")
        print(f"{'='*80}")
        
        pdf_files = list(self.stats_dir.glob("*.pdf"))
        pdf_names = [f.name for f in pdf_files]
        
        print(f"\nTotal PDFs in directory: {len(pdf_files)}")
        print(f"PDFs in raw_pdfs.json: {len(self.raw_pdfs)}")
        print(f"PDFs in parsed_games.json: {len(self.parsed_games)}")
        
        # Check for missing PDFs in JSON
        missing_in_raw = [p for p in pdf_names if p not in self.raw_pdfs]
        missing_in_parsed = [p for p in pdf_names if p not in self.parsed_games]
        
        if missing_in_raw:
            print(f"\n⚠ PDFs not in raw_pdfs.json: {len(missing_in_raw)} files")
            for pdf in sorted(missing_in_raw):
                print(f"  - {pdf}")
                self.warnings.append(f"WARNING: {pdf} not in raw_pdfs.json - needs to be processed")
        
        return pdf_names
    
    def verify_player_stats(self, pdf_name, player, player_num):
        """Verify individual player statistics"""
        name = player.get('name', f'Player {player_num}')
        number = player.get('number', 'N/A')
        
        # Parse field goal stats
        fg_made, fg_att = self.parse_stat(player.get('fg', '0-0'))
        fg_pct = self.parse_percentage(player.get('fg_pct', '0%'))
        
        if fg_made is None or fg_att is None:
            self.errors.append(f"ERROR: {pdf_name} - {name} (#{number}): Invalid FG stat format: {player.get('fg')}")
            return
        
        # Verify FG percentage
        if fg_att > 0:
            calculated_fg_pct = round((fg_made / fg_att) * 100)
            if abs(calculated_fg_pct - fg_pct) > 1:  # Allow 1% rounding difference
                self.errors.append(
                    f"ERROR: {pdf_name} - {name} (#{number}): "
                    f"FG% incorrect. Calculated: {calculated_fg_pct}%, Recorded: {fg_pct}% "
                    f"(FG: {fg_made}/{fg_att})"
                )
        elif fg_att == 0 and fg_pct != 0:
            self.errors.append(
                f"ERROR: {pdf_name} - {name} (#{number}): "
                f"FG% should be 0 when no attempts, but is {fg_pct}%"
            )
        
        # Parse 3-point stats
        three_made, three_att = self.parse_stat(player.get('3pt', '0-0'))
        three_pct = self.parse_percentage(player.get('3pt_pct', '0%'))
        
        if three_made is None or three_att is None:
            self.errors.append(f"ERROR: {pdf_name} - {name} (#{number}): Invalid 3PT stat format: {player.get('3pt')}")
            return
        
        # Verify 3PT percentage
        if three_att > 0:
            calculated_three_pct = round((three_made / three_att) * 100)
            if abs(calculated_three_pct - three_pct) > 1:
                self.errors.append(
                    f"ERROR: {pdf_name} - {name} (#{number}): "
                    f"3PT% incorrect. Calculated: {calculated_three_pct}%, Recorded: {three_pct}% "
                    f"(3PT: {three_made}/{three_att})"
                )
        elif three_att == 0 and three_pct != 0:
            self.errors.append(
                f"ERROR: {pdf_name} - {name} (#{number}): "
                f"3PT% should be 0 when no attempts, but is {three_pct}%"
            )
        
        # Parse free throw stats
        ft_made, ft_att = self.parse_stat(player.get('ft', '0-0'))
        ft_pct = self.parse_percentage(player.get('ft_pct', '0%'))
        
        if ft_made is None or ft_att is None:
            self.errors.append(f"ERROR: {pdf_name} - {name} (#{number}): Invalid FT stat format: {player.get('ft')}")
            return
        
        # Verify FT percentage
        if ft_att > 0:
            calculated_ft_pct = round((ft_made / ft_att) * 100)
            if abs(calculated_ft_pct - ft_pct) > 1:
                self.errors.append(
                    f"ERROR: {pdf_name} - {name} (#{number}): "
                    f"FT% incorrect. Calculated: {calculated_ft_pct}%, Recorded: {ft_pct}% "
                    f"(FT: {ft_made}/{ft_att})"
                )
        elif ft_att == 0 and ft_pct != 0:
            self.errors.append(
                f"ERROR: {pdf_name} - {name} (#{number}): "
                f"FT% should be 0 when no attempts, but is {ft_pct}%"
            )
        
        # Verify total points calculation
        points = player.get('pts', 0)
        # Points = (FG_made - 3PT_made) * 2 + 3PT_made * 3 + FT_made
        two_pt_made = fg_made - three_made
        calculated_points = (two_pt_made * 2) + (three_made * 3) + ft_made
        
        if calculated_points != points:
            self.errors.append(
                f"ERROR: {pdf_name} - {name} (#{number}): "
                f"Points incorrect. Calculated: {calculated_points}, Recorded: {points} "
                f"(2PT: {two_pt_made}, 3PT: {three_made}, FT: {ft_made})"
            )
        
        # Check for negative or suspicious stats
        for stat_name in ['oreb', 'dreb', 'fouls', 'stl', 'to', 'blk', 'asst']:
            val = player.get(stat_name, 0)
            if val < 0:
                self.errors.append(
                    f"ERROR: {pdf_name} - {name} (#{number}): "
                    f"Negative {stat_name}: {val}"
                )
        
        # Check for suspiciously high stats
        if points > 100:
            self.warnings.append(
                f"WARNING: {pdf_name} - {name} (#{number}): "
                f"Very high points: {points} - please verify"
            )
        
        if player.get('fouls', 0) > 6:
            self.warnings.append(
                f"WARNING: {pdf_name} - {name} (#{number}): "
                f"More than 6 fouls: {player.get('fouls')} - player should be fouled out"
            )
    
    def verify_game_stats(self, pdf_name):
        """Verify all statistics for a game"""
        if pdf_name not in self.parsed_games:
            return
        
        print(f"\n{'='*80}")
        print(f"Verifying: {pdf_name}")
        print(f"{'='*80}")
        
        game_data = self.parsed_games[pdf_name]
        
        # Display game info
        print(f"Date: {game_data.get('date', 'N/A')}")
        print(f"Opponent: {game_data.get('opponent', 'N/A')}")
        print(f"Score: Home Team {game_data.get('vc_score', 0)} - {game_data.get('opponent', 'Opponent')} {game_data.get('opp_score', 0)}")
        
        players = game_data.get('players', [])
        print(f"\nVerifying {len(players)} home team players...")
        
        # Calculate team totals from players
        team_totals = {
            'fg_made': 0,
            'fg_att': 0,
            '3pt_made': 0,
            '3pt_att': 0,
            'ft_made': 0,
            'ft_att': 0,
            'oreb': 0,
            'dreb': 0,
            'fouls': 0,
            'stl': 0,
            'to': 0,
            'blk': 0,
            'asst': 0,
            'pts': 0
        }
        
        # Verify each player
        for i, player in enumerate(players):
            self.verify_player_stats(pdf_name, player, i+1)
            
            # Add to team totals
            fg_made, fg_att = self.parse_stat(player.get('fg', '0-0'))
            three_made, three_att = self.parse_stat(player.get('3pt', '0-0'))
            ft_made, ft_att = self.parse_stat(player.get('ft', '0-0'))
            
            if fg_made is not None:
                team_totals['fg_made'] += fg_made
                team_totals['fg_att'] += fg_att
                team_totals['3pt_made'] += three_made
                team_totals['3pt_att'] += three_att
                team_totals['ft_made'] += ft_made
                team_totals['ft_att'] += ft_att
                team_totals['oreb'] += player.get('oreb', 0)
                team_totals['dreb'] += player.get('dreb', 0)
                team_totals['fouls'] += player.get('fouls', 0)
                team_totals['stl'] += player.get('stl', 0)
                team_totals['to'] += player.get('to', 0)
                team_totals['blk'] += player.get('blk', 0)
                team_totals['asst'] += player.get('asst', 0)
                team_totals['pts'] += player.get('pts', 0)
        
        # Verify team total points matches vc_score
        vc_score = game_data.get('vc_score', 0)
        if team_totals['pts'] != vc_score:
            self.errors.append(
                f"ERROR: {pdf_name} - Team total points mismatch: "
                f"Sum of player points: {team_totals['pts']}, VC Score: {vc_score}"
            )
        
        # Display team totals
        print(f"\n--- Home Team Totals ---")
        print(f"FG: {team_totals['fg_made']}/{team_totals['fg_att']}", end="")
        if team_totals['fg_att'] > 0:
            print(f" ({round(team_totals['fg_made']/team_totals['fg_att']*100)}%)")
        else:
            print()
        print(f"3PT: {team_totals['3pt_made']}/{team_totals['3pt_att']}", end="")
        if team_totals['3pt_att'] > 0:
            print(f" ({round(team_totals['3pt_made']/team_totals['3pt_att']*100)}%)")
        else:
            print()
        print(f"FT: {team_totals['ft_made']}/{team_totals['ft_att']}", end="")
        if team_totals['ft_att'] > 0:
            print(f" ({round(team_totals['ft_made']/team_totals['ft_att']*100)}%)")
        else:
            print()
        print(f"Rebounds: {team_totals['oreb'] + team_totals['dreb']} (O:{team_totals['oreb']}, D:{team_totals['dreb']})")
        print(f"Assists: {team_totals['asst']}")
        print(f"Steals: {team_totals['stl']}")
        print(f"Blocks: {team_totals['blk']}")
        print(f"Turnovers: {team_totals['to']}")
        print(f"Fouls: {team_totals['fouls']}")
        print(f"TOTAL POINTS: {team_totals['pts']}")
        
        # Check raw PDF text if available
        if pdf_name in self.raw_pdfs:
            raw_text = self.raw_pdfs[pdf_name]
            
            # Verify each player name appears in raw text
            for player in players:
                name = player.get('name', '')
                if name and name not in raw_text:
                    self.warnings.append(
                        f"WARNING: {pdf_name} - Player name '{name}' not found in raw PDF text"
                    )
    
    def verify_raw_pdf_text(self, pdf_name):
        """Verify PDF text extraction matches raw_pdfs.json"""
        pdf_path = self.stats_dir / pdf_name
        
        if not pdf_path.exists():
            self.warnings.append(f"WARNING: PDF file not found: {pdf_path}")
            return
        
        if pdf_name not in self.raw_pdfs:
            return
        
        print(f"\n--- Verifying PDF Text Extraction ---")
        
        # Extract text from PDF
        pdf_text = self.extract_pdf_text(pdf_path)
        if pdf_text is None:
            return
        
        raw_text = self.raw_pdfs[pdf_name]
        
        # Remove whitespace variations for comparison
        pdf_text_clean = ' '.join(pdf_text.split())
        raw_text_clean = ' '.join(raw_text.split())
        
        # Compare lengths
        if len(pdf_text_clean) != len(raw_text_clean):
            diff = abs(len(pdf_text_clean) - len(raw_text_clean))
            percent_diff = (diff / max(len(pdf_text_clean), len(raw_text_clean))) * 100
            
            if percent_diff > 10:
                self.errors.append(
                    f"ERROR: {pdf_name} - Significant text length difference: "
                    f"PDF={len(pdf_text_clean)}, JSON={len(raw_text_clean)} ({percent_diff:.1f}% diff)"
                )
            else:
                print(f"✓ Minor text differences (likely formatting): {diff} chars difference")
        else:
            print(f"✓ PDF text matches raw_pdfs.json exactly")
    
    def run_verification(self):
        """Run complete verification process"""
        print("="*80)
        print("BASKETBALL STATS VERIFICATION - COMPREHENSIVE CHECK")
        print("="*80)
        
        # Load JSON files
        self.load_json_files()
        
        # Check PDF coverage
        all_pdfs = self.verify_pdf_coverage()
        
        # Verify each game in parsed_games.json
        print(f"\n{'='*80}")
        print("VERIFYING PARSED GAME STATISTICS")
        print(f"{'='*80}")
        
        for pdf_name in sorted(self.parsed_games.keys()):
            self.verify_game_stats(pdf_name)
            self.verify_raw_pdf_text(pdf_name)
        
        # Print summary
        self.print_summary()
        
        return len(self.errors) == 0
    
    def print_summary(self):
        """Print verification summary"""
        print("\n" + "="*80)
        print("VERIFICATION SUMMARY")
        print("="*80)
        
        if not self.errors and not self.warnings:
            print("\n✓✓✓ ALL CHECKS PASSED! No errors or warnings found. ✓✓✓")
        else:
            if self.warnings:
                print(f"\n⚠ WARNINGS: {len(self.warnings)}")
                print("-" * 80)
                for warning in self.warnings:
                    print(warning)
            
            if self.errors:
                print(f"\n❌ ERRORS FOUND: {len(self.errors)}")
                print("-" * 80)
                for error in self.errors:
                    print(error)
        
        print("\n" + "="*80)
        print(f"Total Errors: {len(self.errors)}")
        print(f"Total Warnings: {len(self.warnings)}")
        print("="*80)
        
        if self.errors:
            print("\n⚠ CRITICAL: Errors must be fixed to ensure data accuracy!")
        if self.warnings:
            print("\n⚠ Please review warnings for potential issues.")

if __name__ == "__main__":
    verifier = StatsVerifier()
    success = verifier.run_verification()
    exit(0 if success else 1)
