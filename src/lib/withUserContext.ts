import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * user_id 격리를 위한 RLS 세션 변수 브릿지.
 *
 * 이 프로젝트는 Supabase Auth가 아니라 Auth.js로 인증하므로 Postgres의
 * auth.uid()는 채워지지 않는다 (블루프린트가 가정한 auth.uid() 기반 RLS는
 * 이 인증 방식과 맞지 않는다). 대신 매 요청마다 트랜잭션 안에서
 * `set_config('app.user_id', ...)`로 세션 변수를 세팅하고, RLS 정책은 그
 * 값을 기준으로 행을 필터링한다 (supabase/rls.sql 참고).
 *
 * user_id가 실린 모든 쿼리는 반드시 이 함수로 감싼 tx를 통해 실행해야
 * RLS가 적용된다 — 최상위 prisma 클라이언트로 직접 쿼리하면 세션 변수가
 * 세팅되지 않는다.
 */
export function withUserContext<T>(
  userId: string,
  fn: (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}
