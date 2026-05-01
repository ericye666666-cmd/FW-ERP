param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$PackageName = "fw-erp-print-agent-windows.zip"
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $Root $PackageName
}

$StageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("fw-erp-print-agent-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $StageRoot | Out-Null

try {
  $RequiredFiles = @(
    "agent.py",
    "start_windows.ps1",
    "README.md",
    "print_station_config.example.json",
    "requirements.txt"
  )

  foreach ($FileName in $RequiredFiles) {
    $Source = Join-Path $Root $FileName
    if (!(Test-Path $Source)) {
      throw "Missing required package file: $FileName"
    }
    Copy-Item -Path $Source -Destination (Join-Path $StageRoot $FileName) -Force
  }

  $OptionalFiles = @(
    "README_WINDOWS_NON_TECHNICAL.md"
  )
  foreach ($FileName in $OptionalFiles) {
    $Source = Join-Path $Root $FileName
    if (Test-Path $Source) {
      Copy-Item -Path $Source -Destination (Join-Path $StageRoot $FileName) -Force
    }
  }

  $Launcher = @"
@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0start_windows.ps1"
pause
"@
  Set-Content -Path (Join-Path $StageRoot "启动 FW-ERP 打印助手.bat") -Value $Launcher -Encoding ASCII

  if (Test-Path $OutputPath) {
    Remove-Item $OutputPath -Force
  }
  Compress-Archive -Path (Join-Path $StageRoot "*") -DestinationPath $OutputPath -Force
  Write-Host "Created $OutputPath"
  Write-Host "Do not commit this zip. Upload it to your /downloads static directory."
} finally {
  if (Test-Path $StageRoot) {
    Remove-Item $StageRoot -Recurse -Force
  }
}
