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
  $ExePath = Join-Path $Root "FW-ERP-Print-Agent.exe"
  if (!(Test-Path $ExePath)) {
    throw "FW-ERP-Print-Agent.exe not found. Run build_windows_exe.ps1 on a Windows build machine first."
  }

  $RequiredFiles = @(
    "FW-ERP-Print-Agent.exe",
    "start_fwerp_print_agent_windows.bat",
    "README.md",
    "print_station_config.example.json"
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

  Copy-Item -Path (Join-Path $Root "start_fwerp_print_agent_windows.bat") -Destination (Join-Path $StageRoot "启动 FW-ERP 打印助手.bat") -Force

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
