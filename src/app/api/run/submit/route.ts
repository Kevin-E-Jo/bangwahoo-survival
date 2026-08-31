import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getSession } from "@/lib/getSession";
import { withUserContext } from "@/lib/withUserContext";
import { computeRunRewards } from "@/lib/game-logic";

const bodySchema = z.object({
  seed: z.string().min(1),
  wavesCleared: z.number().int().nonnegative(),
  result: z.enum(["cleared", "died"]),
  elapsedMs: z.number().int().nonnegative(),
  // 클라이언트가 주장하는 획득 아이템 — 감사 로그(clientResult)에만 저장하고
  // 보상 계산에는 절대 쓰지 않는다. 실제 보상은 seed로 서버가 독립 재계산한다.
  collectedItems: z.array(z.unknown()).optional(),
});

async function reject(
  userId: string,
  seed: string,
  clientResult: unknown,
  reason: string,
  status: number,
) {
  await withUserContext(userId, (tx) =>
    tx.runSubmission.create({
      data: {
        userId,
        seed,
        status: "REJECTED",
        clientResult: (clientResult ?? {}) as Prisma.InputJsonValue,
        rejectReason: reason,
      },
    }),
  );
  return NextResponse.json({ error: reason }, { status });
}

export async function POST(request: Request) {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { seed, wavesCleared } = parsed.data;

  const runSeed = await withUserContext(userId, (tx) =>
    tx.runSeed.findUnique({ where: { seed } }),
  );

  if (!runSeed || runSeed.userId !== userId) {
    return reject(userId, seed, rawBody, "seed_not_found", 400);
  }
  if (runSeed.status !== "ISSUED") {
    return reject(userId, seed, rawBody, "seed_already_used", 409);
  }
  if (runSeed.expiresAt.getTime() < Date.now()) {
    await withUserContext(userId, (tx) =>
      tx.runSeed.updateMany({
        where: { id: runSeed.id, status: "ISSUED" },
        data: { status: "EXPIRED" },
      }),
    );
    return reject(userId, seed, rawBody, "seed_expired", 400);
  }

  const reward = computeRunRewards(seed, wavesCleared);

  const outcome = await withUserContext(userId, async (tx) => {
    // 동시 이중 제출 방지 — ISSUED 상태일 때만 소비 처리.
    const consumed = await tx.runSeed.updateMany({
      where: { id: runSeed.id, status: "ISSUED" },
      data: { status: "CONSUMED", consumedAt: new Date() },
    });
    if (consumed.count === 0) {
      return { kind: "conflict" as const };
    }

    await tx.townProgress.upsert({
      where: { userId },
      update: { currency: { increment: reward.currency } },
      create: { userId, currency: reward.currency },
    });

    for (const item of reward.items) {
      await tx.inventoryItem.upsert({
        where: { userId_itemKey: { userId, itemKey: item.itemKey } },
        update: { quantity: { increment: item.quantity } },
        create: { userId, itemKey: item.itemKey, quantity: item.quantity },
      });
    }

    await tx.runSubmission.create({
      data: {
        userId,
        seed,
        status: "VERIFIED",
        clientResult: rawBody as Prisma.InputJsonValue,
        verifiedReward: reward as unknown as Prisma.InputJsonValue,
      },
    });

    return { kind: "ok" as const };
  });

  if (outcome.kind === "conflict") {
    return reject(userId, seed, rawBody, "seed_already_used", 409);
  }

  return NextResponse.json({ verified: true, reward });
}
