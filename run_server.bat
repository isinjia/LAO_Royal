@echo off
rem Last Royal - local server (double-click to run)
rem   run_server.bat          -> http://localhost:8766
rem   run_server.bat 9000     -> another port
rem (keep this file ASCII-only: cmd mis-parses multi-byte lines)
title Last Royal Server
cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8766"
set "URL=http://localhost:%PORT%/index.html"

rem find python (or the py launcher)
set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY where py >nul 2>nul && set "PY=py"
if not defined PY (
  echo [ERROR] Python was not found. Install it from https://www.python.org and run again.
  pause
  exit /b 1
)

rem a server already listening on this port: just open the game
netstat -ano | findstr /r /c:"127.0.0.1:%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo Server is already running: %URL%
  if not "%NOBROWSER%"=="1" start "" "%URL%"
  exit /b 0
)

echo ========================================
echo   LAST ROYAL server
echo   %URL%
echo   Close this window to stop the server.
echo ========================================
rem open the browser two seconds later, once the server is up
if not "%NOBROWSER%"=="1" start "" /min cmd /c "timeout /t 2 /nobreak >nul & start "" %URL%"
%PY% tools\serve.py %PORT%
pause
