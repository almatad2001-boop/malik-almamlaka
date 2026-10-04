@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
echo.
echo Malik Al Mamlaka is starting...
echo Open http://localhost:3000
start http://localhost:3000
node server.js
pause
