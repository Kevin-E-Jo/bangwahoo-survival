import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";

/** API 라우트/서버 컴포넌트에서 쓰는 인증 확인 지점. 세션 쿠키를 DB의
 * Session row와 대조해 만료 여부까지 검증한다 — 미들웨어의 쿠키 존재 여부
 * 체크는 리다이렉트용 UX일 뿐, 실제 권한 검증은 항상 여기서 한다. */
export function getSession() {
  return getServerSession(authOptions);
}
