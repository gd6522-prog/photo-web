import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export type SyncState = {
  pid: number;
  startedAt: string;
  logPath: string;
};

const ROOT_DIR = process.cwd();
const AUTOMATION_DIR = path.join(ROOT_DIR, ".automation");
const STATE_DIR = path.join(AUTOMATION_DIR, "state");
const LOG_DIR = path.join(AUTOMATION_DIR, "logs");
const SCRIPT_PATH = path.join(ROOT_DIR, "scripts", "sync-store-master-from-elogis.mjs");
const STATE_PATH = path.join(STATE_DIR, "store-master-sync.json");

export async function ensureSyncDirs() {
  await fsp.mkdir(STATE_DIR, { recursive: true });
  await fsp.mkdir(LOG_DIR, { recursive: true });
}

export function isLocalAutomationSupported() {
  return !process.env.VERCEL;
}

export async function readSyncState(): Promise<SyncState | null> {
  try {
    const raw = await fsp.readFile(STATE_PATH, "utf8");
    return JSON.parse(raw) as SyncState;
  } catch {
    return null;
  }
}

export async function writeSyncState(state: SyncState) {
  await ensureSyncDirs();
  await fsp.writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

export async function clearSyncState() {
  try {
    await fsp.unlink(STATE_PATH);
  } catch {}
}

export function isPidRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function getSyncStatus() {
  if (!isLocalAutomationSupported()) {
    return {
      supported: false,
      running: false,
      pid: null,
      startedAt: null,
      logPath: null,
      logTail: [] as string[],
    };
  }

  const state = await readSyncState();
  if (!state) {
    return {
      supported: true,
      running: false,
      pid: null,
      startedAt: null,
      logPath: null,
      logTail: [] as string[],
    };
  }

  const running = isPidRunning(state.pid);
  const logTail = await readLogTail(state.logPath, 40);
  if (!running) await clearSyncState();

  return {
    supported: true,
    running,
    pid: running ? state.pid : null,
    startedAt: running ? state.startedAt : state.startedAt,
    logPath: state.logPath,
    logTail,
  };
}

async function readLogTail(logPath: string, maxLines: number) {
  try {
    const raw = await fsp.readFile(logPath, "utf8");
    return raw.split(/\r?\n/).filter(Boolean).slice(-maxLines);
  } catch {
    return [];
  }
}

export async function startSyncProcess() {
  if (!isLocalAutomationSupported()) {
    throw new Error("배포 환경에서는 내부망 자동화를 실행할 수 없습니다. 이 PC에서 실행 중인 로컬 관리자에서만 가능합니다.");
  }

  await ensureSyncDirs();
  const current = await readSyncState();
  if (current && isPidRunning(current.pid)) {
    return {
      started: false,
      alreadyRunning: true,
      pid: current.pid,
      logPath: current.logPath,
    };
  }

  if (!fs.existsSync(SCRIPT_PATH)) {
    throw new Error(`자동화 스크립트를 찾지 못했습니다: ${SCRIPT_PATH}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(LOG_DIR, `store-master-sync-${stamp}.log`);
  const outFd = fs.openSync(logPath, "a");

  const child = spawn(process.execPath, [SCRIPT_PATH], {
    cwd: ROOT_DIR,
    detached: true,
    windowsHide: false,
    stdio: ["ignore", outFd, outFd],
    env: process.env,
  });

  child.unref();
  await writeSyncState({
    pid: child.pid ?? 0,
    startedAt: new Date().toISOString(),
    logPath,
  });

  return {
    started: true,
    alreadyRunning: false,
    pid: child.pid ?? 0,
    logPath,
  };
}

export async function stopSyncProcess() {
  if (!isLocalAutomationSupported()) {
    throw new Error("배포 환경에서는 로컬 자동화 중단을 사용할 수 없습니다.");
  }

  const current = await readSyncState();
  if (!current) {
    return { stopped: false, reason: "not_running" as const };
  }

  if (current.pid && isPidRunning(current.pid)) {
    try {
      process.kill(current.pid, "SIGKILL");
    } catch {
      try {
        process.kill(current.pid);
      } catch {}
    }
  }

  await clearSyncState();
  return { stopped: true, reason: "stopped" as const };
}
