/**
 * elogis.js
 * Playwright 로 elogis/etms 에서 파일을 다운로드합니다.
 *
 * 파일 유형별 흐름:
 *   WMS (직접 URL)   : 로그인 → URL 이동 → 3단계 API
 *   WMS (메뉴+검색)  : 로그인 → 메뉴 클릭 → 검색입력+조회 → 3단계 API
 *   TMS (점포마스터) : 로그인 → TMS새창 → 메뉴 클릭 → 입력+조회 → 다운로드 인터셉트
 */

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE_URL = "https://elogis.emart24.co.kr";
const LOGIN_URL = `${BASE_URL}/`;

// ── elogis 로그인 ─────────────────────────────────────────────────────────────

async function createSession(id, pw, log) {
  log("브라우저 시작...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  log("elogis 로그인 페이지 접속...");
  await page.goto(LOGIN_URL, { waitUntil: "networkidle", timeout: 30_000 });

  // ExtJS 기반 로그인 폼 — readonly가 아닌 실제 입력 가능한 필드 대기
  log("로그인 입력창 대기...");
  const idInput = page.locator('input[name="USERID"]').first();
  await idInput.waitFor({ state: "visible", timeout: 15_000 });
  await idInput.fill(id);

  const pwInput = page.locator('input[type="password"]').first();
  await pwInput.fill(pw);

  log("로그인 시도...");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle", timeout: 30_000 }).catch(() => {}),
    page.locator(
      'button[type="submit"], input[type="submit"], ' +
      '.btn-login, #loginBtn, button:has-text("로그인")'
    ).first().click().catch(async () => {
      await page.keyboard.press("Enter");
    }),
  ]);

  // SPA 라서 URL 이 변하지 않음 → 로그인 폼 사라짐 여부로 판단
  try {
    await page.waitForSelector('input[name="USERID"]', { state: "hidden", timeout: 15_000 });
  } catch {
    throw new Error("로그인 실패: 아이디/패스워드를 확인하세요.");
  }
  log("로그인 성공");

  return { browser, context, page };
}

// ── 메뉴 클릭 네비게이션 ──────────────────────────────────────────────────────

async function navigateViaMenu(page, menuPath, log) {
  for (const menuItem of menuPath) {
    log(`메뉴 클릭: ${menuItem}`);
    const el = page.locator(`text="${menuItem}"`).first();
    // visible 해질 때까지 최대 5초 대기 후 클릭, 실패 시 force 클릭
    await el.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    await el.click({ timeout: 5_000 }).catch(async () => {
      await el.click({ force: true, timeout: 5_000 }).catch(() => {});
    });
    await page.waitForTimeout(1_200); // 하위 메뉴 펼쳐지는 시간 대기
  }
  await page.waitForTimeout(3_000);
}

// ── 검색 입력 + 조회 ──────────────────────────────────────────────────────────

async function performSearch(page, searchInputs, log) {
  for (const input of searchInputs) {
    log(`검색 입력: ${input.label} = ${input.value}`);

    // 라벨 텍스트 옆 input 을 XPath 로 찾기 (여러 패턴 시도)
    let filled = false;
    const xpaths = [
      `//label[contains(text(),"${input.label}")]/following::input[1]`,
      `//td[contains(text(),"${input.label}")]/following::input[1]`,
      `//th[contains(text(),"${input.label}")]/following::input[1]`,
      `//span[contains(text(),"${input.label}")]/following::input[1]`,
    ];
    for (const xpath of xpaths) {
      try {
        const el = page.locator(`xpath=${xpath}`).first();
        if (await el.isVisible({ timeout: 2_000 })) {
          await el.triple_click();
          await el.fill(input.value);
          filled = true;
          break;
        }
      } catch {}
    }

    // XPath 실패 시 placeholder 또는 name 으로 시도
    if (!filled && input.selector) {
      await page.fill(input.selector, input.value);
      filled = true;
    }

    if (!filled) {
      log(`[경고] "${input.label}" 입력칸을 찾지 못했습니다. selector 설정이 필요할 수 있습니다.`);
    }
  }

  log("조회 클릭...");
  let srchClicked = false;
  for (const target of [page, ...page.frames()]) {
    const btn = target.locator('text="조회"').first();
    if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
      await btn.click({ force: true }).catch(() => {});
      srchClicked = true;
      break;
    }
  }
  if (!srchClicked) log(`[경고] 조회 버튼을 찾지 못했습니다. (프레임 수: ${page.frames().length})`);
  await page.waitForTimeout(5_000); // 그리드 렌더링 대기
}

// ── WMS 3단계 API 다운로드 ────────────────────────────────────────────────────

async function callDownloadApi(page, context, prepareParams, log) {
  // 0. Playwright context.cookies() — elogis 도메인 쿠키만 탐색 (etms 쿠키 혼입 방지)
  let sessionId = null;
  const allCookies = await context.cookies("https://elogis.emart24.co.kr");
  for (const c of allCookies) {
    if (/session/i.test(c.name) && c.value) { sessionId = c.value; break; }
  }

  // 1. window 전역 변수 → UserInfo/User 객체 → sessionStorage → localStorage → document.cookie 순서로 탐색
  if (!sessionId) sessionId = await page.evaluate(() => {
    // 1. 직접 전역 변수
    const fromWindow =
      window.USER_SESSION_ID || window.userSessionId ||
      window.g_userSessionId || window.SESSION_ID ||
      window.SES_ID || window.sesId || window.sessionId;
    if (fromWindow) return String(fromWindow);

    // 2. UserInfo / User 객체 내부 탐색
    for (const objName of ["UserInfo", "User", "userInfo", "user", "LOGIN_INFO", "loginInfo"]) {
      const obj = window[objName];
      if (obj && typeof obj === "object") {
        // 세션 관련 키 탐색
        for (const key of Object.keys(obj)) {
          if (/session|ses_id|sesId/i.test(key) && obj[key]) return String(obj[key]);
        }
        // USER_SESSION_ID 키 직접 탐색
        if (obj.USER_SESSION_ID) return String(obj.USER_SESSION_ID);
        if (obj.userSessionId) return String(obj.userSessionId);
        if (obj.SESSION_ID) return String(obj.SESSION_ID);
      }
    }

    // 3. sessionStorage
    for (const key of Object.keys(sessionStorage)) {
      if (/session/i.test(key)) {
        const v = sessionStorage.getItem(key);
        if (v) return v;
      }
    }

    // 4. localStorage
    for (const key of Object.keys(localStorage)) {
      if (/session/i.test(key)) {
        const v = localStorage.getItem(key);
        if (v) return v;
      }
    }

    // 5. 쿠키
    for (const part of document.cookie.split(";")) {
      const [k, v] = part.trim().split("=");
      if (k && /session/i.test(k) && v) return decodeURIComponent(v);
    }
    return null;
  });

  // 못 찾은 경우 UserInfo 내용 전체를 로그에 출력
  if (!sessionId) {
    const debugInfo = await page.evaluate(() => ({
      cookies: document.cookie.split(";").map(c => c.trim().split("=")[0]).join(", "),
      sessionKeys: Object.keys(sessionStorage).join(", "),
      windowKeys: Object.keys(window).filter(k => /session|SES_|user/i.test(k)).join(", "),
      userInfo: (() => { try { return JSON.stringify(window.UserInfo || window.User || null); } catch { return "parse error"; } })(),
    }));
    log(`[DEBUG] cookies: ${debugInfo.cookies}`);
    log(`[DEBUG] sessionStorage keys: ${debugInfo.sessionKeys}`);
    log(`[DEBUG] window vars: ${debugInfo.windowKeys}`);
    log(`[DEBUG] UserInfo: ${debugInfo.userInfo?.substring(0, 300)}`);
    throw new Error("USER_SESSION_ID 를 추출할 수 없습니다.");
  }

  log("엑셀 데이터 준비 중...");
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

  return Buffer.from(fileBytes);
}

// ── WMS 파일 다운로드 ─────────────────────────────────────────────────────────

async function downloadWmsFile(page, context, fileConfig, log) {
  const { label, pageUrl, menuPath, searchInputs, prepareParams } = fileConfig;

  if (pageUrl === "TODO") throw new Error(`${label}: pageUrl 이 설정되지 않았습니다.`);

  log(`${label}: 페이지 이동...`);
  await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2_000);

  // 메뉴 네비게이션 (필요한 경우)
  if (menuPath && menuPath.length > 0) {
    await navigateViaMenu(page, menuPath, log);
  }

  // 검색 입력 + 조회
  if (searchInputs && searchInputs.length > 0) {
    await performSearch(page, searchInputs, log);
  } else {
    // elogis 탭 내용은 iframe 내에 렌더링될 수 있어서 모든 프레임 탐색
    log(`${label}: 조회 클릭...`);
    let searchClicked = false;
    for (const target of [page, ...page.frames()]) {
      const btn = target.locator('text="조회"').first();
      if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
        await btn.click({ force: true }).catch(() => {});
        searchClicked = true;
        log(`${label}: 조회 클릭 완료 (frame: ${target.url?.() ?? "main"})`);
        break;
      }
    }
    if (!searchClicked) {
      log(`[경고] ${label}: 조회 버튼을 찾지 못했습니다. (프레임 수: ${page.frames().length})`);
      // 디버깅용 스크린샷
      await page.screenshot({ path: require("path").join(__dirname, `debug_${label}.png`) }).catch(() => {});
    }
    await page.waitForTimeout(5_000);
  }

  const buffer = await callDownloadApi(page, context, prepareParams, log);
  log(`${label}: 다운로드 완료 (${Math.round(buffer.length / 1024)} KB)`);
  return buffer;
}

// ── TMS 점포마스터 다운로드 ───────────────────────────────────────────────────

async function downloadTmsFile(mainPage, context, fileConfig, log) {
  const { label, tmsConfig } = fileConfig;
  const 배송그룹 = tmsConfig?.배송그룹 ?? "D9012343";

  log(`${label}: 차량관리(TMS) 메뉴 클릭...`);
  await mainPage.click('text="차량관리 (TMS)"', { timeout: 10_000, force: true });
  await mainPage.waitForTimeout(800);

  log(`${label}: TMS 시스템 로그인 클릭 → 새창 대기...`);
  const [tmsPage] = await Promise.all([
    context.waitForEvent("page", { timeout: 30_000 }),
    mainPage.click('text="TMS 시스템 로그인"', { timeout: 10_000, force: true }),
  ]);
  await tmsPage.waitForLoadState("domcontentloaded", { timeout: 30_000 });
  log(`${label}: etms 접속 완료`);

  log(`${label}: 계획관리 메뉴 클릭...`);
  await tmsPage.click("text=계획관리");
  await tmsPage.waitForTimeout(800);

  log(`${label}: 노선-점포(배송처)매핑 클릭...`);
  await tmsPage.click("text=노선-점포(배송처)매핑");
  await tmsPage.waitForTimeout(3_000);

  log(`${label}: 배송그룹 입력 (${배송그룹})...`);
  // TMS 내부 iframe이 로드될 때까지 대기 후 탐색
  let groupInput = null;
  for (let attempt = 0; attempt < 3 && !groupInput; attempt++) {
    for (const target of [tmsPage, ...tmsPage.frames()]) {
      const el = target.locator('#deli_seq_cd, [name="deli_seq_cd"]').first();
      if (await el.isVisible({ timeout: 1_500 }).catch(() => false)) { groupInput = el; break; }
    }
    if (!groupInput) await tmsPage.waitForTimeout(2_000); // 재시도 전 대기
  }
  if (!groupInput) {
    const frameUrls = tmsPage.frames().map(f => f.url()).join(", ");
    log(`[DEBUG] TMS 프레임 URL 목록: ${frameUrls}`);
    await tmsPage.screenshot({ path: require("path").join(__dirname, "debug_tms.png") }).catch(() => {});
    throw new Error("배송그룹 입력 필드를 찾을 수 없습니다.");
  }
  await groupInput.fill(배송그룹);

  log(`${label}: 조회 클릭...`);
  // TMS는 iframe 내부이므로 프레임 포함 조회 버튼 탐색
  let clicked = false;
  for (const target of [tmsPage, ...tmsPage.frames()]) {
    const btn = target.locator('input[name="btn_search"], input[value="조회"], button:has-text("조회"), text="조회"').first();
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      await btn.click({ force: true });
      clicked = true;
      break;
    }
  }
  if (!clicked) log(`[경고] ${label}: 조회 버튼을 찾지 못했습니다.`);
  await tmsPage.waitForTimeout(5_000);

  log(`${label}: 그리드 메뉴(≡) 클릭...`);
  await tmsPage.click(
    '.grid-menu, button[title*="메뉴"], button[title*="menu"], ' +
    '.btnGridMenu, .ag-side-button, [class*="gridMenu"], ' +
    'button:has-text("≡"), button:has-text("☰")'
  );
  await tmsPage.waitForTimeout(500);

  log(`${label}: 엑셀다운로드 클릭...`);
  const downloadPromise = tmsPage.waitForEvent("download", { timeout: 60_000 });
  await tmsPage.click("text=엑셀다운로드");
  const download = await downloadPromise;

  const tmpPath = path.join(__dirname, `_tmp_${Date.now()}.xlsx`);
  await download.saveAs(tmpPath);
  const buffer = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);

  await tmsPage.close();
  log(`${label}: 다운로드 완료 (${Math.round(buffer.length / 1024)} KB)`);
  return buffer;
}

// ── 통합 다운로드 (agent.js 에서 호출) ───────────────────────────────────────

async function downloadFile(page, context, fileConfig, log) {
  if (fileConfig.tmsDownload) {
    return downloadTmsFile(page, context, fileConfig, log);
  }
  return downloadWmsFile(page, context, fileConfig, log);
}

module.exports = { createSession, downloadFile };
