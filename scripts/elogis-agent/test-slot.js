/**
 * 단일 슬롯 테스트 스크립트
 * 사용: node test-slot.js <slotKey>
 * 예: node test-slot.js product-inventory
 */
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const { FILE_CONFIGS } = require("./config");
const { createSession, downloadFile } = require("./elogis");

const slotKey = process.argv[2];
if (!slotKey) {
  console.error("사용법: node test-slot.js <slotKey>");
  console.error("슬롯 목록:", FILE_CONFIGS.map((c) => c.slotKey).join(", "));
  process.exit(1);
}

const config = FILE_CONFIGS.find((c) => c.slotKey === slotKey);
if (!config) {
  console.error(`슬롯 없음: ${slotKey}`);
  console.error("슬롯 목록:", FILE_CONFIGS.map((c) => c.slotKey).join(", "));
  process.exit(1);
}

async function main() {
  console.log(`[테스트] 슬롯: ${config.label} (${config.slotKey})`);
  const { browser, context, page } = await createSession(
    process.env.ELOGIS_ID,
    process.env.ELOGIS_PW,
    console.log
  );
  try {
    const buf = await downloadFile(page, context, config, console.log);
    console.log(`[성공] 다운로드 완료, 크기: ${Math.round(buf.length / 1024)} KB`);
  } catch (e) {
    console.error(`[실패]`, e.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
