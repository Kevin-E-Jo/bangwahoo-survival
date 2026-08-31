import { NextResponse } from "next/server";
import { getSession } from "@/lib/getSession";
import { withUserContext } from "@/lib/withUserContext";
import { generateRunSeed } from "@/lib/game-logic";

const RUN_SEED_TTL_MS = 30 * 60 * 1000; // 30분 — 이 안에 제출하지 않으면 만료

export async function POST() {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const seed = generateRunSeed();
  const expiresAt = new Date(Date.now() + RUN_SEED_TTL_MS);

  await withUserContext(userId, (tx) =>
    tx.runSeed.create({
      data: { userId, seed, expiresAt },
    }),
  );

  return NextResponse.json({ seed, expiresAt });
}
