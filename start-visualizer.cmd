@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0.tools\node-v24.21.0-win-x64\node.exe" set "PATH=%~dp0.tools\node-v24.21.0-win-x64;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS from https://nodejs.org/ then run this file again.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  call npm.cmd ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm.cmd run dev -- --open
if errorlevel 1 pause
