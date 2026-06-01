# Machine Monitor Agent Watchdog
# Monitors agent.js and restarts it if it dies
# Designed to run as a background process, launched from launch.js

param(
    [string]$AgentDir = "C:\Users\moham\Projects\machine-monitor\agent",
    [string]$NodePath = "C:\Users\moham\AppData\Local\hermes\node\node.exe",
    [string]$AgentScript = "agent.js",
    [int]$CheckInterval = 10,
    [int]$RestartDelay = 5,
    [int]$MaxRestartsPerHour = 10
)

$ErrorActionPreference = "Stop"
$logFile = Join-Path $AgentDir "watchdog.log"
$pidFile = Join-Path $AgentDir "agent.pid"

function Write-Log {
    param([string]$Message)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [watchdog] $Message"
    Write-Host $line
    Add-Content -Path $logFile -Value $line -ErrorAction SilentlyContinue
}

# Track restarts for rate limiting (DateTime objects only)
$restartHistory = [System.Collections.Generic.List[datetime]]::new()

# Cleanup stale PID file on startup
if (Test-Path $pidFile) {
    $stalePid = Get-Content $pidFile -ErrorAction SilentlyContinue
    $proc = Get-Process -Id $stalePid -ErrorAction SilentlyContinue
    if (-not $proc) {
        Write-Log "Removing stale PID file (PID $stalePid not running)"
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }
}

Write-Log "Watchdog starting. Monitoring: $AgentDir\$AgentScript"
Write-Log "Node: $NodePath | CheckInterval: ${CheckInterval}s | RestartDelay: ${RestartDelay}s"
Write-Log "Max restarts per hour: $MaxRestartsPerHour"

while ($true) {
    Start-Sleep -Seconds $CheckInterval

    # Check if agent is running
    $agentPid = $null
    if (Test-Path $pidFile) {
        $agentPid = Get-Content $pidFile -ErrorAction SilentlyContinue
    }

    $agentRunning = $false
    if ($agentPid) {
        $proc = Get-Process -Id $agentPid -ErrorAction SilentlyContinue
        if ($proc -and $proc.ProcessName -eq "node") {
            $agentRunning = $true
        }
    }

    if (-not $agentRunning) {
        # Rate limiting: count restarts in last hour (strict DateTime typing)
        $now = Get-Date
        $cutoff = $now.AddHours(-1)
        $recentRestarts = $restartHistory | Where-Object { $_ -is [datetime] -and $_ -gt $cutoff }
        $restartHistory = [System.Collections.Generic.List[datetime]]::new($recentRestarts)

        if ($restartHistory.Count -ge $MaxRestartsPerHour) {
            Write-Log "RATE LIMIT: $($restartHistory.Count) restarts in last hour. Waiting..."
            Start-Sleep -Seconds 60
            continue
        }

        # Restart agent
        Write-Log "Agent not running. Restarting..."
        Start-Sleep -Seconds $RestartDelay

        try {
            $childProcess = Start-Process -FilePath $NodePath `
                -ArgumentList $agentScript `
                -WorkingDirectory $AgentDir `
                -PassThru `
                -WindowStyle Hidden

            if ($childProcess) {
                $now = Get-Date
                $restartHistory.Add($now)
                Write-Log "Agent restarted. New PID: $($childProcess.Id) (restart #$($restartHistory.Count) this hour)"
            } else {
                Write-Log "Failed to start agent process"
            }
        } catch {
            Write-Log "Restart error: $($_.Exception.Message)"
        }
    }
}
