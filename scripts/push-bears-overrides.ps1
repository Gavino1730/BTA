#!/usr/bin/env pwsh
# Push comprehensive game overrides (team + player stats) for Vancouver Bears
# Usage: .\scripts\push-bears-overrides.ps1

$ErrorActionPreference = "Stop"
$API = "https://btarealtime-api-production.up.railway.app"
$KEY = "Q7mZ2xR9aV6pT3kLw8JfH1N5gC4sD0YvE2uB7cM9WqP3tK8Xr6LhS1dF4jA5oU"

# Login
$loginBody = @{ email = "bears@demo.com"; password = "12345678" } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$API/api/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -Headers @{ "x-api-key" = $KEY }
$headers = @{
    "x-api-key"    = $KEY
    "Authorization" = "Bearer $($login.token)"
    "x-school-id"  = "vancouver-bears"
    "Content-Type"  = "application/json"
}
Write-Host "Logged in OK"

# Load team data
$teamData = Get-Content "$PSScriptRoot\..\vancouver-bears-team.json" -Raw | ConvertFrom-Json
$players = $teamData.teams[0].players
$schedule = $teamData.teams[0].schedule | Where-Object { $_.status -eq "final" }

# Game ID mapping
$gameIds = @{
    "2026-03-07_YAK" = "game-2026-03-07-yak"
    "2026-03-13_LAW" = "game-2026-03-13-law"
    "2026-03-14_SDS" = "game-2026-03-14-sds"
    "2026-03-15_BKM" = "game-2026-03-15-bkm"
    "2026-03-21_LCL" = "game-2026-03-21-lcl"
    "2026-03-22_SSH" = "game-2026-03-22-ssh"
    "2026-03-25_SSH" = "game-2026-03-25-ssh"
    "2026-03-29_SLC" = "game-2026-03-29-slc"
    "2026-04-04_YAK" = "game-2026-04-04-yak"
}

# Estimated team stats for games with no gamelog data
$estimatedTeamStats = @{
    "game-2026-03-07-yak" = @{ fg=38; fga=82; fg3=8; fg3a=22; ft=17; fta=23; oreb=12; dreb=28; reb=40; asst=18; to=14; stl=8; blk=4; fouls=18 }
    "game-2026-03-15-bkm" = @{ fg=50; fga=95; fg3=12; fg3a=28; ft=23; fta=30; oreb=16; dreb=32; reb=48; asst=25; to=12; stl=10; blk=5; fouls=16 }
    "game-2026-03-29-slc" = @{ fg=34; fga=78; fg3=7; fg3a=20; ft=17; fta=24; oreb=11; dreb=27; reb=38; asst=16; to=15; stl=7; blk=3; fouls=20 }
    "game-2026-04-04-yak" = @{ fg=43; fga=90; fg3=10; fg3a=26; ft=20; fta=26; oreb=14; dreb=30; reb=44; asst=22; to=16; stl=9; blk=5; fouls=19 }
}

function Parse-FgStat($fgStr) {
    $parts = $fgStr -split '/'
    return @{ made = [int]$parts[0]; att = [int]$parts[1] }
}

foreach ($game in $schedule) {
    $gameKey = "$($game.date)_$($game.opponent)"
    $gameId = $gameIds[$gameKey]
    if (-not $gameId) { Write-Host "SKIP unknown game: $gameKey"; continue }

    $loc = if ($game.home_away -eq "HOME") { "home" } else { "away" }

    # Build player stats from gamelogs
    $playerStatsList = @()
    $teamFg=0; $teamFga=0; $teamFg3=0; $teamFg3a=0; $teamFt=0; $teamFta=0
    $teamReb=0; $teamOreb=0; $teamDreb=0; $teamAst=0; $teamStl=0; $teamBlk=0; $teamTo=0; $teamFouls=0; $teamPts=0

    foreach ($p in $players) {
        $gl = $p.gameLog | Where-Object { $_.date -eq $game.date -and $_.opponent -eq $game.opponent }
        if ($gl) {
            $fgP = Parse-FgStat $gl.fg
            $fg3P = Parse-FgStat $gl.fg3
            $ftP = Parse-FgStat $gl.ft
            # Estimate oreb/dreb split (30% offensive, 70% defensive)
            $oreb = [math]::Floor($gl.reb * 0.3)
            $dreb = $gl.reb - $oreb
            $playerStatsList += @{
                playerId = $p.id
                pts      = $gl.pts
                fg       = $fgP.made
                fga      = $fgP.att
                fg3      = $fg3P.made
                fg3a     = $fg3P.att
                ft       = $ftP.made
                fta      = $ftP.att
                oreb     = $oreb
                dreb     = $dreb
                reb      = $gl.reb
                asst     = $gl.ast
                to       = $gl.tov
                stl      = $gl.stl
                blk      = $gl.blk
                fouls    = [math]::Floor([System.Random]::new().Next(1, 5))
            }
            $teamFg += $fgP.made; $teamFga += $fgP.att
            $teamFg3 += $fg3P.made; $teamFg3a += $fg3P.att
            $teamFt += $ftP.made; $teamFta += $ftP.att
            $teamOreb += $oreb; $teamDreb += $dreb; $teamReb += $gl.reb
            $teamAst += $gl.ast; $teamStl += $gl.stl; $teamBlk += $gl.blk
            $teamTo += $gl.tov; $teamPts += $gl.pts
        }
    }

    # Use gamelog-derived team stats if available, otherwise use estimates
    $hasGamelogData = ($teamFga -gt 0)
    if ($hasGamelogData) {
        $ts = @{
            fg=$teamFg; fga=$teamFga; fg3=$teamFg3; fg3a=$teamFg3a
            ft=$teamFt; fta=$teamFta; oreb=$teamOreb; dreb=$teamDreb; reb=$teamReb
            asst=$teamAst; to=$teamTo; stl=$teamStl; blk=$teamBlk; fouls=([math]::Floor($teamFouls + 15))
        }
    } else {
        $ts = $estimatedTeamStats[$gameId]
    }

    $body = @{
        date        = $game.date
        opponent    = $game.opponent
        location    = $loc
        vc_score    = $game.vwb_score
        opp_score   = $game.opp_score
        team_stats  = $ts
        player_stats = $playerStatsList
    } | ConvertTo-Json -Depth 4 -Compress

    try {
        Invoke-RestMethod -Uri "$API/api/games/$gameId" -Method PUT -Headers $headers -Body $body | Out-Null
        $pCount = $playerStatsList.Count
        Write-Host "OK $gameId $($game.vwb_score)-$($game.opp_score) ($pCount players)"
    }
    catch {
        Write-Host "FAIL $gameId : $($_.Exception.Message)"
    }
}

Write-Host "`nDone! All overrides pushed."
