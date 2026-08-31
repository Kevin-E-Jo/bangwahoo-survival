import { NextResponse } from "next/server";
import { getSession } from "@/lib/getSession";
import { withUserContext } from "@/lib/withUserContext";
import { getUpgradeCost, UPGRADE_CONFIG, UPGRADE_TYPES } from "@/lib/game-logic";

export async function GET() {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { progress, inventory } = await withUserContext(userId, async (tx) => {
    const progress = await tx.townProgress.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    const inventory = await tx.inventoryItem.findMany({
      where: { userId },
      select: { itemKey: true, quantity: true },
    });
    return { progress, inventory };
  });

  const upgrades = Object.fromEntries(
    UPGRADE_TYPES.map((type) => {
      const level = type === "weaponDamage" ? progress.weaponDamageLevel : progress.weaponAmmoLevel;
      const maxLevel = UPGRADE_CONFIG[type].maxLevel;
      return [
        type,
        {
          level,
          maxLevel,
          nextCost: level < maxLevel ? getUpgradeCost(type, level) : null,
        },
      ];
    }),
  );

  return NextResponse.json({
    currency: progress.currency,
    upgrades,
    inventory,
  });
}
