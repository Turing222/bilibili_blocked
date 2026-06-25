@echo off
REM Self-locating launcher for the dedicated Bilibili Chrome profile.
REM Path is resolved relative to THIS file, so renaming or moving the
REM project folder won't break the desktop shortcut as long as this
REM .cmd and start-chrome.ps1 stay together in the same folder.
setlocal
set "HERE=%~dp0"
set "PS1=%HERE%start-chrome.ps1"
if not exist "%PS1%" (
  echo [start-bilibili] Cannot find: %PS1%
  echo [start-bilibili] Expected it next to this .cmd in: %HERE%
  pause
  exit /b 1
)
start "" /b powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Url "https://www.bilibili.com/"
endlocal
