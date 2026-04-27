$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt

if (-not (Test-Path ".\print_station_config.json")) {
    if (Test-Path ".\print_station_config.example.json") {
        Copy-Item ".\print_station_config.example.json" ".\print_station_config.json"
        Write-Host "Created print_station_config.json from example. Update station_id/printer_name before running in production."
    }
}

python agent.py print-station --config .\print_station_config.json
