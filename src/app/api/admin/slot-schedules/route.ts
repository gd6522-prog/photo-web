import { NextRequest } from "next/server";
import { getR2ObjectText, putR2Object } from "@/lib/r2";
import { requireAdmin, json } from "../notices/_shared";

export const runtime = "nodejs";

const R2_KEY = "file-uploads/slot-schedules.json";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const text = await getR2ObjectText(R2_KEY);
  const schedules = text ? JSON.parse(text) : {};
  return json(true, undefined, { schedules, isMainAdmin: guard.isMainAdmin });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;
  if (!guard.isMainAdmin) return json(false, "메인관리자만 스케줄을 수정할 수 있습니다.", null, 403);

  const body = await req.json().catch(() => null);
  if (!body || typeof body.schedules !== "object") return json(false, "schedules 필드가 필요합니다.", null, 400);

  await putR2Object(R2_KEY, JSON.stringify(body.schedules), "application/json");
  return json(true, undefined, { schedules: body.schedules });
}
