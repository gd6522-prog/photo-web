import { NextRequest } from "next/server";
import { json, requireAdmin } from "../notices/_shared";
import { listR2Keys, putR2Object, getR2ObjectText } from "@/lib/r2";

export const runtime = "nodejs";

const SB_BUCKET = "vehicle-data";
const SB_DAILY_FOLDER = "daily";
const R2_DAILY_PREFIX = "vehicle-data/daily/";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  try {
    // R2에 이미 있는 날짜 목록
    const r2Keys = await listR2Keys(R2_DAILY_PREFIX);
    const r2Dates = new Set(
      r2Keys
        .map((k) => k.replace(R2_DAILY_PREFIX, "").replace(".json", ""))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    );

    // Supabase Storage에서 전체 목록 조회
    const { data: sbFiles, error: listErr } = await guard.sbAdmin.storage
      .from(SB_BUCKET)
      .list(SB_DAILY_FOLDER, { limit: 1000, sortBy: { column: "name", order: "asc" } });

    if (listErr) return json(false, listErr.message, null, 500);

    const candidates = (sbFiles ?? [])
      .map((f) => f.name)
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name));

    const toMigrate = candidates.filter((name) => !r2Dates.has(name.replace(".json", "")));

    const results: Array<{ name: string; status: "ok" | "skip" | "error"; reason?: string }> = [];

    for (const name of candidates) {
      const date = name.replace(".json", "");
      if (r2Dates.has(date)) {
        results.push({ name, status: "skip", reason: "already in R2" });
        continue;
      }

      try {
        const { data: blob, error: dlErr } = await guard.sbAdmin.storage
          .from(SB_BUCKET)
          .download(`${SB_DAILY_FOLDER}/${name}`);

        if (dlErr || !blob) {
          results.push({ name, status: "error", reason: dlErr?.message ?? "download failed" });
          continue;
        }

        const text = await blob.text();

        // JSON 파싱 검증
        JSON.parse(text);

        await putR2Object(`${R2_DAILY_PREFIX}${name}`, text, "application/json");
        results.push({ name, status: "ok" });
      } catch (e) {
        results.push({ name, status: "error", reason: e instanceof Error ? e.message : String(e) });
      }
    }

    const ok = results.filter((r) => r.status === "ok").length;
    const skip = results.filter((r) => r.status === "skip").length;
    const errors = results.filter((r) => r.status === "error");

    return json(true, undefined, {
      total: candidates.length,
      migrated: ok,
      skipped: skip,
      failed: errors.length,
      errors,
      toMigrate: toMigrate.length,
    });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
