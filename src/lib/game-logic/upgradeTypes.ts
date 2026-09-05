// 업그레이드 시스템 설계 확정본(docs/blueprint.html#upgrades) 기준 ID 타입.
// 두 병렬 작업(선택지·발사패턴·스탯 강화 / 속성탄 상태이상)이 공유하는 계약
// 이라 이 파일만 먼저 만들어 고정한다 — 어느 쪽도 이 union을 바꾸지 않는다.

export type ElementKey =
  | "fire" // 폭죽탄
  | "water" // 물풍선탄
  | "electric" // 찌릿탄
  | "wind" // 바람개비탄
  | "ice" // 얼음땡탄
  | "magnet" // 자석탄
  | "poison" // 불량식품탄
  | "flash" // 플래시탄
  | "fear"; // 호루라기탄

export type PatternUpgradeId =
  | "multishot"
  | "doubleshot"
  | "ricochet"
  | "mine"
  | "turret"
  | "bomb";
export type StatUpgradeId = "damage" | "firerate" | "movespeed" | "ammo" | "reload";
export type ElementUpgradeId = `elem_${ElementKey}`;
export type UpgradeId = PatternUpgradeId | StatUpgradeId | ElementUpgradeId;
