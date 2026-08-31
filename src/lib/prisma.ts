import { PrismaClient } from "@prisma/client";

// Next.js 개발 모드 hot-reload 시 커넥션이 계속 새로 생기는 것을 막기 위한
// 표준 싱글턴 패턴.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
