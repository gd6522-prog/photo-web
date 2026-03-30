# 점포마스터 동기화 에이전트 - Windows 작업 스케줄러 등록
# 관리자 권한으로 실행하세요: 마우스 우클릭 > "PowerShell로 실행"
#
# 동작:
#   - 5분마다 sync-agent.mjs를 실행
#   - 에이전트가 Supabase를 폴링하여 pending 요청이 있으면 elogis에서 자동 동기화
#   - 웹 UI 또는 작업 스케줄러에서 요청을 발생시킬 수 있음

param(
  [int]$IntervalMinutes = 5,
  [string]$TaskName = "점포마스터_동기화에이전트"
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$agentScript = Join-Path $scriptDir "sync-agent.mjs"
$logDir = Join-Path $projectRoot ".automation\logs"

if (-not (Test-Path $agentScript)) {
  Write-Error "sync-agent.mjs 파일을 찾지 못했습니다: $agentScript"
  exit 1
}

# 로그 디렉토리 생성
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$nodeCmd = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $nodeCmd) {
  Write-Error "node 명령을 찾지 못했습니다. Node.js가 설치되어 있는지 확인하세요."
  exit 1
}

$logFile = Join-Path $logDir "agent.log"
$argument = "/c `"cd /d `"$projectRoot`" && node `"$agentScript`" >> `"$logFile`" 2>&1`""

$action = New-ScheduledTaskAction `
  -Execute "cmd.exe" `
  -Argument $argument `
  -WorkingDirectory $projectRoot

# 5분마다 반복 트리거
$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -Once -At (Get-Date)

$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Minutes ($IntervalMinutes - 1)) `
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
