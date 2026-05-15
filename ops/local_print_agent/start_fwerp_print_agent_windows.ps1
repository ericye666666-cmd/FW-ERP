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
$ManualPythonMessage = "请安装 Python 3，并勾选 Add Python to PATH，然后重新双击启动助手。"

Write-Host "FW-ERP Windows Print Agent"
Write-Host "Install folder: $InstallDir"
Write-Host "Health check: $HealthUrl"
Write-Host "Printer list: $PrintersUrl"

function Test-PythonCandidate {
    param(
        [string]$Command,
        [string[]]$CandidateArgs = @()
    )

    $commandInfo = Get-Command $Command -ErrorAction SilentlyContinue
    if (-not $commandInfo) {
        return $null
    }

    $displayCommand = "$Command $($CandidateArgs -join ' ')".Trim()
    $probeArgs = @($CandidateArgs) + @("-c", "import sys; print(sys.executable)")
    Write-Host "Checking Python candidate: $displayCommand"

    $probeOutput = & $Command @probeArgs 2>&1
    $probeExitCode = $LASTEXITCODE
    $probeText = ($probeOutput | Out-String).Trim()
    $storeAliasPattern = "Microsoft Store|Python was not found|run without arguments to install|App Execution Alias|App Installer"

    if ($probeExitCode -ne 0) {
        if ($probeText -match $storeAliasPattern) {
            Write-Host "Skipping Microsoft Store Python alias: $probeText"
        } else {
            Write-Host "Skipping Python candidate '$displayCommand' because it failed: $probeText"
        }
        return $null
    }

    if (-not $probeText) {
        Write-Host "Skipping Python candidate '$displayCommand' because it did not report sys.executable."
        return $null
    }

    if ($probeText -match $storeAliasPattern) {
        Write-Host "Skipping Microsoft Store Python alias: $probeText"
        return $null
    }

    Write-Host "Using Python: $probeText"
    return @{ Command = $Command; Args = @($CandidateArgs); Executable = $probeText }
}

function Get-ValidPythonCandidate {
    $candidate = Test-PythonCandidate -Command "py" -CandidateArgs @("-3")
    if ($candidate) {
        return $candidate
    }

    $candidate = Test-PythonCandidate -Command "python" -CandidateArgs @()
    if ($candidate) {
        return $candidate
    }

    return $null
}

function Refresh-PathFromRegistry {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Resolve-Python {
    $candidate = Get-ValidPythonCandidate
    if ($candidate) {
        return $candidate
    }

    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        Write-Host "Python was not found. Installing Python 3.12 with winget..."
        winget install -e --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -ne 0) {
            Write-Host "winget failed to install Python 3.12. Exit code: $LASTEXITCODE"
        } else {
            Refresh-PathFromRegistry
            $candidate = Get-ValidPythonCandidate
            if ($candidate) {
                return $candidate
            }
        }
    } else {
        Write-Host "winget was not found, so Python cannot be installed automatically."
    }

    throw "Python is required. $ManualPythonMessage"
}

function Download-AgentFile([string]$Name) {
    $target = Join-Path $InstallDir $Name
    $uri = "$RepoRawBase/$Name"
    Write-Host "Downloading $Name ..."
    Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $target
}

try {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    Set-Location $InstallDir

    Download-AgentFile "agent.py"
    Download-AgentFile "requirements.txt"

    $python = Resolve-Python
    $pythonCommand = $python.Command
    $pythonArgs = @($python.Args)
    & $pythonCommand @pythonArgs -m venv .venv
    if ($LASTEXITCODE -ne 0) {
        throw "创建 Python 虚拟环境失败，无法启动打印助手。$ManualPythonMessage"
    }

    $agentPython = Join-Path $InstallDir ".venv\Scripts\python.exe"
    if (-not (Test-Path $agentPython)) {
        throw "创建 Python 虚拟环境失败：未找到 $agentPython。$ManualPythonMessage"
    }

    & $agentPython -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) {
        throw "安装 Python pip 依赖工具失败，无法启动打印助手。"
    }

    & $agentPython -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        throw "安装打印助手 Python 依赖失败，无法启动打印助手。"
    }

    Write-Host ""
    Write-Host "Starting FW-ERP Print Agent on http://127.0.0.1:8719 ..."
    Write-Host "Keep this window open while printing from ERP."
    Write-Host "After it starts, return to ERP and click Detect Print Agent."
    & $agentPython agent.py local-api
    exit $LASTEXITCODE
} catch {
    Write-Host ""
    Write-Host "FW-ERP Print Agent failed to start."
    Write-Host $_.Exception.Message
    Write-Host ""
    Write-Host $ManualPythonMessage
    exit 1
}
