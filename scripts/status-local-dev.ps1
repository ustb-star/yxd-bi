$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $repoRoot "logs"
$pidFile = Join-Path $logsDir "local-dev.pid"
$port = 3000
$networkAddress = "10.10.127.107"

function Get-PortListener {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
}

if (Test-Path $pidFile) {
  try {
    $pidState = Get-Content $pidFile | ConvertFrom-Json
    Write-Output "Pid file: $pidFile"
    Write-Output "Launcher PID: $($pidState.launcherPid)"
    Write-Output "App PID: $($pidState.appPid)"
    Write-Output "Started At: $($pidState.startedAt)"
  } catch {
    Write-Output "Pid file exists but could not be parsed."
  }
} else {
  Write-Output "Pid file: not found"
}

$listener = Get-PortListener
if ($listener) {
  Write-Output "Status: running"
  Write-Output "Listening PID: $($listener.OwningProcess)"
  Write-Output "Local: https://localhost:$port/"
  Write-Output "Network: https://$networkAddress`:$port/"
} else {
  Write-Output "Status: stopped"
}
