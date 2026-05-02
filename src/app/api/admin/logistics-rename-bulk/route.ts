import { NextRequest } from "next/server";
import { json, requireAdmin } from "../notices/_shared";
import {
  deleteR2Object,
  getR2ObjectBuffer,
  getR2ObjectText,
  listR2Keys,
  putR2Object,
} from "@/lib/r2";

export const runtime = "nodejs";

const PREFIX = "file-uploads/logistics-cost-by-store/";
const META_KEY = "file-uploads/logistics-cost-by-store.meta";
const NEW_LABEL = "물류비조회_작업구분별";
// 점포별물류비조회 는 D-2 데이터를 다운로드 → 다운로드 일자에서 2일 빼면 납품예정일
const DAYS_OFFSET = -2;

const XLSX_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type RenamePlan = {
  oldKey: string;
  oldFileName: string;
  newKey: string;
  newFileName: string;
  oldDate: string;
  newDate: string;
  reason?: string;
};

function shiftYmd(yyyymmdd: string, days: number): string {
  if (!/^\d{8}$/.test(yyyymmdd)) return "";
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function buildPlan(keys: string[]): { plans: RenamePlan[]; skipped: { key: string; reason: string }[] } {
  const plans: RenamePlan[] = [];
  const skipped: { key: string; reason: string }[] = [];

  for (const oldKey of keys) {
    const oldFileName = oldKey.replace(PREFIX, "");
    if (!oldFileName.endsWith(".xlsx") && !oldFileName.endsWith(".xls")) {
      skipped.push({ key: oldKey, reason: "엑셀 파일 아님" });
      continue;
    }
    const m = oldFileName.match(/_(\d{8})_(\d{6})\.xlsx?$/);
    if (!m) {
      skipped.push({ key: oldKey, reason: "_YYYYMMDD_HHMMSS 패턴 없음" });
      continue;
    }
    const oldDate = m[1];
    const time = m[2];
    const newDate = shiftYmd(oldDate, DAYS_OFFSET);
    if (!newDate) {
      skipped.push({ key: oldKey, reason: "날짜 계산 실패" });
      continue;
    }
    const ext = oldFileName.endsWith(".xls") ? ".xls" : ".xlsx";
    const newFileName = `${NEW_LABEL}_${newDate}_${time}${ext}`;
    const newKey = `${PREFIX}${newFileName}`;

    if (oldKey === newKey) {
      skipped.push({ key: oldKey, reason: "이미 새 패턴" });
      continue;
    }
    plans.push({ oldKey, oldFileName, newKey, newFileName, oldDate, newDate });
  }

  return { plans, skipped };
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    const keys = await listR2Keys(PREFIX);
    const { plans, skipped } = buildPlan(keys);
    return json(true, undefined, {
      mode: "dry-run",
      total: keys.length,
      toRename: plans.length,
      skippedCount: skipped.length,
      plans,
      skipped,
    });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  let body: { confirm?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }

  if (body.confirm !== true) {
    return json(false, "confirm:true 가 필요합니다", null, 400);
  }

  try {
    const keys = await listR2Keys(PREFIX);
    const { plans, skipped } = buildPlan(keys);

    const results: { plan: RenamePlan; ok: boolean; error?: string }[] = [];

    for (const plan of plans) {
      try {
        const buf = await getR2ObjectBuffer(plan.oldKey);
        if (!buf) throw new Error("원본 파일 다운로드 실패");
        await putR2Object(plan.newKey, buf, XLSX_CT);
        await deleteR2Object(plan.oldKey);
        results.push({ plan, ok: true });
      } catch (e) {
        results.push({ plan, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // 메타데이터의 fileName 도 최신 파일에 맞춰 갱신 (있으면)
    const successPlans = results.filter((r) => r.ok).map((r) => r.plan);
    let metaUpdated: { from: string; to: string } | null = null;
    if (successPlans.length > 0) {
      const metaText = await getR2ObjectText(META_KEY);
      if (metaText) {
        try {
          const meta = JSON.parse(metaText) as { fileName?: string };
          if (meta.fileName) {
            // 메타가 가리키던 옛 파일이 plans 에 있으면 새 파일명으로 교체
            const matched = successPlans.find((p) => p.oldFileName === meta.fileName);
            if (matched) {
              const newMeta = { ...meta, fileName: matched.newFileName };
              await putR2Object(META_KEY, JSON.stringify(newMeta), "application/json");
              metaUpdated = { from: meta.fileName, to: matched.newFileName };
            }
          }
        } catch { /* meta parse 실패 무시 */ }
      }
    }

    return json(true, undefined, {
      mode: "executed",
      total: keys.length,
      attempted: plans.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      skippedCount: skipped.length,
      results,
      skipped,
      metaUpdated,
    });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
