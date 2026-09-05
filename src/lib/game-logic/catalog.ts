// 아이템/업그레이드 카탈로그. Inventory.itemKey / TownProgress 컬럼과 대응된다.
// 드롭 아이템은 "무기 부품"이 아니라 그 시절 아이들이 갖고 놀던 것들 — 잡아온
// 잡템을 마을에서 팔아 무기를 업그레이드하는 구조다. 밸런스는 여전히 임시
// 가정이며, 바뀌면 이 파일만 고치면 된다.

export const ITEM_TIERS = ["common", "uncommon", "rare", "legend"] as const;
export type ItemTier = (typeof ITEM_TIERS)[number];

/** 티어별 마을 판매가(원). 런 클리어 시 노드에서 나오는 재화가 보통
 * 30~60원이라, 레전드 하나가 대략 런 하나 분량 가치가 되도록 잡았다. */
export const TIER_SELL_PRICE: Record<ItemTier, number> = {
  common: 4,
  uncommon: 10,
  rare: 22,
  legend: 50,
};

export const ITEM_KEYS = [
  // 흔함
  "bottle_cap", // 병뚜껑
  "rubber_band", // 고무줄
  "stamp", // 우표
  "junk_food", // 불량식품 봉지
  "bean_bag", // 콩주머니
  "toy_ddakji", // 딱지
  // 보통
  "marble", // 구슬
  "jegi", // 제기
  "spin_top", // 팽이
  "toy_set_square", // 삼각자
  "glue_stick", // 딱풀
  "crayon", // 크레파스
  "sticker_book", // 스티커북
  // 희귀
  "yoyo", // 요요
  "toy_paint", // 물감
  "glow_bracelet", // 야광팔찌
  "hula_hoop", // 훌라후프
  "gacha_capsule", // 뽑기 캡슐
  "boomerang", // 부메랑
  // 레전드
  "character_card", // 캐릭터 카드
  "cap_gun", // 딱총
  "toy_fidget_spinner", // 피젯스피너
] as const;

export type ItemKey = (typeof ITEM_KEYS)[number];

export const ITEM_LABELS: Record<ItemKey, { ko: string; icon: string; tier: ItemTier }> = {
  bottle_cap: { ko: "병뚜껑", icon: "🔘", tier: "common" },
  rubber_band: { ko: "고무줄", icon: "➰", tier: "common" },
  stamp: { ko: "우표", icon: "📮", tier: "common" },
  junk_food: { ko: "불량식품", icon: "🍬", tier: "common" },
  bean_bag: { ko: "콩주머니", icon: "🎒", tier: "common" },
  toy_ddakji: { ko: "딱지", icon: "🀄", tier: "common" },

  marble: { ko: "구슬", icon: "🔵", tier: "uncommon" },
  jegi: { ko: "제기", icon: "🪁", tier: "uncommon" },
  spin_top: { ko: "팽이", icon: "🌀", tier: "uncommon" },
  toy_set_square: { ko: "삼각자", icon: "📐", tier: "uncommon" },
  glue_stick: { ko: "딱풀", icon: "🧴", tier: "uncommon" },
  crayon: { ko: "크레파스", icon: "🖍️", tier: "uncommon" },
  sticker_book: { ko: "스티커북", icon: "📔", tier: "uncommon" },

  yoyo: { ko: "요요", icon: "🪀", tier: "rare" },
  toy_paint: { ko: "물감", icon: "🎨", tier: "rare" },
  glow_bracelet: { ko: "야광팔찌", icon: "💫", tier: "rare" },
  hula_hoop: { ko: "훌라후프", icon: "⭕", tier: "rare" },
  gacha_capsule: { ko: "뽑기 캡슐", icon: "🥚", tier: "rare" },
  boomerang: { ko: "부메랑", icon: "🪃", tier: "rare" },

  character_card: { ko: "캐릭터 카드", icon: "🃏", tier: "legend" },
  cap_gun: { ko: "딱총", icon: "🔫", tier: "legend" },
  toy_fidget_spinner: { ko: "피젯스피너", icon: "🌪️", tier: "legend" },
};

export function itemSellPrice(key: ItemKey): number {
  return TIER_SELL_PRICE[ITEM_LABELS[key].tier];
}

export function itemsByTier(tier: ItemTier): ItemKey[] {
  return ITEM_KEYS.filter((k) => ITEM_LABELS[k].tier === tier);
}

export const UPGRADE_TYPES = ["weaponDamage", "weaponAmmo"] as const;
export type UpgradeType = (typeof UPGRADE_TYPES)[number];

export const UPGRADE_CONFIG: Record<
  UpgradeType,
  { baseCost: number; costGrowth: number; maxLevel: number }
> = {
  // 확정된 장기 목표(docs/blueprint.html#expansion2): 최종 레벨까지 총 비용이
  // 평균 런 수익 기준 약 150런 분량이 되도록 성장률을 크게 올렸다 — 의도적으로
  // 매우 장기적인 목표.
  weaponDamage: { baseCost: 20, costGrowth: 1.75, maxLevel: 10 },
  weaponAmmo: { baseCost: 25, costGrowth: 1.75, maxLevel: 10 },
};

/** currentLevel에서 다음 레벨로 올리는 데 필요한 비용. */
export function getUpgradeCost(type: UpgradeType, currentLevel: number): number {
  const cfg = UPGRADE_CONFIG[type];
  return Math.round(cfg.baseCost * Math.pow(cfg.costGrowth, currentLevel));
}

export function isUpgradeType(value: unknown): value is UpgradeType {
  return typeof value === "string" && (UPGRADE_TYPES as readonly string[]).includes(value);
}
