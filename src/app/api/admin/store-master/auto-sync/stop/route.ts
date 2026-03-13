import { NextResponse } from "next/server";
import { stopSyncProcess } from "@/lib/local-store-master-sync";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await stopSyncProcess();
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}
