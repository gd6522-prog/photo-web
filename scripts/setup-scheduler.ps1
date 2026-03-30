# 점포마스터 자동 동기화 - Windows 작업 스케줄러 등록
# 관리자 권한으로 실행하세요: 마우스 우클릭 > "PowerShell로 실행"

param(
  [string]$Time = "06:00",
  [string]$TaskName = "점포마스터_자동동기화"
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$batPath = Join-Path $scriptDir "run-sync.bat"
$projectRoot = Split-Path -Parent $scriptDir

if (-not (Test-Path $batPath)) {
  Write-Error "run-sync.bat 파일을 찾지 못했습니다: $batPath"
  exit 1
}

$action = New-ScheduledTaskAction `
  -Execute "cmd.exe" `
  -Argument "/c `"$batPath`" >> `"$projectRoot\.automation\logs\scheduler.log`" 2>&1" `
  -WorkingDirectory $projectRoot

$trigger = New-ScheduledTaskTrigger -Daily -At $Time

$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
  -StartWhenAvailable $true `
  -WakeToRun $false

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
Write-Host " 실행 시간 : 매일 $Time"
Write-Host " 실행 파일 : $batPath"
Write-Host "====================================="
Write-Host ""
Write-Host "실행 시간 변경 방법:"
Write-Host "  .\setup-scheduler.ps1 -Time '07:30'"
Write-Host ""
Write-Host "즉시 테스트 실행:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
