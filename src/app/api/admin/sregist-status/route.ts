import { NextRequest } from "next/server";
import { json, requireAdmin } from "../notices/_shared";
import { sregist } from "@/lib/sregist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;

    const autoRegisterEnabled = String(process.env.SREGIST_AUTO_REGISTER ?? "").trim().toLowerCase() === "true";
    const r = await sregist.healthCheck();

    return json(true, undefined, {
      autoRegisterEnabled,
      reachable: r.ok,
      message: r.message,
    });
  } catch (e: unknown) {
    return json(false, e instanceof Error ? e.message : String(e), null, 500);
  }
}
