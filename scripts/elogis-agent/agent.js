/**
 * agent.js — elogis 자동 다운로드 에이전트 메인 루프
 *
 * 기능:
 *   1. Supabase 에 heartbeat 전송 (30초마다)
 *   2. elogis_sync_log 테이블을 폴링 (10초마다)
 *      → pending 작업 발견 시 즉시 처리
 *   3. node-cron 으로 매일 지정 시각에 자동 실행
 *      (CRON_SCHEDULE 환경변수, 기본: 매일 오전 6시)
 */

require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const { createClient } = require("@supabase/supabase-js");
const cron = require("node-cron");
const { FILE_CONFIGS } = require("./config");
const { createSession, downloadFile } = require("./elogis");
const { uploadToAdmin } = require("./upload");

// ── 환경변수 ──────────────────────────────────────────────────────────────────

const ELOGIS_ID      = process.env.ELOGIS_ID;
const ELOGIS_PW      = process.env.ELOGIS_PW;
const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_URL      = (process.env.ADMIN_URL || "").replace(/\/$/, "");
const CRON_SCHEDULE  = process.env.CRON_SCHEDULE || "0 6 * * *";

if (!ELOGIS_ID || !ELOGIS_PW || !SUPABASE_URL || !SUPABASE_KEY || !ADMIN_URL) {
  console.error("[ERROR] .env 파일을 확인하세요. 필수값: ELOGIS_ID, ELOGIS_PW, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_URL");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 로그 헬퍼 ─────────────────────────────────────────────────────────────────

function now() {
  return new Date().toLocaleString("ko-KR");
}

function log(msg) {
  console.log(`[${now()}] ${msg}`);
}

// ── Supabase 헬퍼 ─────────────────────────────────────────────────────────────

async function sendHeartbeat() {
  await supabase
    .from("elogis_agent_status")
    .upsert({ id: 1, last_heartbeat_at: new Date().toISOString() });
}

async function appendLog(jobId, lines) {
  // 기존 log_tail 에 추가 (최대 50줄 유지)
  const { data } = await supabase
    .from("elogis_sync_log")
    .select("log_tail")
    .eq("id", jobId)
    .single();
  const prev = data?.log_tail ?? [];
  const next = [...prev, ...lines].slice(-50);
  await supabase.from("elogis_sync_log").update({ log_tail: next }).eq("id", jobId);
}

// ── 메인 동기화 로직 ──────────────────────────────────────────────────────────

async function runSync(jobId) {
  const addLog = async (msg) => {
    log(msg);
    if (jobId) await appendLog(jobId, [`[${now()}] ${msg}`]);
  };

  // target_slots 조회 (null = 전체)
  let targetSlots = null;
  if (jobId) {
    const { data: job } = await supabase
      .from("elogis_sync_log")
      .select("target_slots")
      .eq("id", jobId)
      .single();
    targetSlots = job?.target_slots ?? null;
  }

  // 설정되지 않은 파일 필터링 + target_slots 필터링
  const targets = FILE_CONFIGS.filter((c) =>
    c.pageUrl !== "TODO" && (targetSlots === null || targetSlots.includes(c.slotKey))
  );
  const skipped = FILE_CONFIGS.filter((c) => c.pageUrl === "TODO");

  if (skipped.length > 0) {
    await addLog(`설정 미완료 파일 건너뜀: ${skipped.map((c) => c.label).join(", ")}`);
  }

  if (targets.length === 0) {
    throw new Error("처리할 파일이 없습니다. config.js 에서 pageUrl 을 설정하세요.");
  }

  await addLog(`처리 대상 ${targets.length}개 파일: ${targets.map((c) => c.label).join(", ")}`);

  let browser = null;
  let page = null;
  const results = [];

  try {
    const session = await createSession(ELOGIS_ID, ELOGIS_PW, addLog);
    browser = session.browser;
    page = session.page;
    const context = session.context;

    for (const fileConfig of targets) {
      try {
        const buffer = await downloadFile(page, context, fileConfig, addLog);
        await uploadToAdmin(ADMIN_URL, fileConfig, buffer, addLog);
        results.push({ slotKey: fileConfig.slotKey, label: fileConfig.label, ok: true, message: "완료" });
      } catch (err) {
        const msg = err?.message ?? String(err);
        await addLog(`[실패] ${fileConfig.label}: ${msg}`);
        results.push({ slotKey: fileConfig.slotKey, label: fileConfig.label, ok: false, message: msg });
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return results;
}

// ── 작업 처리 ─────────────────────────────────────────────────────────────────

let isProcessing = false;

async function processJob(jobId) {
  if (isProcessing) return;
  isProcessing = true;

  log(`작업 #${jobId} 시작`);

  await supabase
    .from("elogis_sync_log")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  try {
    const results = await runSync(jobId);
    const allOk = results.every((r) => r.ok);

    await supabase.from("elogis_sync_log").update({
      status: allOk ? "done" : "failed",
      completed_at: new Date().toISOString(),
      results,
      error_text: allOk ? null : `일부 파일 실패: ${results.filter((r) => !r.ok).map((r) => r.label).join(", ")}`,
    }).eq("id", jobId);

    log(`작업 #${jobId} ${allOk ? "완료" : "일부 실패"}`);
  } catch (err) {
    const msg = err?.message ?? String(err);
    log(`[ERROR] 작업 #${jobId} 실패: ${msg}`);
    await supabase.from("elogis_sync_log").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_text: msg,
    }).eq("id", jobId);
  } finally {
    isProcessing = false;
  }
}

// 스케줄 트리거 (DB에 pending 작업 삽입 후 즉시 실행)
async function triggerScheduled() {
  if (isProcessing) {
    log("이미 처리 중 — 스케줄 트리거 건너뜀");
    return;
  }

  const { data, error } = await supabase
    .from("elogis_sync_log")
    .insert({ status: "pending" })
    .select("id")
    .single();

  if (error) {
    log(`[ERROR] 스케줄 작업 생성 실패: ${error.message}`);
    return;
  }
  log(`스케줄 트리거 → 작업 #${data.id}`);
  await processJob(data.id);
}

// ── 폴링 루프 ─────────────────────────────────────────────────────────────────

async function poll() {
  if (isProcessing) return;

  const { data } = await supabase
    .from("elogis_sync_log")
    .select("id")
    .eq("status", "pending")
    .order("requested_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (data) {
    await processJob(data.id);
  }
}

// ── 시작 ──────────────────────────────────────────────────────────────────────

async function main() {
  log("=== elogis 에이전트 시작 ===");
  log(`스케줄: ${CRON_SCHEDULE}`);
  log(`대상 파일: ${FILE_CONFIGS.filter((c) => c.pageUrl !== "TODO").map((c) => c.label).join(", ") || "없음 (config.js 설정 필요)"}`);

  // heartbeat
  await sendHeartbeat();
  setInterval(async () => {
    await sendHeartbeat().catch(() => {});
  }, 30_000);

  // 폴링
  setInterval(async () => {
    await poll().catch((e) => log(`[ERROR] poll: ${e?.message}`));
  }, 10_000);

  // 매일 자동 실행
  cron.schedule(CRON_SCHEDULE, () => {
    log("정기 스케줄 실행");
    triggerScheduled().catch((e) => log(`[ERROR] schedule: ${e?.message}`));
  }, { timezone: "Asia/Seoul" });

  log("에이전트 대기 중... (Ctrl+C 로 종료)");
}

main().catch((e) => {
  console.error("[FATAL]", e);
  process.exit(1);
});
