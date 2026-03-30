# 점포마스터 동기화 에이전트 - Windows 작업 스케줄러 등록
# 관리자 권한으로 실행하세요: 마우스 우클릭 > "PowerShell로 실행"

param(
  [int]$IntervalMinutes = 1,
  [string]$TaskName = "점포마스터_동기화에이전트"
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$agentScript = Join-Path $scriptDir "sync-agent.mjs"
$logDir = Join-Path $projectRoot ".automation\logs"
$logFile = Join-Path $logDir "agent.log"

if (-not (Test-Path $agentScript)) {
  Write-Error "sync-agent.mjs 파일을 찾지 못했습니다: $agentScript"
  exit 1
}

$nodeCheck = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCheck -eq $null) {
  Write-Error "node 명령을 찾지 못했습니다. Node.js가 설치되어 있는지 확인하세요."
  exit 1
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$argument = "/c node `"$agentScript`" >> `"$logFile`" 2>&1"

$action = New-ScheduledTaskAction `
  -Execute "cmd.exe" `
  -Argument $argument `
  -WorkingDirectory $projectRoot

$trigger = New-ScheduledTaskTrigger `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
  -Once `
  -At (Get-Date)

$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Minutes ($IntervalMinutes + 1)) `
  -StartWhenAvailable $true `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -RunLevel Highest `
  -Force

Write-Host ""
Write-Host "====================================="
Write-Host " 작업 스케줄러 등록 완료"
Write-Host "====================================="
Write-Host " 작업 이름 : $TaskName"
Write-Host " 실행 주기 : $IntervalMinutes 분마다"
Write-Host " 로그 파일 : $logFile"
Write-Host "====================================="
Write-Host ""
Write-Host "즉시 테스트 실행:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "작업 삭제:"
Write-Host "  Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
Write-Host ""
