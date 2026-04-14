/**
 * elogis.js
 * Playwright 로 elogis/etms 에서 파일을 다운로드합니다.
 *
 * 파일 유형별 흐름:
 *   WMS/MDM (메뉴+조회) : 로그인 → 메뉴 클릭 → 검색입력 → 조회(evaluate) → 엑셀(evaluate) → download 이벤트 캡처
 *   TMS (점포마스터)    : 로그인 → TMS새창 → 메뉴 클릭 → 입력+조회 → 엑셀다운로드 → download 이벤트 캡처
 */

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE_URL = "https://elogis.emart24.co.kr";
const LOGIN_URL = `${BASE_URL}/`;

// ── elogis 로그인 ─────────────────────────────────────────────────────────────

async function createSession(id, pw, log) {
  log("브라우저 시작...");
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const context = await browser.newContext();
  const page = await context.newPage();

  log("elogis 로그인 페이지 접속...");
  await page.goto(LOGIN_URL, { waitUntil: "networkidle", timeout: 30_000 });

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
    await el.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    await el.click({ timeout: 5_000 }).catch(async () => {
      await el.click({ force: true, timeout: 5_000 }).catch(() => {});
    });
    await page.waitForTimeout(1_200);
  }
  await page.waitForTimeout(3_000);
}

// ── iframe 포함 모든 대상 프레임 반환 ─────────────────────────────────────────
// URL 필터 없이 모든 iframe 우선, 마지막에 메인 프레임
// (MDM 등 URL이 about:blank 이거나 page.url()과 동일한 경우에도 탐색 가능)
function getElogisFrames(page) {
  const mainFrame = page.mainFrame();
  const iframes = page.frames().filter((f) => f !== mainFrame);
  return [...iframes, page];
}

// ── frame.evaluate 로 버튼 텍스트 매칭 클릭 ──────────────────────────────────

async function evaluateClickByText(frame, texts) {
  return frame.evaluate((texts) => {
    const normalize = (s) => (s || "").replace(/\s+/g, "").trim();
    // x-btn-inner span (ExtJS 버튼)
    for (const span of document.querySelectorAll(".x-btn-inner")) {
      if (texts.some((t) => normalize(span.textContent) === normalize(t))) {
        const btn = span.closest('a[role="button"], button');
        if (btn) { btn.click(); return true; }
      }
    }
    // 일반 버튼/링크
    for (const el of document.querySelectorAll('a[role="button"], button, input[type="button"], input[type="submit"]')) {
      const text = el.value !== undefined && el.value !== "" ? el.value : el.textContent;
      if (texts.some((t) => normalize(text) === normalize(t))) {
        el.click();
        return true;
      }
    }
    return false;
  }, texts).catch(() => false);
}

// ── 조회 버튼 클릭 (evaluate → 실제 ExtJS 이벤트 발생, 최대 4회 재시도) ──────

async function clickSearchButton(page, log, label) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      log(`${label}: 조회 버튼 재시도 (${attempt + 1}/4) — iframe 로드 대기...`);
      await page.waitForTimeout(3_000);
    }
    const targets = getElogisFrames(page);
    for (const target of targets) {
      const clicked = await evaluateClickByText(target, ["조회"]);
      if (clicked) {
        log(`${label}: 조회 클릭 완료`);
        return true;
      }
    }
  }
  // 모든 시도 실패 → 프레임 URL 디버그 출력 + 스크린샷
  const frameUrls = page.frames().map((f) => f.url()).join(", ");
  log(`[경고] ${label}: 조회 버튼을 찾지 못했습니다. (프레임 수: ${page.frames().length})`);
  log(`[DEBUG] 프레임 URL: ${frameUrls}`);
  await page.screenshot({ path: path.join(__dirname, `debug_${label}.png`) }).catch(() => {});
  return false;
}

// ── 엑셀 버튼 클릭 + 다운로드 캡처 ──────────────────────────────────────────

async function clickExcelAndDownload(page, log, label) {
  const targets = getElogisFrames(page);

  // 다운로드 이벤트 대기 먼저 등록 (대용량 파일 생성 시간 고려해 120초)
  const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });

  // 엑셀 버튼 클릭
  let excelClicked = false;
  for (const target of targets) {
    const clicked = await evaluateClickByText(target, ["엑셀", "Excel", "EXCEL", "엑셀다운로드", "엑셀 다운로드"]);
    if (clicked) {
      log(`${label}: 엑셀 버튼 클릭`);
      excelClicked = true;
      break;
    }
  }

  if (!excelClicked) {
    // 폴백: locator 로 시도
    for (const target of targets) {
      const btn = target.locator('text="엑셀"').first();
      if (await btn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await btn.click().catch(() => btn.click({ force: true }).catch(() => {}));
        log(`${label}: 엑셀 버튼 클릭 (locator fallback)`);
        excelClicked = true;
        break;
      }
    }
  }

  if (!excelClicked) {
    log(`[경고] ${label}: 엑셀 버튼을 찾지 못했습니다.`);
    await page.screenshot({ path: path.join(__dirname, `debug_${label}.png`) }).catch(() => {});
  }

  // 드롭다운 메뉴가 나타난 경우 처리 (짧게 대기 후 확인)
  await page.waitForTimeout(800);
  for (const target of targets) {
    const dropdownClicked = await target.evaluate(() => {
      // ExtJS 메뉴 아이템
      for (const el of document.querySelectorAll(".x-menu-item-text, .x-menu-item")) {
        const text = (el.textContent || "").replace(/\s+/g, "").trim();
        if (text.includes("엑셀") || text.includes("Excel") || text.includes("다운")) {
          el.click();
          return true;
        }
      }
      return false;
    }).catch(() => false);
    if (dropdownClicked) {
      log(`${label}: 드롭다운 메뉴 클릭`);
      break;
    }
  }

  const download = await downloadPromise;
  const tmpPath = path.join(__dirname, `_tmp_${Date.now()}.xlsx`);
  await download.saveAs(tmpPath);
  const buffer = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);

  if (buffer.length < 200) {
    throw new Error(`다운로드 파일이 비어 있습니다 (${buffer.length} bytes).`);
  }
  return buffer;
}

// ── 검색 입력 필드 채우기 ─────────────────────────────────────────────────────

async function fillSearchInputs(page, searchInputs, log) {
  const targets = getElogisFrames(page);

  for (const input of searchInputs) {
    log(`검색 입력: ${input.label} = ${input.value}`);
    let filled = false;

    // selector 가 명시된 경우 우선 사용
    if (input.selector) {
      for (const target of targets) {
        const el = target.locator(input.selector).first();
        if (await el.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await el.fill(input.value);
          filled = true;
          break;
        }
      }
    }

    // XPath 로 라벨 인근 input 탐색
    if (!filled) {
      const xpaths = [
        `//label[contains(text(),"${input.label}")]/following::input[1]`,
        `//td[contains(text(),"${input.label}")]/following::input[1]`,
        `//th[contains(text(),"${input.label}")]/following::input[1]`,
        `//span[contains(text(),"${input.label}")]/following::input[1]`,
      ];
      for (const target of targets) {
        for (const xpath of xpaths) {
          const el = target.locator(`xpath=${xpath}`).first();
          if (await el.isVisible({ timeout: 1_500 }).catch(() => false)) {
            await el.fill(input.value);
            filled = true;
            break;
          }
        }
        if (filled) break;
      }
    }

    if (!filled) {
      log(`[경고] "${input.label}" 입력칸을 찾지 못했습니다.`);
    }
  }
}

// ── WMS/MDM 파일 다운로드 ─────────────────────────────────────────────────────

async function downloadWmsFile(page, context, fileConfig, log) {
  const { label, menuPath, searchInputs } = fileConfig;

  log(`${label}: elogis 메인 이동...`);
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2_000);

  // 메뉴 네비게이션 (navigateViaMenu 내부에 3초 대기 포함)
  if (menuPath && menuPath.length > 0) {
    await navigateViaMenu(page, menuPath, log);
  }

  // 검색 입력이 있는 경우: 값만 입력 (조회 클릭 불필요)
  if (searchInputs && searchInputs.length > 0) {
    await fillSearchInputs(page, searchInputs, log);
  }

  log(`${label}: 엑셀 다운로드 시작...`);
  const buffer = await clickExcelAndDownload(page, log, label);
  log(`${label}: 다운로드 완료 (${Math.round(buffer.length / 1024)} KB)`);
  return buffer;
}

// ── TMS 점포마스터 다운로드 ───────────────────────────────────────────────────

async function downloadTmsFile(mainPage, context, fileConfig, log) {
  const { label, tmsConfig } = fileConfig;
  const 배송그룹 = tmsConfig?.배송그룹 ?? "D9012343";

  log(`${label}: 차량관리(TMS) 메뉴 클릭...`);
  const tmsMenuEl = mainPage.locator('text="차량관리 (TMS)"').first();
  await tmsMenuEl.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  await tmsMenuEl.click({ force: true });
  await mainPage.waitForTimeout(1_500);

  log(`${label}: TMS 시스템 로그인 클릭 → 새창 대기...`);
  const tmsLoginEl = mainPage.locator('text="TMS 시스템 로그인"').first();
  await tmsLoginEl.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  const [tmsPage] = await Promise.all([
    context.waitForEvent("page", { timeout: 60_000 }),
    tmsLoginEl.click({ force: true }),
  ]);
  await tmsPage.waitForLoadState("domcontentloaded", { timeout: 60_000 });
  log(`${label}: etms 접속 완료`);

  log(`${label}: 계획관리 메뉴 클릭...`);
  await tmsPage.click("text=계획관리");
  await tmsPage.waitForTimeout(800);

  log(`${label}: 노선-점포(배송처)매핑 클릭...`);
  await tmsPage.click("text=노선-점포(배송처)매핑");
  await tmsPage.waitForTimeout(2_000);

  log(`${label}: 배송그룹 입력 필드 대기 (최대 20초)...`);
  let groupInput = null;

  // TmsPmMastRouteStop 콘텐츠 프레임 로드 완료 대기 후 waitForSelector
  const contentFrame = tmsPage.frames().find((f) => f.url().includes("TmsPmMastRouteStop"));
  if (contentFrame) {
    try {
      await contentFrame.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => {});
      await contentFrame.waitForSelector('#deli_seq_cd, [name="deli_seq_cd"]', {
        state: "visible",
        timeout: 20_000,
      });
      groupInput = contentFrame.locator('#deli_seq_cd, [name="deli_seq_cd"]').first();
      log(`${label}: 배송그룹 필드 발견 (TmsPmMastRouteStop 프레임)`);
    } catch {
      log(`${label}: TmsPmMastRouteStop 프레임에서 waitForSelector 실패, 전체 프레임 탐색...`);
    }
  }

  // 2) 전체 프레임 순회 fallback
  if (!groupInput) {
    for (const target of [tmsPage, ...tmsPage.frames()]) {
      const el = target.locator('#deli_seq_cd, [name="deli_seq_cd"]').first();
      if (await el.isVisible({ timeout: 2_000 }).catch(() => false)) {
        groupInput = el;
        log(`${label}: 배송그룹 필드 발견 (프레임: ${target.url()})`);
        break;
      }
    }
  }

  if (!groupInput) {
    const frameUrls = tmsPage.frames().map((f) => f.url()).join("\n  ");
    log(`[DEBUG] TMS 프레임 URL 목록:\n  ${frameUrls}`);
    await tmsPage.screenshot({ path: path.join(__dirname, "debug_점포마스터.png") }).catch(() => {});
    throw new Error("배송그룹 입력 필드를 찾을 수 없습니다.");
  }
  log(`${label}: 배송그룹 입력 (${배송그룹})...`);
  await groupInput.fill(배송그룹);

  log(`${label}: 조회 클릭...`);
  // TMS는 iframe 내부이므로 evaluate 로 실제 클릭
  let srchClicked = false;
  for (const target of [tmsPage, ...tmsPage.frames()]) {
    const clicked = await evaluateClickByText(target, ["조회"]).catch(() => false);
    if (clicked) { srchClicked = true; break; }
  }
  if (!srchClicked) {
    // locator fallback
    for (const target of [tmsPage, ...tmsPage.frames()]) {
      const btn = target.locator('input[name="btn_search"], input[value="조회"], button:has-text("조회")').first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        await btn.click({ force: true });
        srchClicked = true;
        break;
      }
    }
  }
  if (!srchClicked) log(`[경고] ${label}: 조회 버튼을 찾지 못했습니다.`);
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
