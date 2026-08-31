// 시드 기반 결정론적 난수. Phaser 클라이언트와 API 라우트가 동일한 결과를
// 내야 하므로, Math.random()이나 Node의 crypto RNG는 여기서 쓰지 않는다.

/** FNV-1a 32bit — 문자열 시드를 정수로 접는다. */
function hashSeedToInt(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — 32bit 정수 시드로부터 [0, 1) 실수를 뽑는 결정론적 PRNG. */
function mulberry32(a: number): () => number {
  let state = a >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

/**
 * seed 문자열로부터 난수 생성기를 만든다. namespace를 다르게 주면 같은 seed라도
 * 서로 간섭하지 않는 독립적인 난수 스트림을 얻을 수 있다 (예: 노드맵 선택과
 * 보상 계산을 분리).
 */
export function createRng(seed: string, namespace = ""): Rng {
  return mulberry32(hashSeedToInt(`${seed}:${namespace}`));
}

export function rngInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function rngPick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** 서버가 발급할 새 런 seed. 클라이언트가 유리한 seed를 고를 수 없도록
 * crypto로 생성한다 — 절차 생성 자체는 결정론적이어도, seed 값 자체는 예측
 * 불가능해야 한다. */
export function generateRunSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
