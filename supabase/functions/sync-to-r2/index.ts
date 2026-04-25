import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";

const SYNC_SECRET = Deno.env.get("SYNC_SECRET") ?? "";
const R2_PUBLIC_URL = "https://img.dridolabs.com";

Deno.serve(async (req) => {
  // 공유 시크릿 검증
  const secret = req.headers.get("x-sync-secret") ?? "";
  if (!secret || secret !== SYNC_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { table, record } = payload;
  if (!table || !record?.id) {
    return new Response("Missing table or record", { status: 400 });
  }

  // 테이블별 설정
  let bucket: string;
  let filePath: string;
  let urlField: string;

  if (table === "delivery_photos") {
    bucket = "delivery_photos";
    filePath = record.path;
    urlField = "public_url";
  } else if (table === "photos") {
    bucket = "photos";
    filePath = record.original_path;
    urlField = "original_url";
  } else {
    return new Response("Unknown table", { status: 400 });
  }

  if (!filePath) {
    return new Response("Missing file path", { status: 400 });
  }

  // 이미 R2 URL이면 스킵
  const currentUrl: string = record[urlField] ?? "";
  if (currentUrl.includes("r2.dev")) {
    return new Response(JSON.stringify({ skipped: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Supabase Storage에서 다운로드
  const { data: blob, error: dlErr } = await supabase.storage
    .from(bucket)
    .download(filePath);

  if (dlErr || !blob) {
    return new Response(
      JSON.stringify({ error: dlErr?.message ?? "download failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // R2에 업로드
  const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
      secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
    },
  });

  const r2Key = `${bucket}/${filePath}`;
  const buffer = await blob.arrayBuffer();

  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: Deno.env.get("R2_BUCKET")!,
        Key: r2Key,
        Body: new Uint8Array(buffer),
        ContentType: blob.type || "image/jpeg",
      })
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: `R2 upload failed: ${e?.message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const newUrl = `${R2_PUBLIC_URL}/${r2Key}`;

  // DB URL 업데이트
  const { error: updateErr } = await supabase
    .from(table)
    .update({ [urlField]: newUrl })
    .eq("id", record.id);

  if (updateErr) {
    return new Response(
      JSON.stringify({ error: updateErr.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Supabase Storage에서 삭제
  await supabase.storage.from(bucket).remove([filePath]);

  return new Response(
    JSON.stringify({ ok: true, r2Key, newUrl }),
    { headers: { "Content-Type": "application/json" } }
  );
});
