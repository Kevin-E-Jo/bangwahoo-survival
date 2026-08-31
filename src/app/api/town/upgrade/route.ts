import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/getSession";
import { withUserContext } from "@/lib/withUserContext";
import { UPGRADE_TYPES, getUpgradeCost, UPGRADE_CONFIG } from "@/lib/game-logic";

const bodySchema = z.object({
  upgradeType: z.enum(UPGRADE_TYPES),
});

const LEVEL_FIELD = {
  weaponDamage: "weaponDamageLevel",
  weaponAmmo: "weaponAmmoLevel",
} as const;

export async function POST(request: Request) {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { upgradeType } = parsed.data;
  const levelField = LEVEL_FIELD[upgradeType];
  const maxLevel = UPGRADE_CONFIG[upgradeType].maxLevel;

  try {
    const result = await withUserContext(userId, async (tx) => {
      const progress = await tx.townProgress.upsert({
        where: { userId },
        update: {},
        create: { userId },
      });
      const currentLevel = progress[levelField];

      if (currentLevel >= maxLevel) {
        return { kind: "max_level" as const };
      }

      const cost = getUpgradeCost(upgradeType, currentLevel);
      if (progress.currency < cost) {
        return { kind: "insufficient_funds" as const, cost };
      }

      // 동시 요청으로 인한 이중 차감을 막기 위해 조건부(where)로 원자적 갱신.
      const updateResult = await tx.townProgress.updateMany({
        where: { userId, currency: { gte: cost }, [levelField]: currentLevel },
        data: { currency: { decrement: cost }, [levelField]: { increment: 1 } },
      });

      if (updateResult.count === 0) {
        return { kind: "conflict" as const };
      }

      const updated = await tx.townProgress.findUniqueOrThrow({ where: { userId } });
      return { kind: "ok" as const, progress: updated };
    });

    if (result.kind === "max_level") {
      return NextResponse.json({ error: "max_level_reached" }, { status: 400 });
    }
    if (result.kind === "insufficient_funds") {
      return NextResponse.json(
        { error: "insufficient_funds", cost: result.cost },
        { status: 400 },
      );
    }
    if (result.kind === "conflict") {
      return NextResponse.json({ error: "conflict_retry" }, { status: 409 });
    }

    return NextResponse.json({
      currency: result.progress.currency,
      upgradeType,
      newLevel: result.progress[levelField],
    });
  } catch (err) {
    console.error("[town/upgrade]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
