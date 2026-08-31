import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 세션 없이 /town, /play 접근 시 /login으로 리다이렉트 (블루프린트 「씬별
// 담당」 참고). database 세션 전략에서 Edge 미들웨어는 DB를 직접 조회할 수
// 없으므로, 여기서는 세션 쿠키 존재 여부만 빠르게 확인하는 UX용 리다이렉트다.
// 쿠키가 위조됐거나 만료된 경우까지 걸러내는 실제 권한 검증은 각 API
// 라우트/서버 컴포넌트가 getSession()으로 DB 대조해서 처리한다
// (src/lib/getSession.ts).
const PROTECTED_PATHS = ["/town", "/play"];
const SESSION_COOKIE_NAMES = [
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  if (!isProtected) {
    return NextResponse.next();
  }

  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) =>
    request.cookies.has(name),
  );
  if (!hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/town/:path*", "/play/:path*"],
};
