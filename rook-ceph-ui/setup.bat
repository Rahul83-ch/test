@echo off
setlocal enabledelayedexpansion

echo ==================================
echo Rook-Ceph UI Quick Setup
echo ==================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if errorlevel 1 (
    echo X Node.js is not installed. Please install Node.js 18+ first.
    echo Download from: https://nodejs.org/
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo OK Node.js is installed: %NODE_VERSION%
echo.

REM Check if npm is installed
where npm >nul 2>nul
if errorlevel 1 (
    echo X npm is not installed.
    exit /b 1
)

for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo OK npm is installed: %NPM_VERSION%
echo.

REM Install dependencies
echo Installing dependencies...
call npm install

echo.
echo ==================================
echo OK Setup Complete!
echo ==================================
echo.
echo To start the UI server, run:
echo   npm start
echo.
echo The UI will be available at:
echo   http://localhost:3001
echo.
echo Make sure the backend API is running on:
echo   http://localhost:3000
echo.
echo ==================================
pause
