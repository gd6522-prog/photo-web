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

async function createSession(id, pw, log, { headless = true, useSystemChrome = false } = {}) {
  log("브라우저 시작...");
  const launchOptions = {
    headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1920,1080",
      "--window-position=-32000,-32000",
      "--no-first-run",
      "--hide-scrollbars",
      "--mute-audio",
    ],
  };
  if (useSystemChrome) {
    launchOptions.executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  }
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, "languages", { get: () => ["ko-KR", "ko", "en-US", "en"] });
  });

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
        // ExtJS API로 탭 전환 후 해당 탭의 grid store 로드
        const tabActivated = await f.evaluate((text) => {
          try {
            if (typeof Ext === "undefined") return false;
            const normalize = (s) => (s || "").replace(/\s+/g, "").trim();
            const panels = Ext.ComponentQuery.query("tabpanel");
            for (const panel of panels) {
              const items = panel.items && panel.items.items;
              if (!items) continue;
              for (const tab of items) {
                const title = tab.title || tab.text || tab.card?.title || "";
                if (normalize(title) === normalize(text)) {
                  panel.setActiveItem(tab);
                  // 탭 전환 후 visible grid store 강제 로드
                  setTimeout(() => {
                    try {
                      Ext.ComponentQuery.query("gridpanel").forEach((g) => {
                        if (g.isVisible(true) && g.store) g.store.load();
                      });
                    } catch (_) {}
                  }, 800);
                  return true;
                }
              }
            }
          } catch (e) { return false; }
          return false;
        }, menuItem).catch(() => false);
        log(`메뉴 탭 ExtJS 전환: ${tabActivated ? "성공" : "실패 → locator fallback"}`);
        if (!tabActivated) {
          const parentTab = f.locator("[role='tab']").filter({ hasText: menuItem }).first();
          const targetEl = (await parentTab.count().catch(() => 0)) > 0 ? parentTab : tabEl;
          await targetEl.click({ force: true }).catch(() => {});
        }
        await page.waitForTimeout(800);
        // 탭 전환 후 ExtJS 조회 버튼 클릭 (해당 탭 데이터 로드)
        const searched = await f.evaluate(() => {
          try {
            if (typeof Ext === "undefined") return false;
            const btns = Ext.ComponentQuery.query("button");
            for (const btn of btns) {
              if (btn.isVisible(true) && (btn.text || "").replace(/\s+/g, "").includes("조회")) {
                if (typeof btn.handler === "function") {
                  btn.handler.call(btn.scope || btn, btn);
                } else {
                  btn.fireEvent("click", btn);
                }
                return true;
              }
            }
          } catch (_) {}
          return false;
        }).catch(() => false);
        log(`메뉴 탭 조회 클릭: ${searched ? "성공" : "실패"}`);
        await page.waitForTimeout(3_000); // 조회 결과 로드 대기
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

  // prepareOverride 가 있으면 commonExcelDownPrepare POST body 를 route.fetch 로 교체
  if (prepareOverride && Object.keys(prepareOverride).length > 0) {
    await page.route("**/utilService/commonExcelDownPrepare", async (route) => {
      const body = route.request().postData() || "";
      const params = new URLSearchParams(body);
      for (const [key, val] of Object.entries(prepareOverride)) {
        params.set(key, val);
      }
      log(`[DEBUG] prepare SEARCH_URL 교체 → ${params.get("SEARCH_URL")}`);
      const response = await route.fetch({ postData: params.toString() });
      await route.fulfill({ response });
    });
  }

  const onReqCapture = () => {};
  page.on("request", onReqCapture);

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
  page.off("request", onReqCapture);
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

// ── UI prepare 요청 intercept → 수정 후 page.request.post 로 재전송 ─────────
// prepareOverride 가 있을 때 사용.
// UI의 commonExcelDownPrepare body(세션토큰/SES 값 등)를 그대로 가져와 특정 파라미터만 교체.

async function downloadViaInterceptAndApi(page, fileConfig, log) {
  const { label, prepareOverride } = fileConfig;

  // Step 1: commonExcelDownPrepare 를 가로채 abort + body 캡처
  let capturedBody = null;
  await page.route("**/utilService/commonExcelDownPrepare", async (route) => {
    capturedBody = route.request().postData() || "";
    log(`[DEBUG] prepare body 캡처 (${capturedBody.length} chars)`);
    await route.abort();
  });

  // Step 2: ExtJS로 visible 엑셀 버튼 클릭 → 드롭다운 → 전체 데이터 다운로드
  const targets = getElogisFrames(page);
  let excelClicked = false;
  for (const target of targets) {
    excelClicked = await target.evaluate(() => {
      try {
        if (typeof Ext !== "undefined") {
          const btns = Ext.ComponentQuery.query("button");
          for (const btn of btns) {
            const text = (btn.text || "").replace(/\s+/g, "");
            if (btn.isVisible(true) && (text === "엑셀" || text === "Excel")) {
              btn.showMenu ? btn.showMenu() : btn.fireEvent("click", btn);
              return true;
            }
          }
        }
      } catch (_) {}
      // fallback: visible .x-btn-inner
      const normalize = (s) => (s || "").replace(/\s+/g, "").trim();
      for (const span of document.querySelectorAll(".x-btn-inner")) {
        if (normalize(span.textContent) === "엑셀" || normalize(span.textContent) === "Excel") {
          const btn = span.closest('a[role="button"], button');
          if (btn && btn.offsetParent !== null) { btn.click(); return true; }
        }
      }
      return false;
    }).catch(() => false);
    if (excelClicked) { log(`${label}: 엑셀 버튼 클릭 (intercept 모드)`); break; }
  }
  await page.waitForTimeout(800);
  // 드롭다운 → 전체 데이터 다운로드
  for (const target of targets) {
    const ok = await target.evaluate(() => {
      const normalize = (s) => (s || "").replace(/\s+/g, "").trim();
      for (const el of document.querySelectorAll(".x-menu-item-text, .x-menu-item")) {
        const t = normalize(el.textContent);
        if (t === "전체데이터다운로드" || t.includes("다운로드")) { el.click(); return true; }
      }
      return false;
    }).catch(() => false);
    if (ok) { log(`${label}: 드롭다운 클릭`); break; }
  }

  // Step 3: prepare body 캡처 대기 (최대 10초)
  const deadline = Date.now() + 10_000;
  while (!capturedBody && Date.now() < deadline) await page.waitForTimeout(300);
  await page.unroute("**/utilService/commonExcelDownPrepare").catch(() => {});
  if (!capturedBody) throw new Error("commonExcelDownPrepare body 캡처 실패");

  // Step 4: override 적용 (dynamicParams 함수가 있으면 호출하여 병합)
  const params = new URLSearchParams(capturedBody);
  const dynamicExtra = fileConfig.dynamicParams ? fileConfig.dynamicParams() : {};
  const merged = { ...prepareOverride, ...dynamicExtra };
  for (const [key, val] of Object.entries(merged)) params.set(key, val);
  log(`${label}: SEARCH_URL 교체 → ${params.get("SEARCH_URL")}`);

  // Step 5: 수정된 body 로 prepare 재전송
  const prepareRes = await page.request.post(
    `${BASE_URL}/utilService/commonExcelDownPrepare`,
    { headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" }, data: params.toString() }
  );
  log(`${label}: prepare 응답: ${prepareRes.status()}`);

  // Step 6: 다운로드
  const downloadRes = await page.request.get(`${BASE_URL}/utilService/commonExcelDown`);
  const buffer = await downloadRes.body();
  if (buffer.length < 200) {
    log(`[DEBUG] commonExcelDown 응답: ${buffer.toString("utf8").slice(0, 300)}`);
    throw new Error(`다운로드 파일이 비어 있습니다 (${buffer.length} bytes)`);
  }
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

  // prepareOverride가 있으면 UI prepare 요청을 가로채 수정 후 API 재전송
  if (prepareOverride && Object.keys(prepareOverride).length > 0) {
    log(`${label}: 엑셀 다운로드 시작 (intercept 모드)...`);
    const buffer = await downloadViaInterceptAndApi(page, fileConfig, log);
    log(`${label}: 다운로드 완료 (${Math.round(buffer.length / 1024)} KB)`);
    return buffer;
  }

  log(`${label}: 엑셀 다운로드 시작...`);
  const buffer = await clickExcelAndDownload(page, context, log, label, null);
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

// ── LC_TP_CD → 작업구분 이름 매핑 ────────────────────────────────────────────
const LC_TP_NAMES = {
  "01": "박스수기", "02": "소분", "03": "행사존A", "04": "유가증권",
  "05": "담배존",  "06": "이형존A", "08": "주류존", "12": "소분음료",
  "13": "슬라존", "15": "경량존", "17": "이너존", "20": "담배수기",
  "21": "박스존", "25": "이형존B", "48": "공병존",
};

// ── DOM 스크래핑 (ExtJS 그리드 데이터 추출) ──────────────────────────────────

async function scrapeDomData(page, fileConfig, log) {
  const { label, menuPath } = fileConfig;

  log(`${label}: elogis 메인 이동...`);
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2_000);

  if (menuPath && menuPath.length > 0) {
    await navigateViaMenu(page, menuPath, log);
    await page.waitForTimeout(1_000);
  }

  // DPS 전용: /grid01Model 요청 인터셉트 (페이지네이션 재사용)
  let capturedDpsRequest = null;
  const isDpsConfig = (fileConfig.menuPath && fileConfig.menuPath.includes("DPS 작업현황"));
  if (isDpsConfig) {
    await page.context().route("**", async (route) => {
      const req = route.request();
      if (!capturedDpsRequest && req.url().includes("dpsInfListService")) {
        capturedDpsRequest = {
          url: req.url(),
          method: req.method(),
          headers: req.headers(),
          postData: req.postData(),
        };
      }
      await route.continue();
    }).catch(() => {});
  }

  // 조회 버튼 클릭 (먼저 실행 — 프레임이 아직 없을 수 있으므로 pageSize는 조회 후 설정)
  await clickSearchButton(page, log, label);

  // Loading 스피너 사라질 때까지 최대 20초 대기
  const targets0 = getElogisFrames(page);
  const loadDeadline = Date.now() + 20_000;
  while (Date.now() < loadDeadline) {
    let loading = false;
    for (const t of targets0) {
      const isLoading = await t.evaluate(() => {
        const el = document.querySelector(".x-mask-loading, .x-load-mask");
        if (el && el.offsetParent !== null) return true;
        if (typeof Ext !== "undefined") {
          for (const g of Ext.ComponentQuery.query("gridpanel")) {
            const st = g.store || g.getStore?.();
            if (st && st.isLoading && st.isLoading()) return true;
          }
        }
        return false;
      }).catch(() => false);
      if (isLoading) { loading = true; break; }
    }
    if (!loading) break;
    log(`${label}: 데이터 로딩 대기 중...`);
    await page.waitForTimeout(1_000);
  }
  await page.waitForTimeout(1_500);

  // DPS 전용: 1차 로드 확인 후 전체 건수 부족하면 pageSize 재설정 → reload
  if (page.frames().some((f) => f.url().includes("DPS_INF_LIST"))) {
    // 1차 로드 완료 대기
    const firstDeadline = Date.now() + 20_000;
    while (Date.now() < firstDeadline) {
      const dpsF = page.frames().find((f) => f.url().includes("DPS_INF_LIST"));
      const count = dpsF ? await dpsF.evaluate(() => {
        if (typeof Ext === "undefined") return 0;
        const g = Ext.ComponentQuery.query("gridpanel")[0];
        const s = g && (g.store || g.getStore?.());
        return s ? s.getCount() : 0;
      }).catch(() => 0) : 0;
      if (count > 0) break;
      await page.waitForTimeout(1_000);
    }

    // 1차 로드 완료 대기 (기본 10,000건)
    const dpsF = page.frames().find((f) => f.url().includes("DPS_INF_LIST"));
    if (dpsF) {
      const dpsDeadline = Date.now() + 30_000;
      while (Date.now() < dpsDeadline) {
        const { count, loading } = await dpsF.evaluate(() => {
          if (typeof Ext === "undefined") return { count: 0, loading: true };
          const g = Ext.ComponentQuery.query("gridpanel")[0];
          const s = g && (g.store || g.getStore?.());
          if (!s) return { count: 0, loading: true };
          return { count: s.getCount(), loading: s.isLoading ? s.isLoading() : false };
        }).catch(() => ({ count: 0, loading: true }));
        if (count > 0 && !loading) { log(`${label}: 전체 건수 재로드 요청`); break; }
        await page.waitForTimeout(1_000);
      }
    }
  }

  const dpsFrame = page.frames().find((f) => f.url().includes("DPS_INF_LIST"));
  if (dpsFrame) {
    // 스토어에서 API URL + 파라미터 추출 후 페이지네이션으로 전체 집계
    const storeInfo = await dpsFrame.evaluate(() => {
      try {
        if (typeof Ext === "undefined") return null;
        const g = Ext.ComponentQuery.query("gridpanel")[0];
        const s = g && (g.store || g.getStore?.());
        if (!s || !s.proxy) return null;
        const records = s.getRange ? s.getRange() : [];
        if (records.length === 0) return null;
        const dsTotal = records[0].get?.("DS_TOTALCOUNT") ?? s.getTotalCount?.() ?? 0;

        // 첫 번째 배치 zones 집계
        const zones = {};
        for (const r of records) {
          const d = r.getData ? r.getData() : r.data;
          const code = String(d.LC_TP_CD ?? "?");
          const pgs = String(d.PGS_STAT_CD ?? "");
          const car = String(d.CHG_CARDOC_CD ?? "");
          if (!zones[code]) zones[code] = { done: 0, total: 0, minPendingCar: null };
          zones[code].total++;
          const isDone = pgs === "03";
          if (isDone) {
            zones[code].done++;
          } else if (car) {
            const prev = zones[code].minPendingCar;
            if (prev === null || Number(car) < Number(prev)) zones[code].minPendingCar = car;
          }
        }

        // API URL 추출
        const proxy = s.proxy;
        const proxyUrl = proxy.url || proxy.api?.read || "";
        const extraParams = proxy.extraParams ? Object.assign({}, proxy.extraParams) : {};

        return { dsTotal, loadedCount: records.length, zones, proxyUrl, extraParams };
      } catch (_) { return null; }
    }).catch(() => null);

    if (!storeInfo || Object.keys(storeInfo.zones).length === 0) {
      log(`${label}: 스토어 정보 추출 실패`);
    } else {
      const { dsTotal, loadedCount, zones, proxyUrl, extraParams } = storeInfo;
      log(`${label}: 1차 ${loadedCount}건 집계 완료 (전체 ${dsTotal}건) capturedReq=${capturedDpsRequest ? capturedDpsRequest.method + " " + capturedDpsRequest.url.substring(0, 80) : "null"}`);

      // 나머지 페이지 fetch로 집계 (캡처된 요청 재사용)
      if (dsTotal > loadedCount && capturedDpsRequest) {
        const BATCH = 10000;
        for (let start = loadedCount; start < dsTotal; start += BATCH) {
          const batchLimit = Math.min(BATCH, dsTotal - start);
          log(`${label}: 추가 로드 ${start}~${start + batchLimit}건...`);
          // start/limit은 URL 쿼리파라미터로 추가 (postData는 그대로 사용)
          const postData = capturedDpsRequest.postData || "";
          let baseUrl = capturedDpsRequest.url.replace(/[&?]start=\d+/, "").replace(/[&?]limit=\d+/, "");
          const fetchUrl = baseUrl + (baseUrl.includes("?") ? "&" : "?") + `start=${start}&limit=${batchLimit}`;
          let fetchResult;
          try {
            const res = await page.request.fetch(fetchUrl, {
              method: capturedDpsRequest.method,
              headers: capturedDpsRequest.headers,
              data: capturedDpsRequest.method === "POST" ? postData : undefined,
            });
            const text = await res.text();
            let json;
            try { json = JSON.parse(text); } catch { fetchResult = { err: "parse fail", preview: text.substring(0, 200) }; json = null; }
            if (json) {
              const rows = json.DS_OUT ?? json.rows ?? json.data ?? json.items ?? json.result ?? null;
              fetchResult = { status: res.status(), keys: Object.keys(json), rowCount: rows ? rows.length : -1, rows: rows ?? [] };
            }
          } catch (e) { fetchResult = { err: String(e) }; }
          log(`${label}: fetch 결과 status=${fetchResult.status} rows=${fetchResult.rowCount} keys=${JSON.stringify(fetchResult.keys)} err=${fetchResult.err || ""}`);
          const rows = (fetchResult.rows ?? []).slice(0, batchLimit);

          for (const d of rows) {
            const code = String(d.LC_TP_CD ?? "?");
            const pgs = String(d.PGS_STAT_CD ?? "");
            const car = String(d.CHG_CARDOC_CD ?? "");
            if (!zones[code]) zones[code] = { done: 0, total: 0, minPendingCar: null };
            zones[code].total++;
            const isDone = pgs === "03";
            if (isDone) {
              zones[code].done++;
            } else if (car) {
              const prev = zones[code].minPendingCar;
              if (prev === null || Number(car) < Number(prev)) zones[code].minPendingCar = car;
            }
          }
        }
      }

      const result = {};
      let totalLoaded = 0;
      for (const [k, v] of Object.entries(zones)) {
        result[k] = { done: v.done, total: v.total, minPendingCar: v.minPendingCar };
        totalLoaded += v.total;
      }
      const summary = { dsTotal, loadedCount: totalLoaded, zones: result };
      log(`${label}: ${totalLoaded}건 집계 완료 (전체 ${dsTotal}건)`);
      // zone 15 디버그: 미완료 car 분포 확인
      return summary;
    }
  }

  // fallback: 일반 프레임 순회
  const targets = getElogisFrames(page);
  for (const target of targets) {
    const rows = await target.evaluate(() => {
      try {
        if (typeof Ext === "undefined") return null;
        const grids = Ext.ComponentQuery.query("gridpanel");
        for (const grid of grids) {
          if (!grid.isVisible(true)) continue;
          const store = grid.store || grid.getStore?.();
          if (!store) continue;
          const records = store.getRange();
          if (records.length === 0) continue;
          return records.map((r) => {
            const raw = r.getData ? r.getData() : r.data || {};
            const out = {};
            for (const [k, v] of Object.entries(raw)) {
              if (typeof v !== "function" && !k.startsWith("_")) out[k] = v;
            }
            return out;
          });
        }
      } catch (_) {}
      return null;
    }).catch(() => null);
    if (rows && rows.length > 0) {
      log(`${label}: ${rows.length}건 추출`);
      return rows;
    }
  }

  await page.screenshot({ path: path.join(__dirname, `debug_${label}.png`) }).catch(() => {});
  throw new Error(`${label}: 그리드 데이터를 찾지 못했습니다.`);
}

// TMS: 시스템 Chrome + headless 로 탐지 우회 시도
async function createTmsSession(id, pw, log) {
  return createSession(id, pw, log, { headless: true, useSystemChrome: true });
}

module.exports = { createSession, createTmsSession, downloadFile, scrapeDomData };
