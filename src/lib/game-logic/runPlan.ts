import { pickNodeMapTemplate, type NodeType } from "./nodemap";

export interface RunPlan {
  seed: string;
  templateId: string;
  nodes: readonly NodeType[];
  waveCount: number;
}

/**
 * seed로부터 이번 런의 노드맵을 결정한다. 순수 함수 — 같은 seed는 항상 같은
 * plan을 낸다. DungeonScene(클라이언트)과 /api/run/submit(서버)이 반드시
 * 이 함수를 통해서만 노드맵을 얻어야 한다.
 */
export function generateRunPlan(seed: string): RunPlan {
  const template = pickNodeMapTemplate(seed);
  return {
    seed,
    templateId: template.id,
    nodes: template.nodes,
    waveCount: template.nodes.length,
  };
}
