/**
 * elogis.js
 * Playwright 로 elogis/etms 에서 파일을 다운로드합니다.
 *
 * WMS 파일 (재고현황 등):
 *   로그인 → 페이지 이동 → 3단계 API 호출
 *   ① saveUserTempData (GET)
 *   ② commonExcelDownPrepare (POST)
 *   ③ commonExcelDown (GET) → Buffer
 *
 * TMS 파일 (점포마스터):
 *   elogis 로그인 → "TMS 시스템 로그인" 클릭 → etms 새창
 *   → 계획관리 > 노선-점포매핑 → 배송그룹 입력 → 조회 → 엑셀다운로드
 */

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE_URL = "https://elogis.emart24.co.kr";
const LOGIN_URL = `${BASE_URL}/`;

// ── elogis 로그인 ────────────────────────────────────────────────────────────

async function createSession(id, pw, log) {
  log("브라우저 시작...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  log("elogis 로그인 페이지 접속...");
  await page.goto(LOGIN_URL, { waitUntil: "networkidle", timeout: 30_000 });

  await page.fill('input[name="USER_ID"], input[id="userId"], input[type="text"]', id);
  await page.fill('input[name="USER_PW"], input[id="userPw"], input[type="password"]', pw);

  log("로그인 시도...");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle", timeout: 30_000 }).catch(() => {}),
    page.click('button[type="submit"], input[type="submit"], .btn-login, #loginBtn').catch(async () => {
      await page.keyboard.press("Enter");
    }),
  ]);

  const currentUrl = page.url();
  if (currentUrl.includes("/login") || currentUrl === LOGIN_URL) {
    throw new Error("로그인 실패: 아이디/패스워드를 확인하세요.");
  }
  log("로그인 성공");

  return { browser, context, page };
}

// ── WMS 파일 다운로드 (3단계 API) ────────────────────────────────────────────

async function downloadWmsFile(page, fileConfig, log) {
  const { label, pageUrl, prepareParams } = fileConfig;

  if (pageUrl === "TODO") {
    throw new Error(`${label}: pageUrl 이 설정되지 않았습니다. config.js 를 수정하세요.`);
  }

  log(`${label}: 페이지 이동 중...`);
  await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 60_000 });

  const sessionId = await page.evaluate(() => {
    return (
      window.USER_SESSION_ID ||
      window.userSessionId ||
      window.g_userSessionId ||
      window.SESSION_ID ||
      null
    );
  });

  if (!sessionId) {
    throw new Error(`${label}: USER_SESSION_ID 를 추출할 수 없습니다.`);
  }

  log(`${label}: 엑셀 데이터 준비 중...`);

  const fileBytes = await page.evaluate(
    async ({ sessionId, prepareParams }) => {
      const BASE = "https://elogis.emart24.co.kr";

      const saveParams = new URLSearchParams({ ...prepareParams, USER_SESSION_ID: sessionId });
      await fetch(`${BASE}/utilService/saveUserTempData?${saveParams.toString()}`);

      const fd = new FormData();
      fd.append("USER_SESSION_ID", sessionId);
      for (const [k, v] of Object.entries(prepareParams)) fd.append(k, v);
      await fetch(`${BASE}/utilService/commonExcelDownPrepare`, { method: "POST", body: fd });

      const res = await fetch(`${BASE}/utilService/commonExcelDown`);
      if (!res.ok) throw new Error(`commonExcelDown 실패: HTTP ${res.status}`);
      const ab = await res.arrayBuffer();
      return Array.from(new Uint8Array(ab));
    },
    { sessionId, prepareParams }
  );

  log(`${label}: 다운로드 완료 (${Math.round(fileBytes.length / 1024)} KB)`);
  return Buffer.from(fileBytes);
}

// ── TMS 점포마스터 다운로드 (클릭 자동화) ────────────────────────────────────

async function downloadTmsFile(mainPage, context, fileConfig, log) {
  const { label, tmsConfig } = fileConfig;
  const 배송그룹 = tmsConfig?.배송그룹 ?? "D9012343";

  log(`${label}: TMS 새창 열기...`);

  // "TMS 시스템 로그인" 클릭 → 새 탭 열림
  const [tmsPage] = await Promise.all([
    context.waitForEvent("page", { timeout: 15_000 }),
    mainPage.click("text=TMS 시스템 로그인"),
  ]);
  await tmsPage.waitForLoadState("networkidle", { timeout: 30_000 });
  log(`${label}: etms 접속 완료 (${tmsPage.url()})`);

  // ── 메뉴 이동: 계획관리 > 노선-점포(배송처)매핑 ──────────────────────
  log(`${label}: 계획관리 메뉴 클릭...`);
  await tmsPage.click("text=계획관리");
  await tmsPage.waitForTimeout(800);

  log(`${label}: 노선-점포(배송처)매핑 클릭...`);
  await tmsPage.click("text=노선-점포(배송처)매핑");
  await tmsPage.waitForLoadState("networkidle", { timeout: 30_000 });

  // ── 배송그룹 입력 ─────────────────────────────────────────────────────
  log(`${label}: 배송그룹 입력 (${배송그룹})...`);
  // 배송그룹 옆 입력칸 - 여러 선택자 시도
  const groupInput = tmsPage.locator(
    'input[placeholder*="배송그룹"], input[name*="grpCd"], input[name*="groupCd"], input[id*="grpCd"]'
  ).first();
  await groupInput.fill(배송그룹);

  // ── 조회 버튼 클릭 ────────────────────────────────────────────────────
  log(`${label}: 조회 클릭...`);
  await tmsPage.click('button:has-text("조회"), input[value="조회"]');
  await tmsPage.waitForLoadState("networkidle", { timeout: 30_000 });
  await tmsPage.waitForTimeout(1_500); // 그리드 렌더링 대기

  // ── 삼선(≡) 버튼 클릭 ────────────────────────────────────────────────
  log(`${label}: 그리드 메뉴 버튼(≡) 클릭...`);
  // 그리드 우측 상단 메뉴 버튼 (다양한 UI 라이브러리에 따라 선택자 다를 수 있음)
  await tmsPage.click(
    '.grid-menu, button[title*="메뉴"], button[title*="menu"], ' +
    '.btnGridMenu, .ag-side-button, [class*="gridMenu"], ' +
    'button:has-text("≡"), button:has-text("☰")'
  );
  await tmsPage.waitForTimeout(500);

  // ── 엑셀다운로드 클릭 & 파일 수신 ────────────────────────────────────
  log(`${label}: 엑셀다운로드 클릭...`);
  const downloadPromise = tmsPage.waitForEvent("download", { timeout: 60_000 });
  await tmsPage.click('text=엑셀다운로드, text=엑셀 다운로드, text=Excel다운로드');
  const download = await downloadPromise;

  // 임시 파일로 저장 후 Buffer 로 읽기
  const tmpPath = path.join(__dirname, `_tmp_${Date.now()}.xlsx`);
  await download.saveAs(tmpPath);
  const buffer = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);

  await tmsPage.close();

  log(`${label}: 다운로드 완료 (${Math.round(buffer.length / 1024)} KB)`);
  return buffer;
}

// ── 통합 다운로드 함수 (agent.js 에서 호출) ──────────────────────────────────

async function downloadFile(page, context, fileConfig, log) {
  if (fileConfig.tmsDownload) {
    return downloadTmsFile(page, context, fileConfig, log);
  }
  return downloadWmsFile(page, fileConfig, log);
}

module.exports = { createSession, downloadFile };
