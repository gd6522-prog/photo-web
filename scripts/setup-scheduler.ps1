param(
  [int]$IntervalMinutes = 1,
  [string]$TaskName = "StoreMaster_SyncAgent"
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$runnerScript = Join-Path $scriptDir "run-agent-hidden.ps1"

if (-not (Test-Path $runnerScript)) {
  Write-Error "run-agent-hidden.ps1 not found: $runnerScript"
  exit 1
}

$nodeCheck = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCheck -eq $null) {
  Write-Error "node not found. Please install Node.js."
  exit 1
}

$psArg = "-WindowStyle Hidden -NonInteractive -File `"$runnerScript`""

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $psArg -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -Once -At (Get-Date)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force

Write-Host "Done. Task '$TaskName' runs every $IntervalMinutes min (hidden)."
Write-Host ""
Write-Host "Test now: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Delete:   Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
