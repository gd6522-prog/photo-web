import { NextRequest } from "next/server";
import { getViewPresignedUrl } from "@/lib/r2";

export const runtime = "nodejs";

/**
 * R2 이미지 프록시 — 공개 접근 없이도 signed URL로 이미지 서빙
 * GET /api/r2/image?key=hazard-reports/notices/...
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!key) return new Response("Missing key", { status: 400 });

  try {
    const signedUrl = await getViewPresignedUrl(key, 3600);
    return Response.redirect(signedUrl, 302);
  } catch {
    return new Response("Image not found", { status: 404 });
  }
}
