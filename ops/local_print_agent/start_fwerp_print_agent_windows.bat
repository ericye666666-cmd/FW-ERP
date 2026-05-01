@echo off
setlocal
cd /d "%~dp0"

if not exist "%~dp0FW-ERP-Print-Agent.exe" (
  echo FW-ERP-Print-Agent.exe not found. Please download the official print agent package.
  pause
  exit /b 1
)

echo Starting FW-ERP Print Agent on http://127.0.0.1:8719 ...
"%~dp0FW-ERP-Print-Agent.exe" local-api
pause
