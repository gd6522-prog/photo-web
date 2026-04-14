/**
 * debug-mdm.js
 * 상품마스터 페이지의 프레임 구조 + 버튼 목록을 덤프합니다.
 * 실행: node debug-mdm.js
 */
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const { chromium } = require("playwright");
const path = require("path");

const ELOGIS_ID = process.env.ELOGIS_ID;
const ELOGIS_PW = process.env.ELOGIS_PW;

(async () => {
  console.log("브라우저 시작 (headless: false — 화면 확인용)...");
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 로그인
  console.log("로그인 중...");
  await page.goto("https://elogis.emart24.co.kr/", { waitUntil: "networkidle", timeout: 30_000 });
  await page.locator('input[name="USERID"]').first().waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('input[name="USERID"]').first().fill(ELOGIS_ID);
  await page.locator('input[type="password"]').first().fill(ELOGIS_PW);
  await page.keyboard.press("Enter");
  await page.waitForSelector('input[name="USERID"]', { state: "hidden", timeout: 15_000 });
  console.log("로그인 성공");

  // 메뉴 클릭
  const menuPath = ["즐겨찾기", "마스터관리 (MDM)", "상품관리", "상품"];
  for (const item of menuPath) {
    console.log(`메뉴 클릭: ${item}`);
    const el = page.locator(`text="${item}"`).first();
    await el.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    await el.click({ timeout: 5_000 }).catch(async () => el.click({ force: true }).catch(() => {}));
    await page.waitForTimeout(1_200);
  }

  console.log("페이지 로드 대기 (5초)...");
  await page.waitForTimeout(5_000);

  // 스크린샷
  await page.screenshot({ path: path.join(__dirname, "debug_mdm_상품마스터.png"), fullPage: true });
  console.log("스크린샷 저장: debug_mdm_상품마스터.png");

  // 프레임 정보 덤프
  console.log("\n=== 프레임 목록 ===");
  const frames = page.frames();
  console.log(`총 ${frames.length}개 프레임`);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const url = f.url();
    console.log(`\n[프레임 ${i}] ${url}`);

    // 버튼 목록
    const buttons = await f.evaluate(() => {
      const results = [];
      // x-btn-inner (ExtJS)
      for (const el of document.querySelectorAll(".x-btn-inner")) {
        results.push(`[ExtJS버튼] "${el.textContent?.trim()}"`);
      }
      // 일반 버튼
      for (const el of document.querySelectorAll('a[role="button"], button, input[type="button"]')) {
        const text = (el.value || el.textContent || "").trim().substring(0, 30);
        if (text) results.push(`[버튼] "${text}"`);
      }
      return results;
    }).catch(() => ["evaluate 실패"]);

    if (buttons.length === 0) {
      console.log("  (버튼 없음)");
    } else {
      buttons.slice(0, 20).forEach((b) => console.log("  " + b));
      if (buttons.length > 20) console.log(`  ... 외 ${buttons.length - 20}개`);
    }

    // iframe 태그 확인
    const iframeSrcs = await f.evaluate(() =>
      Array.from(document.querySelectorAll("iframe")).map((el) => el.src || el.getAttribute("src") || "(no src)")
    ).catch(() => []);
    if (iframeSrcs.length > 0) {
      console.log(`  iframe src 목록: ${iframeSrcs.join(", ")}`);
    }
  }

  console.log("\n=== 완료 — 10초 후 브라우저 닫힘 ===");
  await page.waitForTimeout(10_000);
  await browser.close();
})().catch((e) => {
  console.error("[ERROR]", e.message);
  process.exit(1);
});
