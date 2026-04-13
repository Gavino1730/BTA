param(
    [string]$Api = "https://btarealtime-api-production.up.railway.app",
    [string]$ApiKey = "Q7mZ2xR9aV6pT3kLw8JfH1N5gC4sD0YvE2uB7cM9WqP3tK8Xr6LhS1dF4jA5oU",
    [string]$Email = "team@example.com",
    [string]$LoginPw = "12345678",
    [string]$SchoolId = "school-123",
    [string]$TeamJson = "$PSScriptRoot\..\team-data.json"
)

$ErrorActionPreference = "Stop"

$loginHeaders = @{ "x-api-key" = $ApiKey }
$loginBody = @{ email = $Email; password = $LoginPw } | ConvertTo-Json -Compress
$login = Invoke-RestMethod -Uri "$Api/api/auth/login" -Method POST -ContentType "application/json" -Headers $loginHeaders -Body $loginBody
$token = $login.token
Write-Host "Logged in as $($login.user.email)"

$h = @{
    "x-api-key"     = $ApiKey
    "Authorization" = "Bearer $token"
    "x-school-id"   = $SchoolId
    "Content-Type"  = "application/json"
}

$teamData = Get-Content $TeamJson -Raw | ConvertFrom-Json
$team = $teamData.teams[0]
$playerIds = @($team.players | ForEach-Object { $_.id })
$teamId = $team.id

$finalGames = @($team.schedule | Where-Object { $_.status -eq "final" })
Write-Host "Seeding $($finalGames.Count) completed games for $($team.name)..."

$zones = @("rim", "paint", "midrange", "corner_three", "above_break_three")

foreach ($game in $finalGames) {
    $gameId = "game-$($game.date)-$($game.opponent.ToLower())"
    $isHome = $game.home_away -eq "HOME"
    $homeId = if ($isHome) { $teamId } else { "team-$($game.opponent.ToLower())" }
    $awayId = if ($isHome) { "team-$($game.opponent.ToLower())" } else { $teamId }
    $oppId  = if ($isHome) { $awayId } else { $homeId }
    $ourScore = [int]$game.vwb_score
    $oppScore = [int]$game.opp_score
    $dateIso = "$($game.date)T19:00:00.000Z"

    try { Invoke-RestMethod -Uri "$Api/api/games/$gameId" -Method DELETE -Headers $h | Out-Null } catch {}

    $createBody = @{ gameId = $gameId; homeTeamId = $homeId; awayTeamId = $awayId; opponentName = $game.opponent } | ConvertTo-Json -Compress
    try {
        Invoke-RestMethod -Uri "$Api/api/games" -Method POST -Headers $h -Body $createBody | Out-Null
    } catch {
        Write-Host "  SKIP $gameId - create failed: $($_.ErrorDetails.Message)"
        continue
    }

    $seq = 1
    $remaining = $ourScore
    $clock = 480
    $period = 1
    while ($remaining -gt 0) {
        $pts = [Math]::Min(3, $remaining)
        $pIdx = ($seq - 1) % $playerIds.Count
        $zIdx = ($seq - 1) % $zones.Count
        $qPeriod = "Q$period"
        if ($clock -le 0) { $period = [Math]::Min($period + 1, 4); $clock = 480; $qPeriod = "Q$period" }

        $ev = @{
            id = "ev-$gameId-$seq"
            type = "shot_attempt"
            teamId = $teamId
            playerId = $playerIds[$pIdx]
            made = $true
            points = $pts
            sequence = $seq
            timestampIso = $dateIso
            period = $qPeriod
            clockSecondsRemaining = $clock
            operatorId = "seed"
            zone = $zones[$zIdx]
        } | ConvertTo-Json -Compress

        try {
            Invoke-RestMethod -Uri "$Api/api/games/$gameId/events" -Method POST -Headers $h -Body $ev | Out-Null
        } catch {
            Write-Host "  Event error seq $seq : $($_.ErrorDetails.Message)"
        }
        $remaining -= $pts
        $seq++
        $clock -= 10
    }

    $remaining = $oppScore
    while ($remaining -gt 0) {
        $pts = [Math]::Min(3, $remaining)
        $zIdx = ($seq - 1) % $zones.Count
        $qPeriod = "Q$period"
        if ($clock -le 0) { $period = [Math]::Min($period + 1, 4); $clock = 480; $qPeriod = "Q$period" }

        $ev = @{
            id = "ev-$gameId-$seq"
            type = "shot_attempt"
            teamId = $oppId
            playerId = "opp-$($game.opponent.ToLower())-$($seq % 5)"
            made = $true
            points = $pts
            sequence = $seq
            timestampIso = $dateIso
            period = $qPeriod
            clockSecondsRemaining = $clock
            operatorId = "seed"
            zone = $zones[$zIdx]
        } | ConvertTo-Json -Compress

        try {
            Invoke-RestMethod -Uri "$Api/api/games/$gameId/events" -Method POST -Headers $h -Body $ev | Out-Null
        } catch {
            Write-Host "  Event error seq $seq : $($_.ErrorDetails.Message)"
        }
        $remaining -= $pts
        $seq++
        $clock -= 10
    }

    try {
        Invoke-RestMethod -Uri "$Api/api/games/$gameId/submit" -Method POST -Headers $h | Out-Null
        Write-Host "  OK: $($game.date) vs $($game.opponent) $ourScore-$oppScore ($($game.result))"
    } catch {
        Write-Host "  Submit FAIL: $($_.ErrorDetails.Message)"
    }
}

$games = Invoke-RestMethod -Uri "$Api/api/games" -Method GET -Headers $h
Write-Host "`nSeeded $($games.Count) games total."
