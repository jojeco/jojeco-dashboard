@echo off
echo ================================================
echo JojeCo Dashboard - Deployment Script
echo ================================================
echo.

REM Check if .env file exists
if not exist .env (
    echo ERROR: .env file not found!
    echo Please create a .env file with your Firebase credentials.
    pause
    exit /b 1
)

echo [1/7] Updating dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo WARNING: npm install had issues, continuing anyway...
)

echo.
echo [2/7] Checking for outdated packages...
call npm outdated
echo.

echo [3/7] Stopping existing container...
docker-compose down

echo.
echo [4/7] Building Docker image with environment variables...
echo This may take a few minutes...
docker-compose build --no-cache

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Docker build failed!
    echo Check the error messages above.
    pause
    exit /b 1
)

echo.
echo [5/7] Starting container...
docker-compose up -d

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Failed to start container!
    pause
    exit /b 1
)

echo.
echo [6/7] Waiting for container to be ready...
timeout /t 10 /nobreak > nul

echo.
echo [7/7] Checking container status...
docker-compose ps

echo.
echo ================================================
echo Deployment Complete!
echo ================================================
echo.
echo Your dashboard should be available at:
echo   - Local: http://192.168.50.201:3005
echo   - Public: https://jojeco.ca
echo.
echo To view logs, run:
echo   docker-compose logs -f
echo.
echo To stop the container, run:
echo   docker-compose down
echo.
pause