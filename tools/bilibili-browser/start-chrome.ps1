param(
  [string]$ProfileDir = "$env:USERPROFILE\codex-browser-profiles\bilibili",
  [int]$Port = 9223,
  [string]$Url = "https://www.bilibili.com/"
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

New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null

$versionUrl = "http://127.0.0.1:$Port/json/version"
$alreadyRunning = $false
try {
  Invoke-RestMethod -Uri $versionUrl -TimeoutSec 2 | Out-Null
  $alreadyRunning = $true
} catch {
  $alreadyRunning = $false
}

if (-not $alreadyRunning) {
  $args = @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=$ProfileDir",
    "--no-first-run",
    "--disable-default-apps",
    $Url
  )
  Start-Process -FilePath $chrome -ArgumentList $args
  Start-Sleep -Seconds 2
}

$version = Invoke-RestMethod -Uri $versionUrl -TimeoutSec 10
[pscustomobject]@{
  status = if ($alreadyRunning) { "already-running" } else { "started" }
  profileDir = $ProfileDir
  port = $Port
  browser = $version.Browser
  debuggerUrl = $version.webSocketDebuggerUrl
} | ConvertTo-Json -Depth 4
