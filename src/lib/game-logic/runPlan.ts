import { createRng, rngInt } from "./seed";

/** 정확히 3라운드 고정 — 1·2라운드는 일반 웨이브, 3라운드는 적 수를 늘리고
 * 엘리트 1마리를 섞어 마무리를 짓는다. rewards.ts의 라운드별 보상 규칙과
 * 인덱스가 대응된다. */
export const ROUND_COUNT = 3;

export interface RoundPlan {
  enemyCount: number;
  eliteCount: number;
}

export interface RunPlan {
  seed: string;
  rounds: readonly RoundPlan[];
}

/**
 * seed로부터 이번 런의 라운드 구성(적 수)을 결정한다. 순수 함수 — 같은
 * seed는 항상 같은 plan을 낸다. DungeonScene(클라이언트)과
 * /api/run/submit(서버)이 반드시 이 함수를 통해서만 라운드 구성을 얻어야
 * 한다.
 */
export function generateRunPlan(seed: string): RunPlan {
  const rng = createRng(seed, "rounds");
  const rounds: RoundPlan[] = [
    { enemyCount: rngInt(rng, 3, 4), eliteCount: 0 },
    { enemyCount: rngInt(rng, 4, 5), eliteCount: 0 },
    { enemyCount: rngInt(rng, 3, 4), eliteCount: 1 },
  ];
  return { seed, rounds };
}
