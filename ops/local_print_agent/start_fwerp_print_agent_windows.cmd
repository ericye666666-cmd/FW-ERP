@echo off
setlocal
title FW-ERP Windows Print Agent

echo FW-ERP Windows Print Agent
echo.
echo Keep this black window open while printing from ERP.
echo After the agent starts, return to ERP and click Detect Print Agent.
echo Local agent URL: http://127.0.0.1:8719
echo.

set "SCRIPT_URL=https://raw.githubusercontent.com/ericye666666-cmd/FW-ERP/main/ops/local_print_agent/start_fwerp_print_agent_windows.ps1"
set "SCRIPT_PATH=%TEMP%\fw-erp-print-agent-windows.ps1"

echo Downloading startup logic...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri '%SCRIPT_URL%' -OutFile '%SCRIPT_PATH%' } catch { Write-Host $_; exit 1 }"
if errorlevel 1 goto download_failed

echo Starting Print Agent through PowerShell...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_PATH%"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo Print Agent exited with code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%

:download_failed
echo.
echo Could not download FW-ERP Print Agent startup logic.
echo Check the internet connection, then double-click this file again.
pause
exit /b 1
