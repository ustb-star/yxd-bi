$ErrorActionPreference = "Stop"

$localPort = if ($env:CLOUDFLARE_LOCAL_PORT) { $env:CLOUDFLARE_LOCAL_PORT } else { "4173" }
$localUrl = "http://127.0.0.1:$localPort"
$token = $env:CLOUDFLARE_TUNNEL_TOKEN

if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Error "Missing CLOUDFLARE_TUNNEL_TOKEN. Please set it in your environment before running this script."
}

$candidateBins = @()
if (-not [string]::IsNullOrWhiteSpace($env:CLOUDFLARED_BIN)) {
  $candidateBins += $env:CLOUDFLARED_BIN
}
$candidateBins += "$PSScriptRoot\..\..\.share\cloudflared.exe"
$candidateBins += "$PSScriptRoot\..\.share\cloudflared.exe"

$cloudflared = $null
foreach ($bin in $candidateBins) {
  if (Test-Path $bin) {
    $cloudflared = (Resolve-Path $bin).Path
    break
  }
}

if (-not $cloudflared) {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) {
    $cloudflared = $cmd.Source
  }
}

if (-not $cloudflared) {
  Write-Error "Cannot find cloudflared binary. Install cloudflared or set CLOUDFLARED_BIN to the executable path."
}

Write-Host "Using cloudflared: $cloudflared"
Write-Host "Tunnel target url: $localUrl"
Write-Host "Starting Cloudflare Named Tunnel..."

& $cloudflared tunnel --no-autoupdate --url $localUrl run --token $token
