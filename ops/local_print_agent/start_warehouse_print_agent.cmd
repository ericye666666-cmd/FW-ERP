@echo off
setlocal EnableExtensions
title FW-ERP Warehouse Print Agent

echo FW-ERP Warehouse Print Agent
echo.
echo Keep this window open while printing.
echo After the agent starts, return to ERP and click Detect Print Agent.
echo Local agent URL: http://127.0.0.1:8719
echo.

set "INSTALL_DIR=%LOCALAPPDATA%\FW-ERP\PrintAgent"
set "REPO_RAW_BASE=https://raw.githubusercontent.com/ericye666666-cmd/FW-ERP/main/ops/local_print_agent"
set "AGENT_URL=%REPO_RAW_BASE%/agent.py"
set "REQ_URL=%REPO_RAW_BASE%/requirements.txt"

where curl.exe >nul 2>nul
if errorlevel 1 (
  echo curl.exe was not found. Windows 10 or newer includes curl.exe.
  echo Update Windows or install curl, then run this file again.
  pause
  exit /b 1
)

set "PYTHON_CMD="
py -3 -c "import sys" >nul 2>nul
if not errorlevel 1 set "PYTHON_CMD=py -3"
if not defined PYTHON_CMD (
  python -c "import sys" >nul 2>nul
  if not errorlevel 1 set "PYTHON_CMD=python"
)
if not defined PYTHON_CMD (
  echo Install Python 3 and check Add Python to PATH, then run this file again.
  pause
  exit /b 1
)

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if errorlevel 1 (
  echo Could not create install folder: %INSTALL_DIR%
  pause
  exit /b 1
)

pushd "%INSTALL_DIR%"
if errorlevel 1 (
  echo Could not open install folder: %INSTALL_DIR%
  pause
  exit /b 1
)

echo Downloading latest agent.py...
curl.exe -fL --retry 3 -o agent.py "%AGENT_URL%"
if errorlevel 1 goto download_failed

echo Downloading latest requirements.txt...
curl.exe -fL --retry 3 -o requirements.txt "%REQ_URL%"
if errorlevel 1 goto download_failed

if not exist ".venv\Scripts\python.exe" (
  echo Creating Python virtual environment...
  %PYTHON_CMD% -m venv .venv
  if errorlevel 1 goto venv_failed
)

set "AGENT_PYTHON=%CD%\.venv\Scripts\python.exe"
if not exist "%AGENT_PYTHON%" goto venv_failed

echo Installing Python requirements...
"%AGENT_PYTHON%" -m pip install -r requirements.txt
if errorlevel 1 goto pip_failed

echo.
echo Starting FW-ERP Warehouse Print Agent on http://127.0.0.1:8719 ...
echo Keep this window open while printing.
echo.
"%AGENT_PYTHON%" agent.py local-api
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo Print Agent exited with code %EXIT_CODE%.
popd
pause
exit /b %EXIT_CODE%

:download_failed
echo.
echo Could not download the latest FW-ERP Print Agent files.
echo Check the internet connection, then run this file again.
popd
pause
exit /b 1

:venv_failed
echo.
echo Could not create or reuse the Python virtual environment.
echo Install Python 3 and check Add Python to PATH, then run this file again.
popd
pause
exit /b 1

:pip_failed
echo.
echo Could not install Python requirements.
echo Check the internet connection, then run this file again.
popd
pause
exit /b 1
