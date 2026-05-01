param()

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
  throw "build_windows_exe.ps1 must be run on a Windows build machine."
}

$Python = Get-Command python -ErrorAction SilentlyContinue
if ($null -eq $Python) {
  throw "Python was not found on this build machine. Install Python on the administrator build computer, then run: python -m pip install pyinstaller"
}

$PyInstallerVersion = & python -m PyInstaller --version 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($PyInstallerVersion)) {
  Write-Host "PyInstaller not found. On the build computer, run:"
  Write-Host "python -m pip install pyinstaller"
  throw "PyInstaller is required to build FW-ERP-Print-Agent.exe"
}

if (Test-Path ".\dist") {
  Remove-Item ".\dist" -Recurse -Force
}
if (Test-Path ".\build") {
  Remove-Item ".\build" -Recurse -Force
}
if (Test-Path ".\FW-ERP-Print-Agent.spec") {
  Remove-Item ".\FW-ERP-Print-Agent.spec" -Force
}

# Equivalent command:
# python -m PyInstaller --onefile --name FW-ERP-Print-Agent agent.py
& python -m PyInstaller --onefile --name FW-ERP-Print-Agent agent.py
if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller build failed."
}

$ExePath = Join-Path $Root "dist\FW-ERP-Print-Agent.exe"
if (!(Test-Path $ExePath)) {
  throw "dist/FW-ERP-Print-Agent.exe was not created."
}

Copy-Item -Path $ExePath -Destination (Join-Path $Root "FW-ERP-Print-Agent.exe") -Force
Write-Host "Built dist/FW-ERP-Print-Agent.exe"
Write-Host "Copied FW-ERP-Print-Agent.exe next to package_windows_agent.ps1"
Write-Host "Next: run package_windows_agent.ps1 to create fw-erp-print-agent-windows.zip"
