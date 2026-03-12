$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $repoRoot "logs"
$pidFile = Join-Path $logsDir "local-dev.pid"
$port = 3000

function Get-PortListener {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Read-PidState {
  if (-not (Test-Path $pidFile)) {
    return $null
  }

  try {
    return Get-Content $pidFile | ConvertFrom-Json
  } catch {
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    return $null
  }
}

$pidState = Read-PidState
$stopped = $false

if ($pidState -and $pidState.launcherPid) {
  cmd /c "taskkill /PID $($pidState.launcherPid) /T /F" | Out-Null
  $stopped = $true
}

Start-Sleep -Seconds 1

$listener = Get-PortListener
if ($listener) {
  $commandLine = $null
  try {
    $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)").CommandLine
  } catch {
    $commandLine = $null
  }

  if ($commandLine -and $commandLine.Contains("vite") -and $commandLine.Contains($repoRoot)) {
    cmd /c "taskkill /PID $($listener.OwningProcess) /T /F" | Out-Null
    $stopped = $true
  }
}

Remove-Item $pidFile -Force -ErrorAction SilentlyContinue

if ($stopped) {
  Write-Output "Dev server stopped."
} else {
  Write-Output "No managed dev server was running."
}
