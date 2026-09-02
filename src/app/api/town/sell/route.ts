import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/getSession";
import { withUserContext } from "@/lib/withUserContext";
import { ITEM_KEYS, itemSellPrice } from "@/lib/game-logic";

const bodySchema = z.object({
  itemKey: z.enum(ITEM_KEYS),
  quantity: z.number().int().positive(),
});

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
  const { itemKey, quantity } = parsed.data;
  const proceeds = itemSellPrice(itemKey) * quantity;

  try {
    const result = await withUserContext(userId, async (tx) => {
      // 보유 수량 이상으로 못 팔게 원자적 조건부(where)로 차감 — 동시 요청으로
      // 인한 이중 판매를 막는다 (POST /api/town/upgrade와 같은 패턴).
      const sold = await tx.inventoryItem.updateMany({
        where: { userId, itemKey, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      });
      if (sold.count === 0) {
        return { kind: "insufficient_quantity" as const };
      }

      const row = await tx.inventoryItem.findUnique({
        where: { userId_itemKey: { userId, itemKey } },
      });
      if (row && row.quantity <= 0) {
        await tx.inventoryItem.delete({ where: { userId_itemKey: { userId, itemKey } } });
      }

      const progress = await tx.townProgress.upsert({
        where: { userId },
        update: { currency: { increment: proceeds } },
        create: { userId, currency: proceeds },
      });

      return {
        kind: "ok" as const,
        currency: progress.currency,
        remainingQuantity: row && row.quantity > 0 ? row.quantity : 0,
      };
    });

    if (result.kind === "insufficient_quantity") {
      return NextResponse.json({ error: "insufficient_quantity" }, { status: 400 });
    }

    return NextResponse.json({
      currency: result.currency,
      itemKey,
      soldQuantity: quantity,
      remainingQuantity: result.remainingQuantity,
    });
  } catch (err) {
    console.error("[town/sell]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
