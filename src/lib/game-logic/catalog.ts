// 아이템/업그레이드 카탈로그. Inventory.itemKey / TownProgress 컬럼과 대응된다.
// 무기 파츠 종류·밸런스는 아직 미정(블루프린트 「미정 사항」 참고) — 여기 값은
// 서버 검증 로직이 동작하도록 잡아둔 임시 가정이며, 밸런스가 정해지면
// 이 파일만 고치면 된다.

export const ITEM_KEYS = [
  "part_spring",
  "part_barrel",
  "part_scope",
  "collectible_marble",
] as const;

export type ItemKey = (typeof ITEM_KEYS)[number];

export const UPGRADE_TYPES = ["weaponDamage", "weaponAmmo"] as const;
export type UpgradeType = (typeof UPGRADE_TYPES)[number];

export const UPGRADE_CONFIG: Record<
  UpgradeType,
  { baseCost: number; costGrowth: number; maxLevel: number }
> = {
  weaponDamage: { baseCost: 20, costGrowth: 1.6, maxLevel: 5 },
  weaponAmmo: { baseCost: 25, costGrowth: 1.6, maxLevel: 5 },
};

/** currentLevel에서 다음 레벨로 올리는 데 필요한 비용. */
export function getUpgradeCost(type: UpgradeType, currentLevel: number): number {
  const cfg = UPGRADE_CONFIG[type];
  return Math.round(cfg.baseCost * Math.pow(cfg.costGrowth, currentLevel));
}

export function isUpgradeType(value: unknown): value is UpgradeType {
  return typeof value === "string" && (UPGRADE_TYPES as readonly string[]).includes(value);
}
