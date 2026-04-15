/**
 * 슬롯 다운로드 후 엑셀 첫 행(헤더) + 데이터 3행 출력
 * 사용: node inspect-slot.js <slotKey>
 */
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const XLSX = require("xlsx");
const { FILE_CONFIGS } = require("./config");
const { createSession, downloadFile } = require("./elogis");

const slotKey = process.argv[2];
if (!slotKey) {
  console.error("사용법: node inspect-slot.js <slotKey>");
  console.error("슬롯 목록:", FILE_CONFIGS.map((c) => c.slotKey).join(", "));
  process.exit(1);
}

const config = FILE_CONFIGS.find((c) => c.slotKey === slotKey);
if (!config) { console.error(`슬롯 없음: ${slotKey}`); process.exit(1); }

async function main() {
  console.log(`[검사] 슬롯: ${config.label}`);
  const { browser, context, page } = await createSession(
    process.env.ELOGIS_ID, process.env.ELOGIS_PW, console.log
  );
  try {
    const buf = await downloadFile(page, context, config, console.log);
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });

    console.log(`\n▶ 시트명: ${wb.SheetNames[0]}`);
    console.log(`▶ 총 행 수: ${rows.length} (헤더 포함)`);
    console.log(`\n── 헤더 ──`);
    console.log((rows[0] ?? []).join(" | "));
    console.log(`\n── 데이터 1~3행 ──`);
    for (let i = 1; i <= 3 && i < rows.length; i++) {
      console.log(rows[i].join(" | "));
    }
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
