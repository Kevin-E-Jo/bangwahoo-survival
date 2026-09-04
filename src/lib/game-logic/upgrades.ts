// 업그레이드 시스템 설계 확정본(docs/blueprint.html#upgrades) 기준 카탈로그.
// catalog.ts(아이템)와 같은 패턴 — 순수 데이터 + 그 데이터를 소비하는 얇은
// 함수만 둔다. 실제 효과 적용(총알 개수·쿨다운·상태이상 등)은 DungeonScene
// 소관이고, 이 파일은 "무엇을 얼마나" 정의만 한다.

import type { ElementKey, ElementUpgradeId, UpgradeId } from "./upgradeTypes";
import { createRng, rngInt } from "./seed";

export type UpgradeCategory = "pattern" | "stat" | "element";

export interface UpgradeDef {
  id: UpgradeId;
  category: UpgradeCategory;
  /** 그 시절 놀이·문방구에서 따온 표시 이름(한글). */
  name: string;
  description: string;
  /** 이 업그레이드가 쌓일 수 있는 최대 스택 수. */
  maxStacks: number;
  /** true면 평생 1회만 선택 가능(스택 개념 자체가 없음) — 현재는 doubleshot만 해당. */
  unique: boolean;
}

export type UpgradeCard = UpgradeDef;

const ELEMENT_NAMES: Record<ElementKey, string> = {
  fire: "폭죽탄",
  water: "물풍선탄",
  electric: "찌릿탄",
  wind: "바람개비탄",
  ice: "얼음땡탄",
  magnet: "자석탄",
  poison: "불량식품탄",
  flash: "플래시탄",
  fear: "호루라기탄",
};

// 실제 상태이상 수치(화상 DoT, 슬로우율 등)는 병렬 작업이 statusEffects.ts에서
// 구현한다 — 여기 설명 문구는 블루프린트 수치를 그대로 옮긴 카탈로그 텍스트일 뿐,
// 이 파일이 그 수치를 직접 적용하지는 않는다.
const ELEMENT_DESCRIPTIONS: Record<ElementKey, string> = {
  fire: "명중 시 화상 부여 — 초당 4데미지, 기본 3초 지속(스택마다 +1초, 최대 5초)",
  water: "명중 시 이동속도 -40%, 기본 2초 지속(스택마다 +0.5초, 최대 3.5초)",
  electric: "명중 시 인접 적 1체에게 50% 데미지로 연쇄(스택마다 +10%p, 최대 70%)",
  wind: "명중 시 넉백 40px(스택마다 +10px, 최대 60px)",
  ice: "명중 시 25% 확률로 0.6초 완전 정지(스택마다 확률 +5%p, 최대 35%)",
  magnet: "명중 지점 반경 80px 안의 다른 적을 끌어당김(스택마다 반경 +20px, 최대 120px)",
  poison: "명중 시 중독 1스택 부여, 스택마다 초당 2데미지(최대 5스택 = 초당 10), 지속 3초",
  flash: "명중 시 1.5초간 실명(추적 상실, 무작위 이동) — 스택마다 +0.3초, 최대 2.1초",
  fear: "명중 시 2초간 플레이어 반대 방향으로 도주 — 스택마다 +0.5초, 최대 3초",
};

const PATTERN_UPGRADES: readonly UpgradeDef[] = [
  {
    id: "multishot",
    category: "pattern",
    name: "고무줄 연사",
    description: "발사마다 총알 +1발, 15° 간격 부채꼴 확산(최대 3스택 → 기본 1발에서 최대 4발)",
    maxStacks: 3,
    unique: false,
  },
  {
    id: "doubleshot",
    category: "pattern",
    name: "쌍딱총",
    description: "확산 없이 같은 총알 세트를 약 80ms 뒤 한 번 더 발사(유니크 — 평생 1회만 선택 가능)",
    maxStacks: 1,
    unique: true,
  },
  {
    id: "ricochet",
    category: "pattern",
    name: "비석치기",
    description: "엄폐물에 맞은 총알이 파괴되지 않고 반사되어 계속 날아감(최대 2스택 = 2회까지 튕김)",
    maxStacks: 2,
    unique: false,
  },
];

const STAT_UPGRADES: readonly UpgradeDef[] = [
  {
    id: "damage",
    category: "stat",
    name: "왕구슬",
    description: "총알 데미지 +15%/스택(가산, 최대 5스택 = +75%)",
    maxStacks: 5,
    unique: false,
  },
  {
    id: "firerate",
    category: "stat",
    name: "팽이채 연타",
    description: "발사 쿨다운 -12%/스택(곱연산, 최대 5스택, 하한 60ms)",
    maxStacks: 5,
    unique: false,
  },
  {
    id: "movespeed",
    category: "stat",
    name: "잽싼 고무신",
    description: "이동속도 +10%/스택(가산, 최대 5스택)",
    maxStacks: 5,
    unique: false,
  },
  {
    id: "ammo",
    category: "stat",
    name: "문방구 사재기",
    description: "최대 탄약 +2/스택(가산, 최대 5스택)",
    maxStacks: 5,
    unique: false,
  },
  {
    id: "reload",
    category: "stat",
    name: "요요 손목 스냅",
    description: "재장전 시간 -15%/스택(곱연산, 최대 5스택, 하한 400ms)",
    maxStacks: 5,
    unique: false,
  },
];

const ELEMENT_KEYS: readonly ElementKey[] = [
  "fire",
  "water",
  "electric",
  "wind",
  "ice",
  "magnet",
  "poison",
  "flash",
  "fear",
];

const ELEMENT_UPGRADES: readonly UpgradeDef[] = ELEMENT_KEYS.map((key) => ({
  id: `elem_${key}` as ElementUpgradeId,
  category: "element" as const,
  name: ELEMENT_NAMES[key],
  description: ELEMENT_DESCRIPTIONS[key],
  maxStacks: 3,
  unique: false,
}));

/** 전체 17종 업그레이드 카탈로그(패턴 3 + 스탯 5 + 속성탄 9). */
export const UPGRADE_CATALOG: readonly UpgradeDef[] = [
  ...PATTERN_UPGRADES,
  ...STAT_UPGRADES,
  ...ELEMENT_UPGRADES,
];

const UPGRADE_BY_ID = new Map<UpgradeId, UpgradeDef>(UPGRADE_CATALOG.map((u) => [u.id, u]));

export function getUpgradeDef(id: UpgradeId): UpgradeDef {
  const def = UPGRADE_BY_ID.get(id);
  if (!def) throw new Error(`unknown upgrade id: ${id}`);
  return def;
}

/**
 * 런당 3회(0/1/2) 뜨는 선택지 3장을 시드+pickIndex 기반으로 결정론적으로
 * 뽑는다 — maps.ts의 pickMapLayout과 같은 원칙(createRng로 독립 스트림을 만든
 * 뒤 그 스트림에서만 뽑는다). 이미 최대 스택에 도달했거나(유니크 업그레이드는
 * 1회 보유 시) 제외 대상인 업그레이드는 후보에서 뺀다. 후보가 3개 미만이면
 * 있는 만큼만 반환한다(크래시하지 않음).
 */
export function pickUpgradeChoices(
  seed: string,
  pickIndex: number,
  owned: ReadonlyMap<UpgradeId, number>,
): UpgradeCard[] {
  const rng = createRng(seed, `upgrades:${pickIndex}`);

  const eligible = UPGRADE_CATALOG.filter((u) => {
    const stacks = owned.get(u.id) ?? 0;
    if (u.unique && stacks > 0) return false;
    return stacks < u.maxStacks;
  });

  // 중복 없이 3장을 뽑아야 해서(카탈로그의 rngPick만으로는 재추출 시 중복이
  // 생길 수 있음) 후보 배열에서 뽑을 때마다 제거하는 방식을 쓴다 — 여전히
  // rng는 createRng(seed, `upgrades:${pickIndex}`) 하나에서만 순서대로 소비되므로
  // 시드+pickIndex가 같으면 항상 같은 3장이 나온다.
  const remaining = [...eligible];
  const picks: UpgradeCard[] = [];
  const count = Math.min(3, remaining.length);
  for (let i = 0; i < count; i++) {
    const idx = rngInt(rng, 0, remaining.length - 1);
    picks.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return picks;
}
