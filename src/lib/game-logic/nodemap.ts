import { createRng, rngPick } from "./seed";

// 고정 노드맵 템플릿 중 런마다 랜덤 선택 (블루프린트: 구역 1개, 노드 8–12개,
// MVP는 3–4개). 몬스터 컨셉은 미정이라 노드는 전투 강도 레이블로만 표현한다.

export type NodeType = "combat" | "elite" | "loot" | "rest";

export interface NodeMapTemplate {
  id: string;
  nodes: readonly NodeType[];
}

export const NODE_MAP_TEMPLATES: readonly NodeMapTemplate[] = [
  // MVP 범위 (3–4 노드)
  { id: "mvp-a", nodes: ["combat", "combat", "loot", "combat"] },
  { id: "mvp-b", nodes: ["combat", "loot", "combat"] },
  { id: "mvp-c", nodes: ["combat", "combat", "elite", "loot"] },
  // Nice-to-have 범위 (8–12 노드)
  {
    id: "ext-a",
    nodes: [
      "combat", "loot", "combat", "combat", "elite",
      "loot", "combat", "combat",
    ],
  },
  {
    id: "ext-b",
    nodes: [
      "combat", "combat", "loot", "combat", "elite",
      "combat", "loot", "combat", "combat", "elite",
    ],
  },
] as const;

export function pickNodeMapTemplate(seed: string): NodeMapTemplate {
  const rng = createRng(seed, "nodemap");
  return rngPick(rng, NODE_MAP_TEMPLATES);
}
