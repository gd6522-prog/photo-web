@echo off
chcp 65001 > nul
title elogis 에이전트

cd /d "%~dp0"

:: .env 파일 없으면 안내
if not exist ".env" (
  echo [오류] .env 파일이 없습니다. .env.example 을 복사하고 값을 채워주세요.
  pause
  exit /b 1
)

:: node_modules 없으면 install
if not exist "node_modules" (
  echo [설치] npm install 실행 중...
  npm install
  echo [설치] playwright 브라우저 설치 중...
  npx playwright install chromium
)

echo [시작] elogis 에이전트 실행 중...
node agent.js

pause
