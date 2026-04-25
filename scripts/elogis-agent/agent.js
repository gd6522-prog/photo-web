/**
 * agent.js — elogis 자동 다운로드 에이전트 메인 루프
 *
 * 기능:
 *   1. Supabase 에 heartbeat 전송 (30초마다)
 *   2. elogis_sync_log 테이블을 폴링 (10초마다)
 *      → pending 작업 발견 시 즉시 처리
 *   3. 매분 서버에서 슬롯 스케줄을 직접 읽어 해당 시각에 자동 실행
 *      (브라우저가 닫혀 있어도 동작, ADMIN_URL + INTERNAL_API_SECRET 필요)
 */

require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const { createClient } = require("@supabase/supabase-js");
const { FILE_CONFIGS } = require("./config");
const { createSession, createTmsSession, downloadFile, scrapeDomData } = require("./elogis");
const { uploadToAdmin } = require("./upload");

// ── 환경변수 ──────────────────────────────────────────────────────────────────

const ELOGIS_ID           = process.env.ELOGIS_ID;
const ELOGIS_PW           = process.env.ELOGIS_PW;
const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_KEY        = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_URL           = (process.env.ADMIN_URL || "").replace(/\/$/, "");
// 내부 스케줄 API 인증 시크릿 (.env.local의 MIGRATION_SECRET과 동일)
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

// 하위 호환: INTERNAL_API_SECRET이 없으면 경고 출력 후 스케줄 기능만 비활성화
if (!ELOGIS_ID || !ELOGIS_PW || !SUPABASE_URL || !SUPABASE_KEY || !ADMIN_URL) {
  console.error("[ERROR] .env 파일을 확인하세요. 필수값: ELOGIS_ID, ELOGIS_PW, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_URL");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 로그 헬퍼 ─────────────────────────────────────────────────────────────────

function now() {
  return new Date().toLocaleString("ko-KR");
}

const fs = require("fs");
const LOG_FILE = require("path").join(__dirname, "agent.log");

function log(msg) {
  const line = `[${now()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n", "utf8");
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
    c.pageUrl !== "TODO" && c.slotKey !== "dps-status" && (targetSlots === null || targetSlots.includes(c.slotKey))
  );

  // DPS 스크래핑은 별도 처리 (target_slots에 포함된 경우에만)
  const dpsTarget = FILE_CONFIGS.find((c) => c.slotKey === "dps-status" && c.domScrape);
  const shouldScrapeDps = dpsTarget && (targetSlots === null || targetSlots.includes("dps-status"));
  const skipped = FILE_CONFIGS.filter((c) => c.pageUrl === "TODO");

  if (skipped.length > 0) {
    await addLog(`설정 미완료 파일 건너뜀: ${skipped.map((c) => c.label).join(", ")}`);
  }

  if (targets.length === 0 && !shouldScrapeDps) {
    throw new Error("처리할 파일이 없습니다. config.js 에서 pageUrl 을 설정하세요.");
  }

  if (targets.length > 0) {
    await addLog(`처리 대상 ${targets.length}개 파일 (병렬 실행): ${targets.map((c) => c.label).join(", ")}`);
  }

  // 각 슬롯을 독립적인 브라우저 세션으로 병렬 실행
  const activeBrowsers = new Set();

  // ── 재시도 가능 에러 판별 ──────────────────────────────────────────────────
  // 설정 문제나 데이터 없음(빈 파일)은 재시도해도 소용없으므로 제외합니다.
  function isRetryableError(msg) {
    if (!msg) return false;
    // 재시도 불가: 설정 미완료
    if (msg.includes("pageUrl") || msg.includes("config.js")) return false;
    // 재시도 불가: 데이터 자체가 없는 경우 (빈 파일)
    if (msg.includes("비어 있습니다")) return false;
    // 재시도 가능: 네트워크/타임아웃/브라우저/로그인 관련 오류
    const retryPatterns = [
      "timeout", "Timeout",           // 타임아웃
      "net::", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND",  // 네트워크
      "Target closed", "browser has disconnected",       // 브라우저 크래시
      "Navigation failed", "ERR_",     // 페이지 이동 실패
      "로그인 실패",                    // elogis 로그인 실패 (서버 부하)
      "다운로드 이벤트를 받지 못했습니다",  // 다운로드 이벤트 누락
      "body 캡처 실패",                // prepare 요청 캡처 실패
      "조회 버튼", "배송그룹 입력 필드", "그리드 메뉴",  // UI 요소 미발견 (일시적)
    ];
    return retryPatterns.some((p) => msg.includes(p));
  }

  // 재시도 대기 (1차: 30초, 2차: 60초)
  const RETRY_DELAYS_SEC = [30, 60];
  const MAX_RETRIES = RETRY_DELAYS_SEC.length;

  const downloadOne = async (fileConfig) => {
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // 재시도 시 대기 후 안내 로그 출력
      if (attempt > 0) {
        const delaySec = RETRY_DELAYS_SEC[attempt - 1];
        await addLog(`[재시도 ${attempt}/${MAX_RETRIES}] ${fileConfig.label}: ${delaySec}초 후 재시도...`);
        await new Promise((r) => setTimeout(r, delaySec * 1000));
      }

      let browser = null;
      try {
        const session = fileConfig.tmsDownload
          ? await createTmsSession(ELOGIS_ID, ELOGIS_PW, addLog)
          : await createSession(ELOGIS_ID, ELOGIS_PW, addLog);
        browser = session.browser;
        activeBrowsers.add(browser);
        const buffer = await downloadFile(session.page, session.context, fileConfig, addLog);
        await uploadToAdmin(ADMIN_URL, fileConfig, buffer, addLog);

        // 재시도 후 성공한 경우 안내 로그
        if (attempt > 0) {
          await addLog(`[재시도 성공] ${fileConfig.label}: ${attempt}번 재시도 후 완료`);
        }
        return { slotKey: fileConfig.slotKey, label: fileConfig.label, ok: true, message: "완료" };
      } catch (err) {
        const msg = err?.message ?? String(err);
        lastError = msg;
        await addLog(`[실패] ${fileConfig.label} (시도 ${attempt + 1}/${MAX_RETRIES + 1}): ${msg}`);

        // 재시도 불가 에러면 즉시 포기
        if (!isRetryableError(msg)) {
          await addLog(`[포기] ${fileConfig.label}: 재시도해도 해결되지 않는 오류입니다.`);
          break;
        }
        // 마지막 시도까지 실패하면 루프 종료
        if (attempt === MAX_RETRIES) {
          await addLog(`[포기] ${fileConfig.label}: ${MAX_RETRIES}회 재시도 후 최종 실패`);
        }
      } finally {
        if (browser) {
          activeBrowsers.delete(browser);
          await browser.close().catch(() => {});
        }
      }
    }

    return { slotKey: fileConfig.slotKey, label: fileConfig.label, ok: false, message: lastError ?? "알 수 없는 오류" };
  };


  // 종료 시 강제 닫기용 (currentBrowser 대신 Set으로 관리)
  currentBrowserSet = activeBrowsers;

  // DPS 스크래핑 병렬 추가
  const allTasks = [...targets.map(downloadOne)];
  if (shouldScrapeDps) {
    allTasks.push(scrapeDpsAndPost(dpsTarget, addLog));
  }

  const settled = await Promise.allSettled(allTasks);
  currentBrowserSet = null;

  const results = settled.map((s) =>
    s.status === "fulfilled" ? s.value : { ok: false, message: String(s.reason) }
  );

  return results;
}

// ── DPS 스크래핑 + 내부 API 전송 ──────────────────────────────────────────────

async function scrapeDpsAndPost(fileConfig, addLog) {
  let browser = null;
  try {
    const session = await createSession(ELOGIS_ID, ELOGIS_PW, addLog);
    browser = session.browser;
    const rows = await scrapeDomData(session.page, fileConfig, addLog);
    const payload = { rows, scrapedAt: new Date().toISOString() };
    const res = await fetch(`${ADMIN_URL}/api/internal/dps-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_API_SECRET || "",
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(`저장 실패: ${json.message}`);
    const loadedCount = rows?.loadedCount ?? 0;
    await addLog(`DPS 작업현황: ${loadedCount}건 스크래핑 → 저장 완료`);
    return { slotKey: "dps-status", label: "DPS 작업현황", ok: true, message: `${loadedCount}건`, zones: rows?.zones ?? null };
  } catch (err) {
    const msg = err?.message ?? String(err);
    await addLog(`[실패] DPS 작업현황: ${msg}`);
    return { slotKey: "dps-status", label: "DPS 작업현황", ok: false, message: msg };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
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

// ── 슬롯 스케줄 트리거 ────────────────────────────────────────────────────────

/**
 * 서버(R2)에 저장된 슬롯별 스케줄을 내부 API로 가져옵니다.
 * INTERNAL_API_SECRET이 없으면 null 반환 (스케줄 기능 비활성화).
 */
async function fetchSlotSchedules() {
  if (!INTERNAL_API_SECRET || !ADMIN_URL) return null;
  try {
    const res = await fetch(`${ADMIN_URL}/api/internal/agent-schedules`, {
      headers: { "x-internal-secret": INTERNAL_API_SECRET },
    });
    if (!res.ok) {
      log(`[WARN] 스케줄 조회 실패: HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    return json.ok ? json.schedules : null;
  } catch (err) {
    log(`[WARN] 스케줄 조회 오류: ${err?.message ?? err}`);
    return null;
  }
}

/**
 * 특정 슬롯 하나에 대한 pending 작업을 DB에 삽입하고 즉시 처리합니다.
 * (브라우저 page.tsx의 handleSyncTrigger와 동일한 방식)
 */
async function triggerSlot(slotKey) {
  if (isProcessing) {
    log(`이미 처리 중 — 슬롯 트리거 건너뜀: ${slotKey}`);
    return;
  }

  // target_slots에 해당 슬롯만 지정해서 삽입
  const { data, error } = await supabase
    .from("elogis_sync_log")
    .insert({ status: "pending", target_slots: [slotKey] })
    .select("id")
    .single();

  if (error) {
    log(`[ERROR] 슬롯 작업 생성 실패 (${slotKey}): ${error.message}`);
    return;
  }
  log(`스케줄 트리거 → 슬롯: ${slotKey}, 작업 #${data.id}`);
  await processJob(data.id);
}

/**
 * 매분 실행되는 스케줄 체크 함수.
 * 서버에서 슬롯 스케줄을 읽어 현재 시각(KST)과 비교 후 해당 슬롯을 트리거합니다.
 */
async function checkSchedules() {
  const schedules = await fetchSlotSchedules();
  if (!schedules || typeof schedules !== "object") return;

  // KST 기준 현재 시/분 추출
  const nowKst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const h = nowKst.getHours();
  const m = nowKst.getMinutes();

  // 일요일(0)은 자동 실행 건너뜀
  if (nowKst.getDay() === 0) return;

  for (const [slotKey, sched] of Object.entries(schedules)) {
    // enabled: true이고 시/분이 정확히 일치할 때만 트리거
    if (sched.enabled && sched.hour === h && sched.minute === m) {
      log(`[스케줄] ${slotKey} → ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} 도달, 트리거`);
      // 비동기로 실행 (동시에 여러 슬롯이 맞아도 순차 처리됨 — isProcessing 플래그)
      triggerSlot(slotKey).catch((e) => log(`[ERROR] 슬롯 트리거 오류 (${slotKey}): ${e?.message}`));
    }
  }
}

// ── 폴링 루프 (수동 실행 요청 처리) ─────────────────────────────────────────

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

  if (INTERNAL_API_SECRET) {
    log("SlotSchedule 모드: 서버에서 슬롯별 스케줄을 직접 읽어 실행합니다.");
  } else {
    log("[WARN] INTERNAL_API_SECRET 미설정 — 슬롯 스케줄 자동 실행 비활성화");
    log("[WARN] .env에 INTERNAL_API_SECRET=<MIGRATION_SECRET값> 을 추가하면 활성화됩니다.");
  }

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

  // heartbeat (30초마다)
  await sendHeartbeat();
  setInterval(async () => {
    await sendHeartbeat().catch(() => {});
  }, 30_000);

  // 수동 요청 폴링 (10초마다)
  setInterval(async () => {
    await poll().catch((e) => log(`[ERROR] poll: ${e?.message}`));
  }, 10_000);

  // 슬롯 스케줄 체크: 다음 정각 분에 맞춰 시작 후 매분 실행
  if (INTERNAL_API_SECRET) {
    // 시작 시 최근 10분 이내 놓친 슬롯 즉시 실행 (재시작으로 인한 누락 방지)
    const catchupMissed = async () => {
      const schedules = await fetchSlotSchedules();
      if (!schedules || typeof schedules !== "object") return;
      const nowKst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
      if (nowKst.getDay() === 0) return;
      const nowMin = nowKst.getHours() * 60 + nowKst.getMinutes();
      for (const [slotKey, sched] of Object.entries(schedules)) {
        if (!sched.enabled) continue;
        const schedMin = sched.hour * 60 + sched.minute;
        const diff = nowMin - schedMin;
        if (diff > 0 && diff <= 10) {
          log(`[스케줄] ${slotKey} → 놓친 슬롯 감지 (${diff}분 전), 즉시 실행`);
          triggerSlot(slotKey).catch((e) => log(`[ERROR] 슬롯 catchup 오류 (${slotKey}): ${e?.message}`));
        }
      }
    };
    catchupMissed().catch((e) => log(`[ERROR] catchup: ${e?.message}`));

    const secsLeft = 60 - new Date().getSeconds();
    log(`슬롯 스케줄 체크 시작까지 ${secsLeft}초 대기...`);
    setTimeout(() => {
      checkSchedules().catch((e) => log(`[ERROR] checkSchedules: ${e?.message}`));
      setInterval(() => {
        checkSchedules().catch((e) => log(`[ERROR] checkSchedules: ${e?.message}`));
      }, 60_000);
    }, secsLeft * 1000);
  }

  // DPS 작업현황 5분마다 자동 스크래핑
  const dpsTarget = FILE_CONFIGS.find((c) => c.slotKey === "dps-status" && c.domScrape);
  if (dpsTarget && INTERNAL_API_SECRET) {
    let dpsRunning = false;
    let dpsInterval = null;

    let waitingForDanpum = false;
    let danpumPollInterval = null;

    // 오늘(KST) 날짜 문자열 반환
    const todayKST = () => new Date().toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    }).replace(/\. /g, "-").replace(".", "");

    // 단품별 파일 등록 여부 확인 (납품예정일 D+1, 토요일 D+2)
    const checkDanpumFile = async () => {
      try {
        const res = await fetch(`${ADMIN_URL}/api/internal/vehicle-daily-check`, {
          headers: { "x-internal-secret": INTERNAL_API_SECRET },
        });
        const json = await res.json();
        return json?.found === true ? json.targetDate : false;
      } catch { return false; }
    };

    const startDpsLoop = () => {
      waitingForDanpum = false;
      if (danpumPollInterval) { clearInterval(danpumPollInterval); danpumPollInterval = null; }
      log("DPS 작업현황 5분 주기 자동 스크래핑 시작");
      runDps();
      dpsInterval = setInterval(runDps, 5 * 60 * 1000);
    };

    const runDps = async () => {
      if (dpsRunning) { log("[DPS] 이전 작업 진행 중, 건너뜀"); return; }
      dpsRunning = true;
      try {
        const result = await scrapeDpsAndPost(dpsTarget, log);
        if (result?.ok && result.zones) {
          const zones = result.zones;
          const allDone = Object.values(zones).length > 0 && Object.values(zones).every((z) => z.total > 0 && z.done >= z.total);
          if (allDone && !waitingForDanpum) {
            clearInterval(dpsInterval);
            dpsInterval = null;
            waitingForDanpum = true;
            log("[DPS] 전체 작업 완료 — 5분 주기 중단. 단품별 파일 등록 대기 시작 (5분 간격 폴링)");
            // 5분마다 단품별 파일 등록 여부 확인
            danpumPollInterval = setInterval(async () => {
              const targetDate = await checkDanpumFile();
              if (targetDate) {
                log(`[DPS] 단품별 파일 등록 감지 (납품예정일 ${targetDate}) — DPS 캐시 초기화 후 재시작`);
                // 캐시 초기화: 대시보드가 즉시 빈 상태로 표시되도록
                await fetch(`${ADMIN_URL}/api/internal/dps-status`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_API_SECRET },
                  body: JSON.stringify({ rows: { zones: {}, dsTotal: 0, loadedCount: 0 }, scrapedAt: new Date().toISOString() }),
                }).catch(() => {});
                startDpsLoop();
              } else {
                log(`[DPS] 단품별 파일 미등록 (납품예정일 대기 중) — 계속 폴링`);
              }
            }, 5 * 60 * 1000);
          }
        }
      } catch (e) {
        log(`[ERROR] DPS 자동 스크래핑: ${e?.message}`);
      } finally {
        dpsRunning = false;
      }
    };

    startDpsLoop();
  }

  log("에이전트 대기 중... (Ctrl+C 로 종료)");
}

main().catch((e) => {
  console.error("[FATAL]", e);
  process.exit(1);
});
