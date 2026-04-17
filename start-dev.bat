@echo off
title ReviewLens - Dev Servers
set ROOT=%~dp0

if not exist "%ROOT%.venv\Scripts\python.exe" (
	echo [ERROR] Python virtual environment not found at %ROOT%.venv
	echo Create it first, then install backend requirements.
	pause
	exit /b 1
)

echo ============================================
echo   ReviewLens - Starting Dev Environment
echo ============================================
echo.

:: Start Flask backend on port 5000 with auto-reload on file changes
echo [1/2] Starting Flask backend (localhost:5000) [auto-reload ON]...
start "ReviewLens Backend" cmd /k "cd /d %ROOT%backend && set FLASK_DEBUG=1 && ""%ROOT%.venv\Scripts\python.exe"" _11_app.py"

:: Wait for backend to be ready
timeout /t 3 /nobreak >nul

:: Start React frontend on port 4200
echo [2/2] Starting React frontend (localhost:4200)...
start "ReviewLens Frontend" cmd /k "cd /d %ROOT%frontend && set PORT=4200 && npm start"

echo.
echo ============================================
echo   Backend:  http://localhost:5000
echo   Frontend: http://localhost:4200
echo ============================================
echo.
echo Close this window anytime. The servers run in separate windows.
pause

:: .\start-dev.bat