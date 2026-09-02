// DungeonScene ↔ UIScene ↔ ResultScene이 주고받는 combat:* 이벤트 계약.
// 블루프린트 「씬 간 인터페이스 › Phaser 내부 이벤트」와 반드시 동일하게 유지한다.

export interface HpChangedPayload {
  current: number;
  max: number;
}

export interface AmmoChangedPayload {
  current: number;
  max: number;
}

export interface WaveStartedPayload {
  waveIndex: number;
  totalWaves: number;
}

export interface WaveClearedPayload {
  waveIndex: number;
  loot: { currency: number; items: { itemKey: string; quantity: number }[] };
}

export interface RunEndedPayload {
  result: "cleared" | "died";
  collectedItems: { itemKey: string; quantity: number }[];
  wavesCleared: number;
  elapsedMs: number;
  seed: string;
}

export const CombatEvents = {
  HpChanged: "combat:hp-changed",
  AmmoChanged: "combat:ammo-changed",
  WaveStarted: "combat:wave-started",
  WaveCleared: "combat:wave-cleared",
  RunEnded: "combat:run-ended",
} as const;
