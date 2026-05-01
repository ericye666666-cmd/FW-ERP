param(
    [ValidateSet("local-api", "print-station")]
    [string]$Mode = "local-api",
    [string]$ConfigPath = ".\print_station_config.json"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt

if ($Mode -eq "print-station") {
    if (-not (Test-Path $ConfigPath)) {
        if (Test-Path ".\print_station_config.example.json") {
            Copy-Item ".\print_station_config.example.json" $ConfigPath
            Write-Host "Created $ConfigPath from example. Update station_id/printer_name before running in production."
        }
    }
    Write-Host "Starting FW-ERP Print Station mode..."
    python agent.py print-station --config $ConfigPath
} else {
    Write-Host "Starting FW-ERP Local Print Agent local-api mode on http://127.0.0.1:8719 ..."
    python agent.py local-api
}
