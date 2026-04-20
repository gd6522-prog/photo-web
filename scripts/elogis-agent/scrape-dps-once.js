/**
 * scrape-dps-once.js
 * DPS 작업현황 1회 스크래핑 후 admin 서버에 저장하고 종료
 */
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const { createSession, scrapeDomData } = require("./elogis");

const ELOGIS_ID           = process.env.ELOGIS_ID;
const ELOGIS_PW           = process.env.ELOGIS_PW;
const ADMIN_URL           = (process.env.ADMIN_URL || "").replace(/\/$/, "");
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

const DPS_CONFIG = {
  slotKey: "dps-status",
  label: "DPS 작업현황",
  domScrape: true,
  pageUrl: "https://elogis.emart24.co.kr/",
  menuPath: ["창고관리 (WMS)", "출고", "설비작업지시", "설비작업현황", "DPS 작업현황"],
};

function log(msg) {
  console.log(`[${new Date().toLocaleString("ko-KR")}] ${msg}`);
}

async function main() {
  log("=== DPS 작업현황 스크래핑 시작 ===");

  let browser = null;
  try {
    const session = await createSession(ELOGIS_ID, ELOGIS_PW, log);
    browser = session.browser;

    const result = await scrapeDomData(session.page, DPS_CONFIG, log);
    log(`스크래핑 완료: ${JSON.stringify(result, null, 2)}`);

    // admin 서버에 저장
    log("서버에 저장 중...");
    const res = await fetch(`${ADMIN_URL}/api/internal/dps-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_API_SECRET || "",
      },
      body: JSON.stringify({ rows: result, scrapedAt: new Date().toISOString() }),
    });
    const json = await res.json();
    if (json.ok) {
      log(`저장 완료 (${json.count}건)`);
    } else {
      log(`저장 실패: ${json.message}`);
    }
  } catch (err) {
    log(`[ERROR] ${err?.message ?? err}`);
    // 스크린샷은 elogis.js 내부에서 이미 저장됨
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  log("=== 완료 ===");
}

main().catch((e) => {
  console.error("[FATAL]", e);
  process.exit(1);
});
