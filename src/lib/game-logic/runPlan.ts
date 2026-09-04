import { createRng, rngInt, rngPick } from "./seed";

/** 정확히 3라운드 고정 — 1·2라운드는 일반 웨이브, 3라운드는 적 수를 늘리고
 * 엘리트 1마리를 섞어 마무리를 짓는다. rewards.ts의 라운드별 보상 규칙과
 * 인덱스가 대응된다. */
export const ROUND_COUNT = 3;

/** 엘리트(보스)를 제외한 "일반 몹" 유형. 각 유형의 스탯·거동은
 * DungeonScene 소관 — 여기서는 라운드마다 어떤 유형이 몇 마리 나오는지만
 * 결정한다(보상 계산과 무관해 서버 재검증 대상이 아니다). */
export type EnemyArchetype = "normal" | "tank" | "speedster" | "roller";

// 라운드가 진행될수록 새 유형을 섞어 소개한다.
const ARCHETYPE_POOLS: Record<number, readonly EnemyArchetype[]> = {
  0: ["normal", "normal", "normal", "tank", "speedster"],
  1: ["normal", "normal", "tank", "speedster", "roller"],
  2: ["normal", "tank", "speedster", "roller"],
};

export interface RoundPlan {
  enemyCount: number;
  eliteCount: number;
  /** 엘리트를 제외한 일반 몹 스폰 슬롯마다 하나씩, `enemyCount`와 길이가 같다. */
  archetypes: readonly EnemyArchetype[];
}

export interface RunPlan {
  seed: string;
  rounds: readonly RoundPlan[];
}

/**
 * seed로부터 이번 런의 라운드 구성(적 수·유형)을 결정한다. 순수 함수 —
 * 같은 seed는 항상 같은 plan을 낸다. DungeonScene(클라이언트)과
 * /api/run/submit(서버)이 반드시 이 함수를 통해서만 라운드 구성을 얻어야
 * 한다.
 */
export function generateRunPlan(seed: string): RunPlan {
  const rng = createRng(seed, "rounds");
  const enemyCounts = [rngInt(rng, 3, 4), rngInt(rng, 4, 5), rngInt(rng, 3, 4)];
  const eliteCounts = [0, 0, 1];

  const rounds: RoundPlan[] = enemyCounts.map((enemyCount, i) => ({
    enemyCount,
    eliteCount: eliteCounts[i],
    archetypes: Array.from({ length: enemyCount }, () => rngPick(rng, ARCHETYPE_POOLS[i])),
  }));
  return { seed, rounds };
}
