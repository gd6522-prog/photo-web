param(
  [int]$IntervalMinutes = 1,
  [string]$TaskName = "StoreMaster_SyncAgent"
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$agentScript = Join-Path $scriptDir "sync-agent.mjs"
$logDir = Join-Path $projectRoot ".automation\logs"
$logFile = Join-Path $logDir "agent.log"

if (-not (Test-Path $agentScript)) {
  Write-Error "sync-agent.mjs not found: $agentScript"
  exit 1
}

$nodeCheck = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCheck -eq $null) {
  Write-Error "node not found. Please install Node.js."
  exit 1
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

# PowerShell -WindowStyle Hidden 으로 실행해서 창 안 뜨게
$psArg = "-WindowStyle Hidden -NonInteractive -Command `"node '$agentScript' *>> '$logFile'`""

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $psArg -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -Once -At (Get-Date)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force

Write-Host "Done. Task '$TaskName' runs every $IntervalMinutes min (hidden)."
Write-Host "Log: $logFile"
Write-Host ""
Write-Host "Test now: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Delete:   Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
