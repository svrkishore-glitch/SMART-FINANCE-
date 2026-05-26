@echo off
SETLOCAL EnableDelayedExpansion

echo ==========================================
echo    SmartFinance Startup Script
echo ==========================================

:: 1. Check if Docker is running
echo [1/4] Checking Docker status...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not running or not installed. Please start Docker Desktop.
    pause
    exit /b 1
)

:: 2. Handle Valkey Cache
echo [2/4] Initializing Valkey Cache...
docker ps -a --filter "name=valkey" --format "{{.Names}}" | findstr /x "valkey" >nul
if %errorlevel% equ 0 (
    echo Valkey container found. Checking if it's running...
    docker ps --filter "name=valkey" --filter "status=running" --format "{{.Names}}" | findstr /x "valkey" >nul
    if %errorlevel% neq 0 (
        echo Starting existing Valkey container...
        docker start valkey
    ) else (
        echo Valkey is already running.
    )
) else (
    echo Creating and starting new Valkey container...
    docker run -d --name valkey -p 6379:6379 valkey/valkey:latest
)

:: 3. Install Dependencies
echo [3/4] Checking dependencies...
if not exist "node_modules" (
    echo Installing npm dependencies...
    call npm install
) else (
    echo Dependencies already installed.
)

:: 4. Start Server
echo [4/4] Launching SmartFinance...
echo ------------------------------------------
echo Server will be available at http://localhost:3000
echo Press Ctrl+C to stop the server.
echo ------------------------------------------
call npm start

pause
