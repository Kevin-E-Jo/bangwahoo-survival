import type { UpgradeType } from "@/lib/game-logic";

// 무기 파츠/업그레이드 표시용 한글 라벨. 밸런스·카탈로그 자체는
// src/lib/game-logic/catalog.ts(공유 모듈) 소관이라 건드리지 않고,
// 화면 표시 전용 매핑만 이 화면 쪽에 둔다.

export const UPGRADE_LABELS: Record<UpgradeType, { name: string; icon: string }> = {
  weaponDamage: { name: "탄환 위력", icon: "💥" },
  weaponAmmo: { name: "탄창 용량", icon: "🧲" },
};

export const ITEM_LABELS: Record<string, { name: string; icon: string }> = {
  part_spring: { name: "스프링", icon: "🌀" },
  part_barrel: { name: "총열", icon: "🔧" },
  part_scope: { name: "조준경", icon: "🔭" },
  collectible_marble: { name: "구슬", icon: "🔵" },
};

export function itemLabel(itemKey: string) {
  return ITEM_LABELS[itemKey] ?? { name: itemKey, icon: "📦" };
}
