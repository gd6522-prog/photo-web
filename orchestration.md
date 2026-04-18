# han-admin 프로젝트 오케스트레이션 규칙

## ⚠️ 최우선 규칙 — 코드 수정 시 자동 GitHub Push

**코드를 수정한 뒤에는 반드시 아래 절차를 자동으로 실행한다. 사용자가 따로 요청하지 않아도 된다.**

```bash
git add <변경된 파일들>
git commit -m "feat/fix/chore: 변경 내용 요약 (한국어)"
git push
```

### 규칙 상세
- 민감 정보 파일(`.env`, `.env.local`)은 절대 커밋하지 않는다
- 임시 디버그 파일(`debug_*.png`, `console.log(...)` 등)은 커밋하지 않는다
- 커밋 메시지는 한국어로, 변경 의도가 명확히 드러나게 작성한다
- 충돌(conflict) 발생 시 해결 후 push한다

---

## 프로젝트 아키텍처

- **프레임워크**: Next.js (App Router) + TypeScript
- **스타일**: Tailwind CSS
- **DB**: Supabase (PostgreSQL)
- **파일 스토리지**: Cloudflare R2
- **배포**: Vercel
- **자동화 에이전트**: `scripts/elogis-agent/` (Node.js + Playwright, PM2 관리)

## 자동화 에이전트 규칙

- 슬롯 스케줄은 서버(R2)에서 직접 읽어 실행한다 (`INTERNAL_API_SECRET` 사용)
- 에이전트 수정 후 `pm2 restart elogis-agent --update-env` 실행
- 고정 cron(오전 6시 등) 사용 금지 — 슬롯별 스케줄로만 동작
