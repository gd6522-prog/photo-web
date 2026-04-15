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
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  log("elogis 로그인 페이지 접속...");
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });

  log("로그인 입력창 대기...");
  const idInput = page.locator('input[name="USERID"]').first();
  await idInput.waitFor({ state: "visible", timeout: 15_000 });
  await idInput.fill(id);

  const pwInput = page.locator('input[type="password"]').first();
  await pwInput.fill(pw);

  log("로그인 시도...");
  await pwInput.press("Enter");

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
    // 모든 프레임에서 텍스트 매칭 클릭 시도
    const allFrames = [page, ...page.frames()];
    let clicked = false;
    for (const f of allFrames) {
      // 1) ExtJS 탭 locator (frame 내에서)
      const tabEl = f.locator(".x-tab-inner").filter({ hasText: menuItem }).first();
      const tabCnt = await tabEl.count().catch(() => 0);
      if (tabCnt > 0) {
        log(`메뉴 탭 발견 (${f.url ? f.url().slice(-50) : "main"}): ${menuItem}`);
        // 부모 탭 요소 찾아서 클릭
        const parentTab = f.locator("[role='tab']").filter({ hasText: menuItem }).first();
        const parentCnt = await parentTab.count().catch(() => 0);
        if (parentCnt > 0) {
          await parentTab.click({ force: true }).catch(() => {});
        } else {
          await tabEl.click({ force: true }).catch(() => {});
        }
        await page.waitForTimeout(500);
        clicked = true;
        break;
      }
      // 2) 일반 텍스트 locator
      const el = f.locator(`text="${menuItem}"`).first();
      const elCnt = await el.count().catch(() => 0);
      if (elCnt > 0) {
        log(`메뉴 요소 발견 (${f.url ? f.url().slice(-50) : "main"}): ${menuItem}`);
        await el.click({ force: true, timeout: 5_000 }).catch(() => {});
        clicked = true;
        break;
      }
    }
    if (!clicked) log(`[경고] 메뉴 요소를 찾지 못했습니다: ${menuItem}`);
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

async function clickExcelAndDownload(page, context, log, label, prepareOverride) {
  const targets = getElogisFrames(page);

  // prepareOverride 가 있으면 commonExcelDownPrepare POST body 를 가로채서 수정
  if (prepareOverride && Object.keys(prepareOverride).length > 0) {
    await page.route("**/utilService/commonExcelDownPrepare", async (route) => {
      const req = route.request();
      const body = req.postData() || "";
      log(`[DEBUG] prepare 원본 SEARCH_URL: ${new URLSearchParams(body).get("SEARCH_URL")}`);
      const params = new URLSearchParams(body);
      for (const [key, val] of Object.entries(prepareOverride)) {
        params.set(key, val);
      }
      log(`[DEBUG] prepare 변경 SEARCH_URL: ${params.get("SEARCH_URL")}`);
      await route.continue({ postData: params.toString() });
    });
  }

  // 네트워크 요청 감시 — ExcelDownLoad/commonExcelDown 관련 URL 로깅
  const requestLog = [];
  const onRequest = (req) => {
    const url = req.url();
    if (url.includes("Excel") || url.includes("excel") || url.includes("Download") || url.includes("download")) {
      requestLog.push(`[REQ] ${req.method()} ${url}`);
    }
  };
  page.on("request", onRequest);

  // page + context 양쪽에서 download 이벤트 대기 (MDM은 새 탭으로 다운로드할 수 있음)
  const downloadPromise = Promise.race([
    page.waitForEvent("download", { timeout: 120_000 }),
    context.waitForEvent("page", { timeout: 120_000 }).then(async (newPage) => {
      const dl = await newPage.waitForEvent("download", { timeout: 60_000 });
      return dl;
    }),
  ]);

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
      const normalize = (s) => (s || "").replace(/\s+/g, "").trim();
      const items = document.querySelectorAll(".x-menu-item-text, .x-menu-item");
      // 1순위: "전체 데이터 다운로드" 정확히 일치
      for (const el of items) {
        if (normalize(el.textContent) === "전체데이터다운로드") {
          el.click();
          return true;
        }
      }
      // 2순위: 다운로드 관련 텍스트 포함 (엑셀/Excel 제외 — 엑셀 버튼 자신 재클릭 방지)
      for (const el of items) {
        const text = normalize(el.textContent);
        if (text.includes("다운로드") || text.includes("download")) {
          el.click();
          return true;
        }
      }
      return false;
    }).catch(() => false);
    if (dropdownClicked) {
      log(`${label}: 드롭다운 → 전체 데이터 다운로드 클릭`);
      break;
    }
  }

  const download = await downloadPromise;
  page.off("request", onRequest);
  if (prepareOverride && Object.keys(prepareOverride).length > 0) {
    await page.unroute("**/utilService/commonExcelDownPrepare").catch(() => {});
  }
  if (requestLog.length > 0) log(`[DEBUG] 다운로드 요청:\n  ${requestLog.join("\n  ")}`);
  else log(`[DEBUG] 다운로드 관련 요청 없음`);
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
    let filledTarget = null;

    // selector 가 명시된 경우 우선 사용
    if (input.selector) {
      for (const target of targets) {
        const el = target.locator(input.selector).first();
        if (await el.isVisible({ timeout: 2_000 }).catch(() => false)) {
          // condition 설정 시: = 버튼 클릭 → 비교조건 패널 → 원하는 조건 선택
          if (input.condition) {
            log(`검색 조건 변경: "${input.label}" → ${input.condition}`);
            // Playwright locator로 = 버튼 클릭 — span이 아닌 부모 a[role="button"] 직접 클릭
            const condBtn = target.locator('a[role="button"]:has(.icon-search-condition-equal)').first();
            const btnVisible = await condBtn.isVisible({ timeout: 2_000 }).catch(() => false);
            if (btnVisible) {
              await condBtn.click();
              await page.waitForTimeout(2_000);
              // 다이얼로그의 "포함" 버튼도 Playwright locator로 클릭
              // 조건별 아이콘 클래스 매핑
              const condIconMap = {
                "포함": "icon-search-condition-in",
                "완전 일치": "icon-search-condition-equal",
                "부분 일치": "icon-search-condition-like",
                "불일치": "icon-search-condition-not-equal",
              };
              const condIconClass = condIconMap[input.condition];
              let condClicked = false;
              for (const f of [target, page, ...page.frames()]) {
                if (condIconClass) {
                  const btn = f.locator(`a[role="button"]:has(.${condIconClass})`).first();
                  if (await btn.isVisible({ timeout: 1_000 }).catch(() => false)) {
                    await btn.click();
                    condClicked = true;
                    break;
                  }
                }
                condClicked = await evaluateClickByText(f, [input.condition]);
                if (condClicked) break;
              }
              if (condClicked) {
                log(`조건 "${input.condition}" 선택 완료`);
                await page.waitForTimeout(400);
              } else {
                log(`[경고] 조건 "${input.condition}" 버튼을 찾지 못했습니다.`);
              }
            } else {
              log(`[경고] "${input.label}" = 버튼(.icon-search-condition-equal)을 찾지 못했습니다.`);
            }
          }

          await el.fill(input.value);
          filled = true;
          filledTarget = target;
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

// ── API 직접 호출로 엑셀 다운로드 (prepareParams 활용) ───────────────────────

async function downloadViaApi(page, fileConfig, log) {
  const { label, prepareParams } = fileConfig;

  log(`${label}: API 직접 다운로드 (${prepareParams.SEARCH_URL})...`);

  // Step 1: POST commonExcelDownPrepare — page.request 는 브라우저 세션 쿠키 자동 포함
  const prepareRes = await page.request.post(
    `${BASE_URL}/utilService/commonExcelDownPrepare`,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      data: new URLSearchParams(prepareParams).toString(),
    }
  );
  log(`${label}: prepare 응답: ${prepareRes.status()}`);

  // Step 2: GET commonExcelDown
  const downloadRes = await page.request.get(`${BASE_URL}/utilService/commonExcelDown`);
  const buffer = await downloadRes.body();

  if (buffer.length < 200) {
    log(`[DEBUG] commonExcelDown 응답 (${buffer.length} bytes): ${buffer.toString("utf8").slice(0, 300)}`);
    throw new Error(`다운로드 파일이 비어 있습니다 (${buffer.length} bytes)`);
  }
  log(`${label}: API 다운로드 완료 (${Math.round(buffer.length / 1024)} KB)`);
  return buffer;
}

// ── WMS/MDM 파일 다운로드 ─────────────────────────────────────────────────────

async function downloadWmsFile(page, context, fileConfig, log) {
  const { label, menuPath, searchInputs, prepareOverride } = fileConfig;

  log(`${label}: elogis 메인 이동...`);
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2_000);

  // 메뉴 네비게이션 (navigateViaMenu 내부에 3초 대기 포함)
  if (menuPath && menuPath.length > 0) {
    await navigateViaMenu(page, menuPath, log);
    await page.waitForTimeout(1_000);
  }

  // 검색 입력이 있는 경우: 값만 입력 (조회 클릭 불필요)
  if (searchInputs && searchInputs.length > 0) {
    await fillSearchInputs(page, searchInputs, log);
  }

  // prepareParams가 있으면 UI 클릭 없이 API 직접 호출 (탭 데이터 오염 방지)
  if (fileConfig.prepareParams) {
    const buffer = await downloadViaApi(page, fileConfig, log);
    log(`${label}: 다운로드 완료 (${Math.round(buffer.length / 1024)} KB)`);
    return buffer;
  }

  log(`${label}: 엑셀 다운로드 시작...`);
  const buffer = await clickExcelAndDownload(page, context, log, label, prepareOverride);
  log(`${label}: 다운로드 완료 (${Math.round(buffer.length / 1024)} KB)`);
  return buffer;
}

// ── TMS 점포마스터 다운로드 ───────────────────────────────────────────────────

async function downloadTmsFile(mainPage, context, fileConfig, log) {
  const { label, tmsConfig } = fileConfig;
  const 배송그룹 = tmsConfig?.배송그룹 ?? "D9012343";

  log(`${label}: elogis 메인으로 이동...`);
  await mainPage.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await mainPage.waitForTimeout(2_000);

  log(`${label}: 차량관리(TMS) 메뉴 클릭...`);
  // 메뉴가 접혀있을 수 있으므로 먼저 JS evaluate로 탐색
  let tmsMenuClicked = await mainPage.evaluate(() => {
    const els = [...document.querySelectorAll("a, li, span, div")];
    const el = els.find((e) => e.textContent.trim() === "차량관리 (TMS)");
    if (el) { el.scrollIntoView(); el.click(); return true; }
    return false;
  }).catch(() => false);
  if (!tmsMenuClicked) {
    const tmsMenuEl = mainPage.locator('text="차량관리 (TMS)"').first();
    await tmsMenuEl.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    await tmsMenuEl.click({ force: true }).catch(() => {});
    tmsMenuClicked = true;
  }
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
  // 페이지 네트워크가 안정될 때까지 대기 (콘텐츠 프레임 완전 로드)
  await tmsPage.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await tmsPage.waitForTimeout(1_000);

  log(`${label}: 배송그룹 입력 필드 대기 (최대 30초)...`);
  let groupInput = null;

  // 입력 필드가 나타날 때까지 폴링 (최대 30초, 모든 프레임 순회)
  const inputDeadline = Date.now() + 30_000;
  while (Date.now() < inputDeadline && !groupInput) {
    for (const target of [tmsPage, ...tmsPage.frames()]) {
      const el = target.locator('#deli_seq_cd, [name="deli_seq_cd"]').first();
      if (await el.count().then(c => c > 0).catch(() => false)) {
        groupInput = el;
        log(`${label}: 배송그룹 필드 발견 (${target.url ? target.url().slice(-50) : "main"})`);
        break;
      }
    }
    if (!groupInput) await tmsPage.waitForTimeout(1_000);
  }

  if (!groupInput) {
    // 디버그: 모든 프레임 inputs 덤프
    for (const f of tmsPage.frames()) {
      const inputs = await f.evaluate(() =>
        [...document.querySelectorAll("input")].map(e => `id=${e.id} name=${e.name} type=${e.type}`).join(" | ")
      ).catch(() => "");
      if (inputs) log(`[DEBUG] 프레임(${f.url().slice(-40)}) inputs: ${inputs}`);
    }
    await tmsPage.screenshot({ path: path.join(__dirname, "debug_점포마스터.png") }).catch(() => {});
    throw new Error("배송그룹 입력 필드를 찾을 수 없습니다.");
  }
  log(`${label}: 배송그룹 입력 (${배송그룹})...`);
  await groupInput.fill(배송그룹);
  await groupInput.press("Enter");
  await tmsPage.waitForTimeout(1_000);

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
  let gridMenuClicked = false;
  // TmsPmMastRouteStop 프레임에서 직접 locator 클릭
  const tmsContentFrame = tmsPage.frames().find(f => f.url().includes("TmsPmMastRouteStop"));
  if (tmsContentFrame) {
    const gridBtn = tmsContentFrame.locator('#ibsheet01_grid_btn, .iw-mTrigger, .btn-sheet.btmenu').first();
    if (await gridBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await gridBtn.scrollIntoViewIfNeeded().catch(() => {});
      await gridBtn.click({ force: true });
      gridMenuClicked = true;
      log(`${label}: 그리드 메뉴 locator 클릭 성공 (TmsPmMastRouteStop 프레임)`);
    } else {
      // 안보여도 force 클릭
      await gridBtn.click({ force: true }).catch(() => {});
      gridMenuClicked = true;
      log(`${label}: 그리드 메뉴 force 클릭 시도`);
    }
  } else {
    // fallback: 모든 프레임 순회
    for (const f of tmsPage.frames()) {
      const btn = f.locator('#ibsheet01_grid_btn, .iw-mTrigger, .btn-sheet.btmenu').first();
      const cnt = await btn.count().catch(() => 0);
      if (cnt > 0) {
        await btn.click({ force: true }).catch(() => {});
        gridMenuClicked = true;
        log(`${label}: 그리드 메뉴 fallback 클릭 (${f.url()})`);
        break;
      }
    }
  }
  if (!gridMenuClicked) log(`[경고] ${label}: 그리드 메뉴 버튼을 찾지 못했습니다.`);
  await tmsPage.waitForTimeout(1_500);

  log(`${label}: 엑셀다운로드 클릭...`);
  const downloadPromise = tmsPage.waitForEvent("download", { timeout: 60_000 }).catch(() => null);
  let excelClicked = false;
  for (const f of [tmsPage, ...tmsPage.frames()]) {
    const clicked = await evaluateClickByText(f, ["엑셀다운로드", "엑셀 다운로드", "Excel"]).catch(() => false);
    if (clicked) { excelClicked = true; break; }
  }
  if (!excelClicked) {
    for (const f of [tmsPage, ...tmsPage.frames()]) {
      const btn = f.locator('text=/엑셀/').first();
      if (await btn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await btn.click({ force: true }).catch(() => {});
        excelClicked = true;
        break;
      }
    }
  }
  if (!excelClicked) log(`[경고] ${label}: 엑셀다운로드 버튼을 찾지 못했습니다.`);
  const download = await downloadPromise;
  if (!download) throw new Error("엑셀 다운로드 이벤트를 받지 못했습니다.");

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
