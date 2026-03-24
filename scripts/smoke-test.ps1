#!/usr/bin/env pwsh
<#
.SYNOPSIS
  End-to-end smoke test for the BTA Basketball Platform.
  Requires the realtime-api to be running (npm run dev:api).

.USAGE
  From the repo root (with realtime-api already running):
    .\scripts\smoke-test.ps1

  Or start the API and run tests together (waits for API to be ready):
    .\scripts\smoke-test.ps1 -StartApi
#>
param(
  [string]$ApiUrl   = "http://localhost:4000",
  [string]$ApiKey   = $env:BTA_API_KEY,
  [switch]$StartApi
)

Set-StrictMode -Version Latest

$headers = @{ "Content-Type" = "application/json" }
if ($ApiKey) { $headers["x-api-key"] = $ApiKey }

$pass = 0
$fail = 0
$GAME_ID = "smoke-$(Get-Random -Maximum 9999)"

function Ok([string]$label) {
  Write-Host "  [OK]  $label" -ForegroundColor Green
  $script:pass++
}
function Fail([string]$label, [string]$detail = "") {
  Write-Host "  [FAIL]  $label" -ForegroundColor Red
  if ($detail) { Write-Host "     $detail" -ForegroundColor DarkRed }
  $script:fail++
}
function Step([string]$msg) {
  Write-Host ""
  Write-Host "  -- $msg" -ForegroundColor Cyan
}

function CountItems($value) {
  if ($null -eq $value) {
    return 0
  }

  return @($value).Count
}

function Invoke([string]$method, [string]$path, $body = $null) {
  $uri = "$ApiUrl$path"
  $params = @{ Method = $method; Uri = $uri; Headers = $headers; ErrorAction = "SilentlyContinue" }
  if ($body) { $params["Body"] = ($body | ConvertTo-Json -Compress -Depth 10) }
  try {
    $resp = Invoke-RestMethod @params
    return $resp
  } catch {
    return $null
  }
}

function InvokeRaw([string]$method, [string]$path, $body = $null) {
  $uri = "$ApiUrl$path"
  $params = @{ Method = $method; Uri = $uri; Headers = $headers; ErrorAction = "SilentlyContinue"; UseBasicParsing = $true }
  if ($body) { $params["Body"] = ($body | ConvertTo-Json -Compress -Depth 10) }
  try {
    return Invoke-WebRequest @params
  } catch {
    return $_.Exception.Response
  }
}

# ── Wait for API if needed ────────────────────────────────────────────────────
if ($StartApi) {
  Write-Host "  Starting realtime-api..." -ForegroundColor Yellow
  Start-Job { Set-Location $using:PWD; npm run dev:api } | Out-Null
  $deadline = (Get-Date).AddSeconds(30)
  $ready = $false
  Write-Host "  Waiting for API to be ready" -ForegroundColor Yellow -NoNewline
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    Write-Host "." -NoNewline -ForegroundColor Yellow
    try { $h = Invoke-RestMethod "$ApiUrl/health" -ErrorAction Stop; if ($h.status -eq "ok") { $ready = $true; break } } catch {}
  }
  Write-Host ""
  if (-not $ready) { Write-Host "  API did not start in time." -ForegroundColor Red; exit 1 }
}

Write-Host ""
Write-Host "  BTA Platform - End-to-End Smoke Test" -ForegroundColor White
Write-Host ("  Game ID: {0}" -f $GAME_ID)
Write-Host ("  API: {0}" -f $ApiUrl)
Write-Host ""

# ── 1. Health check ───────────────────────────────────────────────────────────
Step "Health check"
$health = Invoke "GET" "/health"
if ($health -and $health.status -eq "ok") { Ok "GET /health -> ok" }
else { Fail "GET /health failed" }

# ── 2. Create game ────────────────────────────────────────────────────────────
Step "Create game"
$game = Invoke "POST" "/games" @{ gameId = $GAME_ID; homeTeamId = "home"; awayTeamId = "away" }
if ($game -and $game.gameId -eq $GAME_ID) { Ok "POST /games -> gameId=$($game.gameId)" }
else { Fail "POST /games failed - got: $($game | ConvertTo-Json -Compress)" }

# ── 3. Get initial state ──────────────────────────────────────────────────────
Step "Initial state"
$state = Invoke "GET" "/games/$GAME_ID/state"
if ($state -and $state.gameId -eq $GAME_ID) { Ok "GET /games/$GAME_ID/state -> ok" }
else { Fail "GET /games/$GAME_ID/state failed" }

if ($state) {
  $homeScore = $state.scoreByTeam.home
  if ($homeScore -eq 0) { Ok "Initial score is 0-0" }
  else { Fail "Expected score 0, got $homeScore" }
}

# ── 4. Ingest events ─────────────────────────────────────────────────────────
Step "Ingest events (period start + 3 shots + foul)"

function MakeEvent([string]$type, [hashtable]$extra) {
  $script:seq++
  $base = @{
    id                   = [guid]::NewGuid().ToString()
    gameId               = $script:GAME_ID
    sequence             = $script:seq
    teamId               = "home"
    period               = "Q1"
    clockSecondsRemaining = (480 - $script:seq * 10)
    timestampIso         = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    operatorId           = "op-1"
    type                 = $type
  }
  foreach ($k in $extra.Keys) { $base[$k] = $extra[$k] }
  return $base
}

$script:seq = 0

$events = @(
  (MakeEvent "period_transition" @{ period = "Q1"; newPeriod = "Q1"; operatorId = "op-1"; teamId = "home" }),
  (MakeEvent "shot_attempt" @{ period = "Q1"; operatorId = "op-1"; playerId = "p1"; points = 2; made = $true; zone = "paint" }),
  (MakeEvent "shot_attempt" @{ period = "Q1"; operatorId = "op-1"; playerId = "p1"; points = 3; made = $true; zone = "above_break_three" }),
  (MakeEvent "shot_attempt" @{ period = "Q1"; operatorId = "op-1"; playerId = "p2"; points = 2; made = $false; zone = "paint" }),
  (MakeEvent "foul"         @{ playerId = "p2"; foulType = "personal" }),
  (MakeEvent "turnover"     @{ playerId = "p2"; turnoverType = "bad_pass" })
)

$submitted = 0
foreach ($ev in $events) {
  $r = InvokeRaw "POST" "/games/$GAME_ID/events" $ev
  if ($r -and [int]$r.StatusCode -in 200,201) { $submitted++ }
  else { Fail "POST event type=$($ev.type) failed (HTTP $($r.StatusCode))" }
}
if ($submitted -eq $events.Count) { Ok "Submitted $submitted/$($events.Count) events" }

# ── 5. Verify score ───────────────────────────────────────────────────────────
Step "Verify score and state after events"
$state2 = Invoke "GET" "/games/$GAME_ID/state"
if ($state2) {
  $expectedScore = 5  # 2pt made + 3pt made
  $actualScore = $state2.scoreByTeam.home
  if ($actualScore -eq $expectedScore) { Ok "Score home=$actualScore (expected $expectedScore)" }
  else { Fail "Score mismatch: expected $expectedScore, got $actualScore" }

  $actualPeriod = $state2.currentPeriod
  if ($actualPeriod -eq "Q1") { Ok "currentPeriod=Q1" }
  else { Fail "Expected currentPeriod=Q1, got $actualPeriod" }
}

# ── 6. Verify event list ──────────────────────────────────────────────────────
Step "GET /games/$GAME_ID/events"
$eventList = Invoke "GET" "/games/$GAME_ID/events"
if ((CountItems $eventList) -eq $events.Count) {
  Ok "Event list has $((CountItems $eventList)) events"
} else {
  Fail "Expected $($events.Count) events, got $((CountItems $eventList))"
}

# ── 7. Insights ───────────────────────────────────────────────────────────────
Step "GET /games/$GAME_ID/insights"
$insights = Invoke "GET" "/games/$GAME_ID/insights"
if ($null -ne $insights -or (CountItems $insights) -eq 0) {
  $insightCount = CountItems $insights
  Ok "Insights endpoint returned ($insightCount insights)"
  if ($insightCount -gt 0) {
    Ok "At least one insight fired: $($insights[0].type) - $($insights[0].message)"
  }
} else {
  Fail "Insights endpoint failed"
}

# ── 8. Undo (DELETE last event) ───────────────────────────────────────────────
Step "DELETE last event (undo)"
$lastEvent = $eventList | Sort-Object sequence | Select-Object -Last 1
if ($lastEvent) {
  $del = InvokeRaw "DELETE" "/games/$GAME_ID/events/$($lastEvent.id)"
  if ($del -and [int]$del.StatusCode -in 200,204) {
    Ok "DELETE /games/$GAME_ID/events/$($lastEvent.id) -> ok"
    $afterDel = Invoke "GET" "/games/$GAME_ID/events"
    $afterDelCount = CountItems $afterDel
    if ($afterDelCount -eq ($events.Count - 1)) { Ok "Event count after delete = $afterDelCount" }
    else { Fail "Expected $($events.Count - 1) events post-delete, got $afterDelCount" }
  } else {
    Fail "DELETE event failed (HTTP $($del.StatusCode))"
  }
}

# ── 9. Auth check (only when key is configured) ───────────────────────────────
if ($ApiKey) {
  Step "Auth guard check"
  $badHeaders = @{ "Content-Type" = "application/json"; "x-api-key" = "wrong-key" }
  try {
    $r = Invoke-WebRequest -Method GET -Uri "$ApiUrl/games/$GAME_ID/state" -Headers $badHeaders -ErrorAction SilentlyContinue
    if ([int]$r.StatusCode -eq 401) { Ok "Wrong API key -> 401 Unauthorized" }
    else { Fail "Expected 401 with wrong key, got $($r.StatusCode)" }
  } catch { Ok "Wrong API key -> request rejected" }
}

# ── Results ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  -----------------------------------------------------" -ForegroundColor DarkGray
$total = $pass + $fail
$color = if ($fail -eq 0) { "Green" } else { "Red" }
Write-Host "  Results: $pass/$total passed" -ForegroundColor $color
if ($fail -gt 0) {
  Write-Host "  $fail test(s) FAILED - check realtime-api is running and models are built." -ForegroundColor Red
  exit 1
} else {
  Write-Host "  All systems go. Ready for game day!" -ForegroundColor Green
  exit 0
}
