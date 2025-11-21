@echo off
REM ================================================
REM JojeCo Dashboard - Auto-Start Script
REM Runs on Windows startup with Docker wait
REM ================================================

REM Set the project directory
cd /d C:\jojeco-dashboard

REM Log file for debugging
set LOGFILE=C:\jojeco-dashboard\startup.log

REM Startup delay in seconds (adjust as needed)
set STARTUP_DELAY=60

REM Clear old log (keep last 100 lines)
if exist %LOGFILE% (
    powershell -Command "(Get-Content %LOGFILE% -Tail 100) | Set-Content %LOGFILE%"
)

echo [%date% %time%] ===== JojeCo Dashboard Startup ===== >> %LOGFILE%
echo [%date% %time%] Waiting %STARTUP_DELAY% seconds for system to stabilize... >> %LOGFILE%

REM Wait for system to boot up (Docker, network, etc.)
timeout /t %STARTUP_DELAY% /nobreak >nul

echo [%date% %time%] Startup delay complete, checking Docker... >> %LOGFILE%

REM Check if Docker Desktop is running
echo [%date% %time%] Checking Docker Desktop status... >> %LOGFILE%
tasklist /FI "IMAGENAME eq Docker Desktop.exe" 2>NUL | find /I /N "Docker Desktop.exe">NUL
if "%ERRORLEVEL%"=="1" (
    echo [%date% %time%] Docker Desktop not running, starting it... >> %LOGFILE%
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo [%date% %time%] Waiting for Docker Desktop to start... >> %LOGFILE%
) else (
    echo [%date% %time%] Docker Desktop already running >> %LOGFILE%
)

REM Wait for Docker daemon to be ready (up to 120 seconds)
echo [%date% %time%] Waiting for Docker daemon to be ready... >> %LOGFILE%
set /a counter=0
:docker_wait
docker info >nul 2>&1
if %ERRORLEVEL% EQU 0 goto docker_ready
set /a counter+=1
if %counter% GEQ 120 (
    echo [%date% %time%] ERROR: Docker not ready after 120 seconds >> %LOGFILE%
    echo [%date% %time%] Please check Docker Desktop logs >> %LOGFILE%
    exit /b 1
)
if %counter% EQU 30 (
    echo [%date% %time%] Still waiting for Docker... (%counter%/120 seconds) >> %LOGFILE%
)
if %counter% EQU 60 (
    echo [%date% %time%] Still waiting for Docker... (%counter%/120 seconds) >> %LOGFILE%
)
if %counter% EQU 90 (
    echo [%date% %time%] Still waiting for Docker... (%counter%/120 seconds) >> %LOGFILE%
)
timeout /t 1 /nobreak >nul
goto docker_wait

:docker_ready
echo [%date% %time%] Docker is ready (waited %counter% seconds) >> %LOGFILE%

REM Start the dashboard container
echo [%date% %time%] Starting JojeCo Dashboard... >> %LOGFILE%
docker-compose up -d >> %LOGFILE% 2>&1

if %ERRORLEVEL% EQU 0 (
    echo [%date% %time%] JojeCo Dashboard started successfully >> %LOGFILE%
    echo [%date% %time%] Dashboard available at http://192.168.50.201:3005 >> %LOGFILE%
    echo [%date% %time%] Public URL: https://jojeco.ca >> %LOGFILE%
) else (
    echo [%date% %time%] ERROR: Failed to start JojeCo Dashboard >> %LOGFILE%
    echo [%date% %time%] Check docker-compose logs for details >> %LOGFILE%
    exit /b 1
)

REM Wait a bit for container to fully start
timeout /t 5 /nobreak >nul

REM Check container health
docker ps | findstr jojeco-dashboard >> %LOGFILE% 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [%date% %time%] Container health check: PASSED >> %LOGFILE%
) else (
    echo [%date% %time%] Container health check: FAILED >> %LOGFILE%
)

echo [%date% %time%] ===== Startup Complete ===== >> %LOGFILE%
exit /b 0