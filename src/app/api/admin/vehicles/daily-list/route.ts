import { NextRequest } from "next/server";
import { json, requireAdmin } from "../../notices/_shared";
import { listR2Keys, getR2ObjectText } from "@/lib/r2";

export const runtime = "nodejs";

const DAILY_PREFIX = "vehicle-data/daily/";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const dateParam = req.nextUrl.searchParams.get("date");

  try {
    if (dateParam) {
      // 특정 날짜 파일명 조회
      const key = `${DAILY_PREFIX}${dateParam}.json`;
      const text = await getR2ObjectText(key);
      if (!text) return json(false, "파일 없음", null, 404);
      const snap = JSON.parse(text) as { fileName?: string; uploadedAt?: string };
      return json(true, undefined, { fileName: snap.fileName ?? "", uploadedAt: snap.uploadedAt ?? "" });
    }

    // 전체 날짜 목록
    const allKeys = await listR2Keys(DAILY_PREFIX);
    const dates = allKeys
      .filter((k) => /vehicle-data\/daily\/\d{4}-\d{2}-\d{2}\.json$/.test(k))
      .map((k) => k.replace(DAILY_PREFIX, "").replace(".json", ""))
      .sort();

    return json(true, undefined, { dates });
  } catch (e) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
