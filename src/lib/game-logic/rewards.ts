import { createRng, rngInt, rngPick } from "./seed";
import { ROUND_COUNT } from "./runPlan";
import { itemsByTier, type ItemKey } from "./catalog";

interface RoundRewardRule {
  currency: readonly [min: number, max: number];
  itemChance: number; // 0..1
  possibleItems: readonly ItemKey[];
  bonusChance?: number; // 0..1 — 3라운드 전용 고티어 보너스 굴림
  bonusItems?: readonly ItemKey[];
}

// 티어 목록 자체는 catalog.ts 소관. 1·2라운드는 흔함·보통만 나오고,
// 3라운드는 같은 확률 위에 희귀·레전드 보너스를 한 번 더 굴린다.
const COMMON_UNCOMMON = [...itemsByTier("common"), ...itemsByTier("uncommon")];
const RARE_LEGEND = [...itemsByTier("rare"), ...itemsByTier("legend")];

// 아이템 드랍률 감소(blueprint#expansion2 「아이템 드랍률 감소」): 재화량은
// 그대로 두고 itemChance/bonusChance만 전부 ×0.7 — 0.6/0.7/0.9 → 0.42/0.49/0.63,
// bonusChance 0.35 → 0.245.
const ROUND_REWARD_RULES: readonly RoundRewardRule[] = [
  { currency: [8, 15], itemChance: 0.6 * 0.7, possibleItems: COMMON_UNCOMMON },
  { currency: [12, 20], itemChance: 0.7 * 0.7, possibleItems: COMMON_UNCOMMON },
  {
    currency: [20, 35],
    itemChance: 0.9 * 0.7,
    possibleItems: COMMON_UNCOMMON,
    bonusChance: 0.35 * 0.7,
    bonusItems: RARE_LEGEND,
  },
];

export type RunResult = "cleared" | "died";

export interface RunRewards {
  currency: number;
  items: { itemKey: ItemKey; quantity: number }[];
}

/**
 * seed + 실제로 클리어한 라운드 수로부터 보상을 서버가 독립적으로
 * 재계산한다. 클라이언트가 주장하는 아이템/재화 값은 절대 신뢰하지 않는다
 * — roundsCleared만(ROUND_COUNT로 clamp한 뒤) 입력으로 쓰고, 나머지는 이
 * 함수가 seed로부터 전부 다시 굴린다. 죽어서 런이 끝난 경우("died") 아직
 * 클리어하지 못한 라운드의 보상은 clamp된 roundsCleared에 애초에 포함되지
 * 않으므로 자연히 손실 처리된다 (소프트 페널티) — result 자체는 계산에
 * 필요 없다.
 */
export function computeRunRewards(seed: string, roundsCleared: number): RunRewards {
  const clearedCount = Math.max(0, Math.min(roundsCleared, ROUND_COUNT));

  const rng = createRng(seed, "rewards");
  let currency = 0;
  const itemTotals = new Map<ItemKey, number>();

  for (let i = 0; i < clearedCount; i++) {
    const rule = ROUND_REWARD_RULES[i];
    currency += rngInt(rng, rule.currency[0], rule.currency[1]);
    if (rule.possibleItems.length > 0 && rng() < rule.itemChance) {
      const item = rngPick(rng, rule.possibleItems);
      itemTotals.set(item, (itemTotals.get(item) ?? 0) + 1);
    }
    if (rule.bonusChance && rule.bonusItems && rng() < rule.bonusChance) {
      const item = rngPick(rng, rule.bonusItems);
      itemTotals.set(item, (itemTotals.get(item) ?? 0) + 1);
    }
  }

  return {
    currency,
    items: Array.from(itemTotals, ([itemKey, quantity]) => ({ itemKey, quantity })),
  };
}
