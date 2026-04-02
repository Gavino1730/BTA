#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Game-day launcher for the Basketball Platform.
  Prints local IPs so the operator console can connect, then starts all apps/services.

.USAGE
  From the repo root:
    .\scripts\game-day.ps1
  With an API key:
    .\scripts\game-day.ps1 -ApiKey "mysecret"
#>
param(
  [string]$ApiKey = $env:BTA_API_KEY
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Banner ──────────────────────────────────────────────────────────────────
Clear-Host
Write-Host ""
Write-Host "  ██████  ██ ██    ██  ██████  ████████ " -ForegroundColor Cyan
Write-Host "  ██   ██ ██ ██    ██ ██    ██    ██    " -ForegroundColor Cyan
Write-Host "  ██████  ██ ██    ██ ██    ██    ██    " -ForegroundColor Cyan
Write-Host "  ██      ██  ██  ██  ██    ██    ██    " -ForegroundColor Cyan
Write-Host "  ██      ██   ████    ██████     ██    " -ForegroundColor Cyan
Write-Host ""
Write-Host "  Basketball Intelligence Platform — Game Day Launcher" -ForegroundColor White
Write-Host ""

# ── Local IP discovery ───────────────────────────────────────────────────────
$ips = @(
  Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
    Select-Object -ExpandProperty IPAddress
)

Write-Host "  ┌─────────────────────────────────────────────────────┐" -ForegroundColor DarkGray
Write-Host "  │  SERVICE ENDPOINTS                                  │" -ForegroundColor DarkGray
Write-Host "  ├─────────────────────────────────────────────────────┤" -ForegroundColor DarkGray

foreach ($ip in $ips) {
  Write-Host "  │  Realtime API    http://${ip}:4000                 " -ForegroundColor Green -NoNewline
  Write-Host "│" -ForegroundColor DarkGray
  Write-Host "  │  Coach Dashboard http://${ip}:5173                 " -ForegroundColor Yellow -NoNewline
  Write-Host "│" -ForegroundColor DarkGray
  Write-Host "  │  Operator Console http://${ip}:5174                " -ForegroundColor Blue -NoNewline
  Write-Host "│" -ForegroundColor DarkGray
  Write-Host "  │                                                     │" -ForegroundColor DarkGray
}

Write-Host "  │  Operator Console → Settings → Game Setup          │" -ForegroundColor White -NoNewline
Write-Host ""
Write-Host "  │    Realtime API URL: http://<IP>:4000              │" -ForegroundColor White -NoNewline
Write-Host ""
Write-Host "  └─────────────────────────────────────────────────────┘" -ForegroundColor DarkGray
Write-Host ""

# ── API key notice ────────────────────────────────────────────────────────────
if ($ApiKey) {
  $env:BTA_API_KEY = $ApiKey
  Write-Host "  🔐  API key configured." -ForegroundColor Magenta
} else {
  Write-Host "  ⚠   No API key — running in open dev mode." -ForegroundColor DarkYellow
  Write-Host "      Run with -ApiKey <secret> to enable auth." -ForegroundColor DarkYellow
}
Write-Host ""

# ── Pre-flight checks ─────────────────────────────────────────────────────────
Write-Host "  Pre-flight checks…" -ForegroundColor Gray

# Node
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "  ✗  node not found. Install Node.js 20+." -ForegroundColor Red; exit 1
}
Write-Host "  ✓  node $(node --version)" -ForegroundColor Green

Write-Host ""
Write-Host "  Starting all apps/services with concurrently..." -ForegroundColor Cyan
Write-Host "  (Ctrl-C to stop everything)" -ForegroundColor Gray
Write-Host ""

# ── Launch ────────────────────────────────────────────────────────────────────
Push-Location (Join-Path $PSScriptRoot "..")
try {
  & npm run dev:all
} finally {
  Pop-Location
}
