import { createRng, rngPick } from "@/lib/game-logic/seed";

export type ObstacleType = "box" | "planter" | "bench";

export interface ObstaclePlacement {
  x: number;
  y: number;
  type: ObstacleType;
}

export interface MapLayout {
  id: string;
  obstacles: readonly ObstaclePlacement[];
}

// DungeonScene.WORLD_W/H와 같은 값(2400×1350 — 뷰포트 960×540의 2.5배,
// 블루프린트 「카메라 추적 + 월드 확장」). 순환 import를 피하려고 여기선
// 상수로 직접 둔다 — 월드 크기가 바뀌면 같이 맞춰줘야 한다. 플레이어는
// 월드 정중앙(1200, 675)에서 스폰하고 카메라가 그 지점부터 따라다닌다.
const CENTER_X = 1200;
const CENTER_Y = 675;

// 4가지 맵 패턴 — 월드가 뷰포트보다 훨씬 커진 만큼(2.5배), 기존 960×540
// 좌표를 단순히 늘리지 않고 장애물을 넓어진 공간 전체에 자연스럽게 재배치
// 했다. 플레이어 스폰(월드 정중앙)과 몹 스폰 지점(월드 가장자리 바로 밖,
// randomEdgePoint 참고)을 피해서 배치. 런 전체에서 고정이며(보상 계산과
// 무관해 시드로만 결정, 서버 재검증 불필요) 라운드마다 바뀌지 않는다.
const LAYOUTS: readonly MapLayout[] = [
  {
    // 빈 마당 — 가장 성긴 패턴. 넓어진 월드 곳곳에 단일 오브젝트만 듬성듬성
    // 흩어 놓아서, 어느 방향으로 도망쳐도 엄폐물이 하나쯤 있게만 한다.
    id: "empty_yard",
    obstacles: [
      { x: 300, y: 250, type: "planter" },
      { x: 2000, y: 300, type: "box" },
      { x: 500, y: 1100, type: "box" },
      { x: 1900, y: 1050, type: "planter" },
      { x: 1200, y: 190, type: "box" },
      { x: 1200, y: 1160, type: "planter" },
      { x: 680, y: 675, type: "box" },
      { x: 1720, y: 675, type: "planter" },
    ],
  },
  {
    // 상자더미 — 2x2 상자 무더기 4묶음을 네 방향(좌상/우상/좌하/우하)에
    // 하나씩 흩어서, 어느 코너로 밀려나든 엄폐할 무더기가 가깝게 있다.
    id: "box_pile",
    obstacles: [
      { x: 300, y: 230, type: "box" },
      { x: 338, y: 230, type: "box" },
      { x: 300, y: 268, type: "box" },
      { x: 338, y: 268, type: "box" },

      { x: 1850, y: 300, type: "box" },
      { x: 1888, y: 300, type: "box" },
      { x: 1850, y: 338, type: "box" },
      { x: 1888, y: 338, type: "box" },

      { x: 350, y: 1050, type: "box" },
      { x: 388, y: 1050, type: "box" },
      { x: 350, y: 1088, type: "box" },
      { x: 388, y: 1088, type: "box" },

      { x: 2000, y: 1000, type: "box" },
      { x: 2038, y: 1000, type: "box" },
      { x: 2000, y: 1038, type: "box" },
      { x: 2038, y: 1038, type: "box" },
    ],
  },
  {
    // 골목길 — 상/하 두 줄로 상자 "관문"을 늘어세워 지그재그로 뚫고 가는
    // 좁은 통로를 만든다. 관문 5개를 월드 폭 전체(x=200~2200)에 걸쳐 고르게
    // 배치해서, 커진 월드에서도 처음부터 끝까지 통로가 이어지게 했다.
    id: "alley",
    obstacles: [
      { x: 200, y: 300, type: "box" },
      { x: 240, y: 300, type: "box" },
      { x: 700, y: 300, type: "box" },
      { x: 740, y: 300, type: "box" },
      { x: 1200, y: 300, type: "box" },
      { x: 1240, y: 300, type: "box" },
      { x: 1700, y: 300, type: "box" },
      { x: 1740, y: 300, type: "box" },
      { x: 2200, y: 300, type: "box" },
      { x: 2240, y: 300, type: "box" },

      { x: 200, y: 1050, type: "box" },
      { x: 240, y: 1050, type: "box" },
      { x: 700, y: 1050, type: "box" },
      { x: 740, y: 1050, type: "box" },
      { x: 1200, y: 1050, type: "box" },
      { x: 1240, y: 1050, type: "box" },
      { x: 1700, y: 1050, type: "box" },
      { x: 1740, y: 1050, type: "box" },
      { x: 2200, y: 1050, type: "box" },
      { x: 2240, y: 1050, type: "box" },
    ],
  },
  {
    // 놀이터소품 — 벤치/화단/상자를 정중앙을 뺀 큰 원형으로 둘러 배치해,
    // 놀이터 곳곳에 앉을 자리·화단이 흩어져 있는 느낌을 낸다.
    id: "playground",
    obstacles: [
      { x: 300, y: 200, type: "bench" },
      { x: 2100, y: 220, type: "bench" },
      { x: 1200, y: 150, type: "planter" },
      { x: 150, y: 700, type: "box" },
      { x: 2250, y: 700, type: "planter" },
      { x: 300, y: 1150, type: "bench" },
      { x: 2100, y: 1150, type: "planter" },
      { x: 1200, y: 1200, type: "bench" },
      { x: 700, y: 300, type: "box" },
      { x: 1700, y: 300, type: "planter" },
      { x: 700, y: 1050, type: "planter" },
      { x: 1700, y: 1050, type: "box" },
    ],
  },
];

const SPAWN_CLEARANCE = 90;

/** 런 seed로부터 맵 패턴을 고른다. 플레이어 스폰(월드 정중앙) 근처에
 * 배치된 장애물은 걸러서, 어떤 패턴이 뽑히든 시작하자마자 끼이는 일이
 * 없게 한다. */
export function pickMapLayout(seed: string): MapLayout {
  const rng = createRng(seed, "map");
  const layout = rngPick(rng, LAYOUTS);
  const obstacles = layout.obstacles.filter((o) => {
    const dx = o.x - CENTER_X;
    const dy = o.y - CENTER_Y;
    return Math.hypot(dx, dy) >= SPAWN_CLEARANCE;
  });
  return { id: layout.id, obstacles };
}
