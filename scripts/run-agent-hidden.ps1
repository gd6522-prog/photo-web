$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$agentScript = Join-Path $scriptDir "sync-agent.mjs"
$logDir = Join-Path $projectRoot ".automation\logs"
$logFile = Join-Path $logDir "agent.log"

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

node $agentScript *>> $logFile
