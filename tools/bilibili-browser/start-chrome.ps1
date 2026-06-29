param(
  [string]$ProfileDir = "$env:USERPROFILE\codex-browser-profiles\bilibili",
  [int]$Port = 9223,
  [string]$RemoteDebuggingAddress = "127.0.0.1",
  [string]$Url = "https://www.bilibili.com/",
  [switch]$OpenUrlWhenRunning
)

$ErrorActionPreference = "Stop"

$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
  throw "Chrome was not found in the usual install locations."
}

function Test-LoopbackOnly {
  param([int]$ListenPort)

  $listeners = @()
  try {
    $listeners = @(Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction Stop)
  } catch {
    $netstat = netstat -ano | Select-String ":$ListenPort\s"
    if (-not $netstat) {
      throw "Port $ListenPort is not listening yet."
    }
    foreach ($line in $netstat) {
      if ($line -match "\s(\d+\.\d+\.\d+\.\d+|\[[0-9a-f:]+\]):$ListenPort\s") {
        $addr = $Matches[1].Trim("[]")
        if ($addr -ne "127.0.0.1" -and $addr -ne "::1") {
          throw "Port $ListenPort is listening on non-loopback address: $addr"
        }
      }
    }
    return
  }

  foreach ($conn in $listeners) {
    $addr = $conn.LocalAddress
    if ($addr -ne "127.0.0.1" -and $addr -ne "::1") {
      throw "Port $ListenPort is listening on non-loopback address: $addr"
    }
  }
}

New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null

$versionUrl = "http://${RemoteDebuggingAddress}:$Port/json/version"
$alreadyRunning = $false
try {
  Invoke-RestMethod -Uri $versionUrl -TimeoutSec 2 | Out-Null
  $alreadyRunning = $true
} catch {
  $alreadyRunning = $false
}

if (-not $alreadyRunning) {
  $args = @(
    "--remote-debugging-address=$RemoteDebuggingAddress",
    "--remote-debugging-port=$Port",
    "--user-data-dir=$ProfileDir",
    "--no-first-run",
    "--disable-default-apps",
    $Url
  )
  Start-Process -FilePath $chrome -ArgumentList $args
  Start-Sleep -Seconds 2
} elseif ($OpenUrlWhenRunning -and $Url) {
  $newTabUrl = "http://${RemoteDebuggingAddress}:$Port/json/new?$([uri]::EscapeDataString($Url))"
  try {
    Invoke-RestMethod -Method Put -Uri $newTabUrl -TimeoutSec 5 | Out-Null
  } catch {
    Start-Process -FilePath $chrome -ArgumentList @("--user-data-dir=$ProfileDir", $Url)
  }
}

Test-LoopbackOnly -ListenPort $Port

$version = Invoke-RestMethod -Uri $versionUrl -TimeoutSec 10
[pscustomobject]@{
  status = if ($alreadyRunning) { "already-running" } else { "started" }
  profileDir = $ProfileDir
  port = $Port
  remoteDebuggingAddress = $RemoteDebuggingAddress
  loopbackOnly = $true
  openedUrl = [bool]($OpenUrlWhenRunning -and $Url)
  browser = $version.Browser
  debuggerUrl = $version.webSocketDebuggerUrl
} | ConvertTo-Json -Depth 4
