$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $repoRoot "logs"
$logFile = Join-Path $logsDir "local-dev.log"
$pidFile = Join-Path $logsDir "local-dev.pid"
$port = 3000

if (-not (Test-Path $logsDir)) {
  New-Item -ItemType Directory -Path $logsDir | Out-Null
}

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

function Get-ProcessCommandLine([int]$ProcessId) {
  try {
    return (Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId").CommandLine
  } catch {
    return $null
  }
}

$pidState = Read-PidState
$listener = Get-PortListener

if ($listener) {
  $commandLine = Get-ProcessCommandLine -ProcessId $listener.OwningProcess
  if ($commandLine -and $commandLine.Contains("vite") -and $commandLine.Contains($repoRoot)) {
    $managedState = [pscustomobject]@{
      launcherPid = if ($pidState) { $pidState.launcherPid } else { $null }
      appPid = $listener.OwningProcess
      port = $port
      repoRoot = $repoRoot
      logFile = $logFile
      startedAt = if ($pidState) { $pidState.startedAt } else { (Get-Date).ToString("s") }
    }
    $managedState | ConvertTo-Json | Set-Content $pidFile
    Write-Output "Dev server already running."
    Write-Output "Local: http://localhost:$port/"
    Write-Output "Network: http://10.10.127.107:$port/"
    exit 0
  }

  throw "Port $port is already in use by PID $($listener.OwningProcess)."
}

$cmdArgs = "/c cd /d `"$repoRoot`" && npm run dev >> `"$logFile`" 2>&1"
$launcher = Start-Process -FilePath "cmd.exe" -ArgumentList $cmdArgs -WindowStyle Hidden -PassThru

Start-Sleep -Seconds 4

$listener = Get-PortListener
if (-not $listener) {
  if ($launcher -and -not $launcher.HasExited) {
    cmd /c "taskkill /PID $($launcher.Id) /T /F" | Out-Null
  }
  throw "Dev server failed to start. Check $logFile"
}

$pidState = [pscustomobject]@{
  launcherPid = $launcher.Id
  appPid = $listener.OwningProcess
  port = $port
  repoRoot = $repoRoot
  logFile = $logFile
  startedAt = (Get-Date).ToString("s")
}

$pidState | ConvertTo-Json | Set-Content $pidFile

Write-Output "Dev server started."
Write-Output "Local: http://localhost:$port/"
Write-Output "Network: http://10.10.127.107:$port/"
Write-Output "Log: $logFile"
