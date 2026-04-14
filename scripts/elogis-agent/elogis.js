/**
 * elogis.js
 * Playwright 로 elogis 에 로그인한 뒤 각 파일을 다운로드합니다.
 *
 * 흐름:
 *   1. 로그인 (chromium headless)
 *   2. 각 파일 페이지로 이동 → USER_SESSION_ID 추출
 *   3. browser 컨텍스트 안에서 3단계 API 호출
 *      ① saveUserTempData  (GET)
 *      ② commonExcelDownPrepare (POST)
 *      ③ commonExcelDown   (GET) → ArrayBuffer 반환
 */

const { chromium } = require("playwright");

const BASE_URL = "https://elogis.emart24.co.kr";
const LOGIN_URL = `${BASE_URL}/`;

/**
 * elogis 로그인 후 browser/page 반환
 */
async function createSession(id, pw, log) {
  log("브라우저 시작...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  log("elogis 로그인 페이지 접속...");
  await page.goto(LOGIN_URL, { waitUntil: "networkidle", timeout: 30_000 });

  // ── 아이디/패스워드 입력 ───────────────────────────────────────────────
  // 선택자가 다를 경우 아래 두 줄을 수정하세요.
  await page.fill('input[name="USER_ID"], input[id="userId"], input[type="text"]', id);
  await page.fill('input[name="USER_PW"], input[id="userPw"], input[type="password"]', pw);

  log("로그인 시도...");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle", timeout: 30_000 }).catch(() => {}),
    page.click('button[type="submit"], input[type="submit"], .btn-login, #loginBtn').catch(async () => {
      // 버튼 클릭 실패 시 Enter 키
      await page.keyboard.press("Enter");
    }),
  ]);

  // 로그인 성공 확인 (URL 변경 또는 특정 요소 존재)
  const currentUrl = page.url();
  if (currentUrl.includes("/login") || currentUrl === LOGIN_URL) {
    throw new Error("로그인 실패: 아이디/패스워드를 확인하세요.");
  }
  log("로그인 성공");

  return { browser, context, page };
}

/**
 * 특정 파일 설정에 맞게 elogis 에서 Excel 파일을 다운로드
 * @returns {Promise<Buffer>}
 */
async function downloadFile(page, fileConfig, log) {
  const { label, pageUrl, prepareParams } = fileConfig;

  if (pageUrl === "TODO") {
    throw new Error(`${label}: pageUrl 이 설정되지 않았습니다. config.js 를 수정하세요.`);
  }

  log(`${label}: 페이지 이동 중...`);
  await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 60_000 });

  // ── USER_SESSION_ID 추출 ───────────────────────────────────────────────
  // elogis 는 세션 ID 를 JS 전역 변수에 노출합니다.
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
    throw new Error(`${label}: USER_SESSION_ID 를 추출할 수 없습니다. 페이지 구조를 확인하세요.`);
  }

  log(`${label}: 엑셀 데이터 준비 중...`);

  // ── 브라우저 컨텍스트 안에서 3단계 API 호출 ───────────────────────────
  const fileBytes = await page.evaluate(
    async ({ sessionId, prepareParams }) => {
      const BASE = "https://elogis.emart24.co.kr";

      // ① saveUserTempData (GET)
      const saveParams = new URLSearchParams({
        ...prepareParams,
        USER_SESSION_ID: sessionId,
      });
      await fetch(`${BASE}/utilService/saveUserTempData?${saveParams.toString()}`);

      // ② commonExcelDownPrepare (POST form)
      const fd = new FormData();
      fd.append("USER_SESSION_ID", sessionId);
      for (const [k, v] of Object.entries(prepareParams)) {
        fd.append(k, v);
      }
      await fetch(`${BASE}/utilService/commonExcelDownPrepare`, {
        method: "POST",
        body: fd,
      });

      // ③ commonExcelDown (GET) → binary
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

module.exports = { createSession, downloadFile };
