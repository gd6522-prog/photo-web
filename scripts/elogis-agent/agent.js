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
const { createSession, createTmsSession, downloadFile } = require("./elogis");
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

  await addLog(`처리 대상 ${targets.length}개 파일 (병렬 실행): ${targets.map((c) => c.label).join(", ")}`);

  // 각 슬롯을 독립적인 브라우저 세션으로 병렬 실행
  const activeBrowsers = new Set();

  const downloadOne = async (fileConfig) => {
    let browser = null;
    try {
      const session = fileConfig.tmsDownload
        ? await createTmsSession(ELOGIS_ID, ELOGIS_PW, addLog)
        : await createSession(ELOGIS_ID, ELOGIS_PW, addLog);
      browser = session.browser;
      activeBrowsers.add(browser);
      const buffer = await downloadFile(session.page, session.context, fileConfig, addLog);
      await uploadToAdmin(ADMIN_URL, fileConfig, buffer, addLog);
      return { slotKey: fileConfig.slotKey, label: fileConfig.label, ok: true, message: "완료" };
    } catch (err) {
      const msg = err?.message ?? String(err);
      await addLog(`[실패] ${fileConfig.label}: ${msg}`);
      return { slotKey: fileConfig.slotKey, label: fileConfig.label, ok: false, message: msg };
    } finally {
      if (browser) {
        activeBrowsers.delete(browser);
        await browser.close().catch(() => {});
      }
    }
  };

  // 종료 시 강제 닫기용 (currentBrowser 대신 Set으로 관리)
  currentBrowserSet = activeBrowsers;

  const settled = await Promise.allSettled(targets.map(downloadOne));
  currentBrowserSet = null;

  const results = settled.map((s) =>
    s.status === "fulfilled" ? s.value : { ok: false, message: String(s.reason) }
  );

  return results;
}

// ── 작업 처리 ─────────────────────────────────────────────────────────────────

let isProcessing = false;
let currentBrowserSet = null; // 병렬 브라우저 Set (종료 시 강제 닫기용)
let currentJobId = null;      // 종료 시 DB 상태 정리용

async function processJob(jobId) {
  if (isProcessing) return;
  isProcessing = true;
  currentJobId = jobId;

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
    currentJobId = null;
  }
}

// ── 종료 처리 (Ctrl+C / SIGTERM) ──────────────────────────────────────────────

async function shutdown(signal) {
  log(`\n[${signal}] 에이전트 종료 중...`);

  // 실행 중인 브라우저 전체 닫기
  if (currentBrowserSet && currentBrowserSet.size > 0) {
    log(`브라우저 ${currentBrowserSet.size}개 닫는 중...`);
    await Promise.all([...currentBrowserSet].map((b) => b.close().catch(() => {})));
    currentBrowserSet = null;
  }

  // 중단된 작업 DB 상태 정리
  if (currentJobId) {
    log(`작업 #${currentJobId} → 중단됨 (interrupted)`);
    await supabase.from("elogis_sync_log").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_text: `에이전트가 강제 종료되었습니다 (${signal})`,
    }).eq("id", currentJobId).catch(() => {});
  }

  log("에이전트 종료 완료");
  process.exit(0);
}

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

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

  // 이전에 중단된 running/pending 작업 정리
  const { data: stale } = await supabase
    .from("elogis_sync_log")
    .select("id")
    .in("status", ["running", "pending"]);
  if (stale && stale.length > 0) {
    const ids = stale.map((r) => r.id);
    await supabase.from("elogis_sync_log").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_text: "에이전트 재시작으로 인해 중단됨",
    }).in("id", ids);
    log(`이전 중단 작업 ${ids.length}건 정리: #${ids.join(", #")}`);
  }

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
