# FW-ERP Windows Print Agent launcher.
# Download this file, right click it, and choose "Run with PowerShell".
# It installs the Python local print agent into the current Windows user profile
# and starts the local API on http://127.0.0.1:8719.

param(
    [string]$RepoRawBase = "https://raw.githubusercontent.com/ericye666666-cmd/FW-ERP/main/ops/local_print_agent"
)

$ErrorActionPreference = "Stop"
$InstallDir = Join-Path $env:LOCALAPPDATA "FW-ERP\PrintAgent"
$HealthUrl = "http://127.0.0.1:8719/health"
$PrintersUrl = "http://127.0.0.1:8719/printers"

Write-Host "FW-ERP Windows Print Agent"
Write-Host "Install folder: $InstallDir"
Write-Host "Health check: $HealthUrl"
Write-Host "Printer list: $PrintersUrl"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Set-Location $InstallDir

function Resolve-Python {
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        return @{ Command = "py"; Args = @("-3") }
    }
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return @{ Command = "python"; Args = @() }
    }
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        Write-Host "Python was not found. Installing Python 3 with winget..."
        winget install -e --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
        $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
        if ($pyLauncher) {
            return @{ Command = "py"; Args = @("-3") }
        }
        $python = Get-Command python -ErrorAction SilentlyContinue
        if ($python) {
            return @{ Command = "python"; Args = @() }
        }
    }
    throw "Python is required. Install Python 3, then run this launcher again."
}

function Download-AgentFile([string]$Name) {
    $target = Join-Path $InstallDir $Name
    $uri = "$RepoRawBase/$Name"
    Write-Host "Downloading $Name ..."
    Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $target
}

Download-AgentFile "agent.py"
Download-AgentFile "requirements.txt"

$python = Resolve-Python
$pythonCommand = $python.Command
$pythonArgs = @($python.Args)
& $pythonCommand @pythonArgs -m venv .venv
$agentPython = Join-Path $InstallDir ".venv\Scripts\python.exe"
& $agentPython -m pip install --upgrade pip
& $agentPython -m pip install -r requirements.txt

Write-Host ""
Write-Host "Starting FW-ERP Print Agent on http://127.0.0.1:8719 ..."
Write-Host "Keep this window open while printing from ERP."
Write-Host "After it starts, return to ERP and click Detect Print Agent."
& $agentPython agent.py local-api
