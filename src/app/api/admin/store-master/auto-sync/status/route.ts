import { NextResponse } from "next/server";
import { getSyncStatus } from "@/lib/local-store-master-sync";

export const runtime = "nodejs";

export async function GET() {
  const status = await getSyncStatus();
  return NextResponse.json({ ok: true, ...status });
}
