/**
 * 점포마스터 동기화 에이전트
 *
 * Supabase의 store_master_sync_log 테이블에서 pending 요청을 감지하면
 * sync-store-master-from-elogis.mjs를 실행하고 결과를 업데이트한다.
 *
 * Windows 작업 스케줄러에서 5분마다 실행:
 *   scripts/setup-scheduler.ps1
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env.local");
const SYNC_SCRIPT = path.join(__dirname, "sync-store-master-from-elogis.mjs");

function log(msg) {
  const stamp = new Date().toLocaleString("ko-KR");
  console.log(`[${stamp}] ${msg}`);
}

function loadEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key) env[key] = value;
  }
  return env;
}

async function runSyncScript() {
  const lines = [];
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SYNC_SCRIPT], {
      cwd: ROOT_DIR,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (data) => {
      const text = data.toString();
      process.stdout.write(text);
      lines.push(...text.split(/\r?\n/).filter(Boolean));
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      process.stderr.write(text);
      lines.push(...text.split(/\r?\n/).filter(Boolean));
    });

    child.on("close", (code) => {
      if (code === 0) resolve(null);
      else reject(new Error(`동기화 스크립트가 코드 ${code}로 종료되었습니다.`));
    });

    child.on("error", reject);
  });

  return lines;
}

async function main() {
  const env = { ...process.env, ...loadEnvFile(ENV_PATH) };
  Object.assign(process.env, loadEnvFile(ENV_PATH));

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    log(".env.local에 Supabase 설정이 없습니다.");
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 이미 실행 중인 동기화가 있는지 확인
  const { data: running } = await supabase
    .from("store_master_sync_log")
    .select("id")
    .eq("status", "running")
    .limit(1);

  if (running && running.length > 0) {
    log("이미 동기화가 실행 중입니다. 건너뜁니다.");
    return;
  }

  // 대기 중인 요청 확인
  const { data: pending } = await supabase
    .from("store_master_sync_log")
    .select("id")
    .eq("status", "pending")
    .order("requested_at", { ascending: true })
    .limit(1);

  if (!pending || pending.length === 0) {
    log("대기 중인 동기화 요청이 없습니다.");
    return;
  }

  const syncId = pending[0].id;
  log(`동기화 요청 처리 시작 (id=${syncId})`);

  // running으로 변경
  await supabase
    .from("store_master_sync_log")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", syncId);

  try {
    const logLines = await runSyncScript();

    await supabase
      .from("store_master_sync_log")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
        log_tail: logLines.slice(-60),
      })
      .eq("id", syncId);

    log("동기화 완료.");
  } catch (error) {
    const msg = error?.message ?? String(error);
    log(`동기화 실패: ${msg}`);

    await supabase
      .from("store_master_sync_log")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_text: msg,
      })
      .eq("id", syncId);
  }
}

main().catch((error) => {
  console.error(`[에이전트 오류] ${error?.message ?? error}`);
  process.exitCode = 1;
});
