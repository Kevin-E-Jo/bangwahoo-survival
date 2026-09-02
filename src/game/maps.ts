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

// DungeonScene.CANVAS_W/H와 같은 값. 순환 import를 피하려고 여기선 상수로
// 직접 둔다 — 캔버스 크기가 바뀌면 같이 맞춰줘야 한다.
const CENTER_X = 480;
const CENTER_Y = 270;

// 4가지 맵 패턴 — 좌표는 플레이어 스폰(캔버스 정중앙)과 화면 가장자리(몹 스폰
// 지점)를 피해서 배치했다. 런 전체에서 고정이며(보상 계산과 무관해 시드로만
// 결정, 서버 재검증 불필요) 라운드마다 바뀌지 않는다.
const LAYOUTS: readonly MapLayout[] = [
  {
    id: "empty_yard",
    obstacles: [
      { x: 220, y: 160, type: "planter" },
      { x: 760, y: 180, type: "box" },
      { x: 520, y: 420, type: "planter" },
    ],
  },
  {
    id: "box_pile",
    obstacles: [
      { x: 230, y: 210, type: "box" },
      { x: 268, y: 210, type: "box" },
      { x: 230, y: 248, type: "box" },
      { x: 268, y: 248, type: "box" },
      { x: 700, y: 330, type: "box" },
      { x: 738, y: 330, type: "box" },
      { x: 700, y: 368, type: "box" },
      { x: 738, y: 368, type: "box" },
    ],
  },
  {
    id: "alley",
    obstacles: [
      { x: 200, y: 140, type: "box" },
      { x: 236, y: 140, type: "box" },
      { x: 460, y: 140, type: "box" },
      { x: 496, y: 140, type: "box" },
      { x: 720, y: 140, type: "box" },
      { x: 756, y: 140, type: "box" },
      { x: 170, y: 400, type: "box" },
      { x: 206, y: 400, type: "box" },
      { x: 440, y: 400, type: "box" },
      { x: 476, y: 400, type: "box" },
      { x: 710, y: 400, type: "box" },
      { x: 746, y: 400, type: "box" },
    ],
  },
  {
    id: "playground",
    obstacles: [
      { x: 260, y: 180, type: "bench" },
      { x: 700, y: 180, type: "bench" },
      { x: 480, y: 140, type: "planter" },
      { x: 180, y: 400, type: "box" },
      { x: 780, y: 400, type: "planter" },
      { x: 480, y: 420, type: "bench" },
    ],
  },
];

const SPAWN_CLEARANCE = 90;

/** 런 seed로부터 맵 패턴을 고른다. 플레이어 스폰(캔버스 정중앙) 근처에
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
