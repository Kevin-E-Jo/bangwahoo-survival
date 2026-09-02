import { ITEM_LABELS as CATALOG_ITEM_LABELS, type ItemTier, type UpgradeType } from "@/lib/game-logic";

// 무기 파츠/업그레이드 표시용 한글 라벨. 아이템 라벨 자체는
// src/lib/game-logic/catalog.ts(공유 모듈)가 소스 오브 트루스 —
// 여기서는 이름만 맞춰서 그대로 재노출한다.

export const UPGRADE_LABELS: Record<UpgradeType, { name: string; icon: string }> = {
  weaponDamage: { name: "탄환 위력", icon: "💥" },
  weaponAmmo: { name: "탄창 용량", icon: "🧲" },
};

export const TIER_LABELS: Record<ItemTier, string> = {
  common: "일반",
  uncommon: "고급",
  rare: "희귀",
  legend: "전설",
};

export function itemLabel(itemKey: string) {
  const entry = (CATALOG_ITEM_LABELS as Record<string, { ko: string; icon: string; tier: ItemTier }>)[itemKey];
  return entry
    ? { name: entry.ko, icon: entry.icon, tier: entry.tier }
    : { name: itemKey, icon: "📦", tier: "common" as ItemTier };
}
