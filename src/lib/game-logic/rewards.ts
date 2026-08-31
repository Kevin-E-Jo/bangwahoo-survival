import { createRng, rngInt, rngPick } from "./seed";
import { generateRunPlan } from "./runPlan";
import type { NodeType } from "./nodemap";
import { ITEM_KEYS, type ItemKey } from "./catalog";

interface NodeRewardRule {
  currency: readonly [min: number, max: number];
  itemChance: number; // 0..1
  possibleItems: readonly ItemKey[];
}

const NODE_REWARD_RULES: Record<NodeType, NodeRewardRule> = {
  combat: { currency: [8, 15], itemChance: 0.5, possibleItems: ["part_spring", "part_barrel"] },
  elite: {
    currency: [20, 35],
    itemChance: 0.9,
    possibleItems: ["part_spring", "part_barrel", "part_scope"],
  },
  loot: { currency: [15, 25], itemChance: 1, possibleItems: ITEM_KEYS },
  rest: { currency: [0, 0], itemChance: 0, possibleItems: [] },
};

export type RunResult = "cleared" | "died";

export interface RunRewards {
  currency: number;
  items: { itemKey: ItemKey; quantity: number }[];
}

/**
 * seed + 실제로 클리어한 웨이브 수로부터 보상을 서버가 독립적으로 재계산한다.
 * 클라이언트가 주장하는 아이템/재화 값은 절대 신뢰하지 않는다 — wavesCleared만
 * (템플릿 길이로 clamp한 뒤) 입력으로 쓰고, 나머지는 이 함수가 seed로부터
 * 전부 다시 굴린다. 죽어서 런이 끝난 경우("died") 아직 클리어하지 못한
 * 웨이브의 보상은 clamp된 wavesCleared에 애초에 포함되지 않으므로 자연히
 * 손실 처리된다 (소프트 페널티) — result 자체는 계산에 필요 없다.
 */
export function computeRunRewards(seed: string, wavesCleared: number): RunRewards {
  const plan = generateRunPlan(seed);
  const clearedCount = Math.max(0, Math.min(wavesCleared, plan.waveCount));

  const rng = createRng(seed, "rewards");
  let currency = 0;
  const itemTotals = new Map<ItemKey, number>();

  for (let i = 0; i < clearedCount; i++) {
    const nodeType = plan.nodes[i];
    const rule = NODE_REWARD_RULES[nodeType];
    currency += rngInt(rng, rule.currency[0], rule.currency[1]);
    if (rule.possibleItems.length > 0 && rng() < rule.itemChance) {
      const item = rngPick(rng, rule.possibleItems);
      itemTotals.set(item, (itemTotals.get(item) ?? 0) + 1);
    }
  }

  return {
    currency,
    items: Array.from(itemTotals, ([itemKey, quantity]) => ({ itemKey, quantity })),
  };
}
