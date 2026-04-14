/**
 * upload.js
 * 다운로드된 Excel 버퍼를 admin API 에 업로드합니다.
 *
 * generic 슬롯: presigned URL → R2 PUT → confirm
 * store-master: xlsx 파싱 → /api/admin/store-master/import → save-meta
 */

const XLSX = require("xlsx");

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * @param {string} adminUrl   예: https://your-admin.vercel.app
 * @param {object} fileConfig config.js 의 파일 설정
 * @param {Buffer} buffer     다운로드된 파일 버퍼
 * @param {function} log      로그 함수
 */
async function uploadToAdmin(adminUrl, fileConfig, buffer, log) {
  const { slotKey, label, type } = fileConfig;
  const fileName = `${label}_${formatDate(new Date())}.xlsx`;

  if (type === "store-master") {
    await uploadStoreMaster(adminUrl, slotKey, label, fileName, buffer, log);
  } else {
    await uploadGeneric(adminUrl, slotKey, label, fileName, buffer, log);
  }
}

// ── generic: presigned URL → R2 PUT → confirm ─────────────────────────────

async function uploadGeneric(adminUrl, slotKey, label, fileName, buffer, log) {
  log(`${label}: 업로드 URL 발급 중...`);

  const urlRes = await fetch(`${adminUrl}/api/admin/file-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "upload-url",
      slotKey,
      fileName,
      contentType: XLSX_CONTENT_TYPE,
    }),
  });
  const urlJson = await urlRes.json();
  if (!urlJson.ok) throw new Error(`${label}: URL 발급 실패 — ${urlJson.message}`);

  log(`${label}: R2 업로드 중...`);
  const putRes = await fetch(urlJson.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": XLSX_CONTENT_TYPE },
    body: buffer,
  });
  if (!putRes.ok) throw new Error(`${label}: R2 업로드 실패 (HTTP ${putRes.status})`);

  await fetch(`${adminUrl}/api/admin/file-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "confirm",
      slotKey,
      fileName,
      uploaderName: "elogis-agent",
    }),
  });

  log(`${label}: 업로드 완료`);
}

// ── store-master: xlsx 파싱 → DB import → save-meta ──────────────────────

function normalizeHeader(v) {
  return String(v ?? "").trim().replace(/\s+/g, "").replace(/\*/g, "").toLowerCase();
}

function normalizeStoreCode(v) {
  const raw = String(v ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return digits.length < 5 ? digits.padStart(5, "0") : digits.slice(0, 5);
}

function findIdx(headers, candidates) {
  for (const c of candidates) {
    const i = headers.indexOf(normalizeHeader(c));
    if (i >= 0) return i;
  }
  return -1;
}

function parseStoreMasterBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("점포마스터: 시트를 읽지 못했습니다.");

  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  if (!raw || raw.length < 2) throw new Error("점포마스터: 데이터가 없습니다.");

  const headers = raw[0].map(normalizeHeader);
  const idxCar  = findIdx(headers, ["호차번호", "차량번호"]);
  const idxSeq  = findIdx(headers, ["배송순서", "순번"]);
  const idxCode = findIdx(headers, ["배송처코드", "점포코드"]);
  const idxName = findIdx(headers, ["배송처명", "점포명"]);
  const idxDue  = findIdx(headers, ["납기기준시간", "기준시간", "납품시간", "납품예정시간"]);
  const idxAddr = findIdx(headers, ["주소", "배송처주소"]);

  if (idxCar < 0 || idxSeq < 0 || idxCode < 0 || idxName < 0) {
    throw new Error("점포마스터: 필수 컬럼(호차번호, 배송순서, 배송처코드, 배송처명)을 찾지 못했습니다.");
  }

  const rows = [];
  for (let i = 1; i < raw.length; i++) {
    const line = raw[i];
    if (!line) continue;
    const car_no     = String(line[idxCar]  ?? "").trim();
    const seq_no     = Number(String(line[idxSeq] ?? "").trim());
    const store_code = normalizeStoreCode(line[idxCode]);
    const store_name = String(line[idxName] ?? "").trim();
    if (!store_code) continue;
    rows.push({
      store_code,
      store_name,
      car_no,
      seq_no: Number.isFinite(seq_no) ? seq_no : 0,
      delivery_due_time: idxDue  >= 0 ? String(line[idxDue]  ?? "").trim() : "",
      address:           idxAddr >= 0 ? String(line[idxAddr] ?? "").trim() : "",
    });
  }
  return rows;
}

async function uploadStoreMaster(adminUrl, slotKey, label, fileName, buffer, log) {
  log(`${label}: 파싱 중...`);
  const rows = parseStoreMasterBuffer(buffer);
  const uploadable = rows.filter((r) => !!r.car_no);

  if (uploadable.length === 0) {
    throw new Error(`${label}: 업로드 가능한 행이 없습니다.`);
  }

  log(`${label}: DB 반영 중 (${uploadable.length}건)...`);
  const importRes = await fetch(`${adminUrl}/api/admin/store-master/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows: uploadable }),
  });
  const importJson = await importRes.json();
  if (!importJson.ok) throw new Error(`${label}: DB 반영 실패 — ${importJson.message}`);

  await fetch(`${adminUrl}/api/admin/file-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "save-meta",
      slotKey,
      fileName,
      uploaderName: "elogis-agent",
    }),
  });

  log(`${label}: DB 반영 완료 (${importJson.count}건 / ${importJson.deleted}건 삭제)`);
}

// ── 날짜 포맷 헬퍼 ────────────────────────────────────────────────────────

function formatDate(d) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

module.exports = { uploadToAdmin };
