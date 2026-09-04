import type { ElementKey } from "@/lib/game-logic/upgradeTypes";

export interface StatusEffectContext {
  player: Phaser.Physics.Arcade.Sprite;
  enemies: Phaser.Physics.Arcade.Group;
  time: number;
}

// TODO(coordinator): placeholder — a parallel task builds the real implementation
// in a sibling branch. This file gets replaced wholesale at merge time. Keep the
// exported function signatures exactly as-is so the replacement is a drop-in.
// (params are intentionally unused here — no-op bodies — so unused-vars is
// disabled for this file only; the real implementation will use them all.)
/* eslint-disable @typescript-eslint/no-unused-vars */
export function applyElementalOnHit(
  enemy: Phaser.Physics.Arcade.Sprite,
  element: ElementKey,
  stacks: number,
  hitDamage: number,
  ctx: StatusEffectContext,
): void {
  // no-op placeholder
}

export function tickStatusEffects(ctx: StatusEffectContext): void {
  // no-op placeholder
}
