import { NextRequest, NextResponse } from "next/server";

/**
 * Supabase가 브라우저에 저장하는 세션 쿠키 이름 패턴:
 *   sb-<project-ref>-auth-token  또는  sb-<project-ref>-auth-token.0 (분할 쿠키)
 * 쿠키가 존재하면 "로그인된 상태"로 간주해 서버사이드 리다이렉트를 수행합니다.
 * (토큰 만료 여부는 클라이언트에서 2차 검증)
 */
function hasSupabaseSession(req: NextRequest) {
  return [...req.cookies.getAll()].some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 루트("/")만 처리
  if (pathname !== "/") return NextResponse.next();

  if (hasSupabaseSession(req)) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/"],
};
