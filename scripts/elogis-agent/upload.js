/**
 * upload.js
 * 다운로드된 Excel 버퍼를 admin API 에 업로드합니다.
 *
 * 모든 슬롯: presigned URL → R2 PUT
 * store-master: 추가로 서버가 R2 파일 읽어 파싱 → DB 반영 (import API)
 * generic 슬롯: confirm API로 메타 저장
 */

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * @param {string} adminUrl   예: https://your-admin.vercel.app
 * @param {object} fileConfig config.js 의 파일 설정
 * @param {Buffer} buffer     다운로드된 파일 버퍼
 * @param {function} log      로그 함수
 */
async function uploadToAdmin(adminUrl, fileConfig, buffer, log) {
  const { slotKey, label, fileNameLabel, type } = fileConfig;
  // fileNameLabel 이 정의되어 있으면 파일명에 그것을 사용, 아니면 label 사용 (UI 표시명과 분리)
  const fileName = `${fileNameLabel || label}_${formatDate(new Date())}.xlsx`;

  if (type === "store-master") {
    await uploadStoreMaster(adminUrl, slotKey, label, fileName, buffer, log);
  } else {
    await uploadGeneric(adminUrl, slotKey, label, fileName, buffer, log);
  }
}

// ── 공통: presigned URL → R2 PUT ─────────────────────────────────────────

async function uploadToR2(adminUrl, slotKey, label, fileName, buffer, log) {
  log(`${label}: 업로드 URL 발급 중...`);
  const urlRes = await fetch(`${adminUrl}/api/admin/file-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "upload-url", slotKey, fileName, contentType: XLSX_CONTENT_TYPE }),
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
}

// ── generic: R2 PUT → confirm (meta 저장) ────────────────────────────────

async function uploadGeneric(adminUrl, slotKey, label, fileName, buffer, log) {
  await uploadToR2(adminUrl, slotKey, label, fileName, buffer, log);

  await fetch(`${adminUrl}/api/admin/file-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "confirm", slotKey, fileName, uploaderName: "elogis-agent", fileSize: buffer.length }),
  });

  log(`${label}: 업로드 완료`);
}

// ── store-master: R2 PUT → import API (서버가 파싱 + DB 반영 + meta 저장) ─

async function uploadStoreMaster(adminUrl, slotKey, label, fileName, buffer, log) {
  await uploadToR2(adminUrl, slotKey, label, fileName, buffer, log);

  log(`${label}: DB 반영 중...`);
  const importRes = await fetch(`${adminUrl}/api/admin/store-master/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploaderName: "elogis-agent" }),
  });
  const importJson = await importRes.json();
  if (!importJson.ok) throw new Error(`${label}: DB 반영 실패 — ${importJson.message}`);

  log(`${label}: DB 반영 완료 (${importJson.count}건 / ${importJson.deleted}건 삭제)`);
}

// ── 날짜 포맷 헬퍼 ────────────────────────────────────────────────────────

function formatDate(d) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yy}${mm}${dd}_${hh}${mi}${ss}`;
}

module.exports = { uploadToAdmin };
