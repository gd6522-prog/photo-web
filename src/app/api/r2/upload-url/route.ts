import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getUploadPresignedUrl, R2_BUCKET } from "@/lib/r2";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// R2 Public Dev URL - 사진 조회용
export const R2_PUBLIC_URL = "https://pub-2ed566ac41944f778e208a0ccea9acd5.r2.dev";

const ALLOWED_BUCKETS = ["photos", "delivery_photos", "hazard-reports"] as const;

function sanitizeKey(key: string) {
  return key.replace(/[^\w.\-\/]/g, "_").replace(/^\/+/, "");
}

function guessContentType(ext: string) {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic" || ext === "heif") return "image/heic";
  return "image/jpeg";
}

function json(status: number, data: unknown) {
  return NextResponse.json(data, { status });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json(401, { ok: false, message: "Unauthorized" });

  // 사용자 인증 (관리자 아닌 일반 사용자도 허용)
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: userData, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !userData?.user) return json(401, { ok: false, message: "Invalid token" });

  try {
    const body = (await req.json().catch(() => ({}))) as {
      bucket?: string;
      path?: string;
      contentType?: string;
      ext?: string;
    };

    const bucket = String(body.bucket ?? "photos");
    if (!ALLOWED_BUCKETS.includes(bucket as typeof ALLOWED_BUCKETS[number])) {
      return json(400, { ok: false, message: "Invalid bucket" });
    }

    if (!body.path) return json(400, { ok: false, message: "path required" });

    const key = `${bucket}/${sanitizeKey(body.path)}`;
    const ext = (body.ext ?? body.path.split(".").pop() ?? "jpg").toLowerCase();
    const contentType = body.contentType ?? guessContentType(ext);

    const uploadUrl = await getUploadPresignedUrl(key, contentType);
    const publicUrl = `${R2_PUBLIC_URL}/${key}`;

    return json(200, { ok: true, uploadUrl, publicUrl, key, bucket: R2_BUCKET });
  } catch (e) {
    return json(500, { ok: false, message: e instanceof Error ? e.message : String(e) });
  }
}
