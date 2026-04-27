import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { putR2Object, R2_BUCKET } from "@/lib/r2";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH_SIZE = 30;
const R2_PUBLIC_URL = "https://img.dridolabs.com";

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function syncRecord(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sbAdmin: any,
  bucket: string,
  filePath: string,
  recordId: string,
  table: "photos" | "delivery_photos",
  urlField: "original_url" | "public_url",
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  try {
    // Supabase Storage에서 다운로드
    const { data: blob, error: dlErr } = await sbAdmin.storage
      .from(bucket)
      .download(filePath);

    if (dlErr || !blob) {
      return { ok: false, error: dlErr?.message ?? "download failed" };
    }

    const buffer = await blob.arrayBuffer();
    const r2Key = `${bucket}/${filePath}`;

    // R2에 업로드
    await putR2Object(r2Key, Buffer.from(buffer), blob.type || "image/jpeg");

    const newUrl = `${R2_PUBLIC_URL}/${r2Key}`;

    // DB URL 업데이트
    const { error: updateErr } = await sbAdmin
      .from(table)
      .update({ [urlField]: newUrl })
      .eq("id", recordId);

    if (updateErr) {
      return { ok: false, error: `DB update failed: ${updateErr.message}` };
    }

    // Supabase Storage에서 삭제
    await sbAdmin.storage.from(bucket).remove([filePath]);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ ok: false, message: "Missing Supabase env" }, { status: 500 });
  }

  const sbAdmin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let totalOk = 0;
  let totalFail = 0;
  let totalSkip = 0;
  const errors: string[] = [];

  // photos 테이블 처리
  const { data: photoRows } = await sbAdmin
    .from("photos")
    .select("id, original_path, original_url")
    .ilike("original_url", "%supabase%")
    .not("original_path", "is", null)
    .limit(BATCH_SIZE);

  for (const row of photoRows ?? []) {
    if (!row.original_path) { totalSkip++; continue; }
    const res = await syncRecord(
      sbAdmin, "photos", row.original_path, row.id, "photos", "original_url"
    );
    if (res.ok) totalOk++;
    else { totalFail++; errors.push(`photos/${row.id}: ${res.error}`); }
  }

  // delivery_photos 테이블 처리
  const { data: deliveryRows } = await sbAdmin
    .from("delivery_photos")
    .select("id, path, public_url")
    .ilike("public_url", "%supabase%")
    .not("path", "is", null)
    .limit(BATCH_SIZE);

  for (const row of deliveryRows ?? []) {
    if (!row.path) { totalSkip++; continue; }
    const res = await syncRecord(
      sbAdmin, "delivery_photos", row.path, row.id, "delivery_photos", "public_url"
    );
    if (res.ok) totalOk++;
    else { totalFail++; errors.push(`delivery_photos/${row.id}: ${res.error}`); }
  }

  return NextResponse.json({
    ok: true,
    migrated: totalOk,
    failed: totalFail,
    skipped: totalSkip,
    errors: errors.length > 0 ? errors : undefined,
  });
}
