import Phaser from "phaser/dist/phaser.js"; // 이유: EventBus.ts 상단 주석 참고
import type { ElementKey } from "@/lib/game-logic/upgradeTypes";

// docs/blueprint.html#upgrades "속성탄계 상세" 구현. 순환 import를 피하려고
// DungeonScene.CANVAS_W/H, ARCHETYPE_STATS의 speed 값을 여기서 다시 상수로
// 든다 — maps.ts가 이미 쓰는 것과 같은 트릭(DungeonScene.ts 주석 참고).
const CANVAS_W = 960;
const CANVAS_H = 540;

// flash(실명)·fear(공포)가 이동 속도를 덮어쓸 때 쓸 "그 적의 평소 속도".
// DungeonScene.ARCHETYPE_STATS를 직접 import하면 순환 참조가 생기므로,
// 여기 별도로 작은 사본을 둔다(known gap: DungeonScene.ts의 값이 바뀌어도
// 이 사본은 수동으로 맞춰야 함 — archetype 필드가 없는 경우, 즉 엘리트나
// 데이터가 안 채워진 경우엔 일반 몹 속도로 대충 폴백).
const ARCHETYPE_SPEED_FALLBACK: Record<string, number> = {
  normal: 80,
  tank: 46,
  speedster: 172,
  roller: 299,
  bomber: 110,
};
const ELITE_SPEED_FALLBACK = 55;
const DEFAULT_SPEED_FALLBACK = 70;

export interface StatusEffectContext {
  player: Phaser.Physics.Arcade.Sprite;
  enemies: Phaser.Physics.Arcade.Group;
  time: number;
}

function isActiveEnemy(enemy: Phaser.Physics.Arcade.Sprite): boolean {
  return enemy.active && !enemy.getData("dying");
}

/** DOT 틱 등으로 순수 상태이상 데미지만으로 죽는 경우를 위한 단순화된 처치.
 * DungeonScene.killEnemy()는 사망 트윈 연출 + checkWaveClear() 호출까지
 * 하는데, 이 모듈은 private 메서드라 그걸 재사용할 수 없다. 그래서 여기선
 * 트윈 없이 즉시 destroy만 한다 — 알려진 단순화(known gap): 상태이상으로
 * 죽는 적은 사망 연출이 스킵되고, checkWaveClear()가 이 프레임엔 안 불리므로
 * 클리어 판정이 한 프레임(다음 update 루프의 cleanupEscapedEnemies류 체크)
 * 정도 늦게 잡힐 수 있다 — 실제로는 매 프레임 DungeonScene 쪽에서 이미
 * checkWaveClear를 여러 경로로 호출하므로 실질적 문제는 없을 것으로 예상. */
function reduceHpAndKillIfDead(enemy: Phaser.Physics.Arcade.Sprite, damage: number): void {
  if (!isActiveEnemy(enemy)) return;
  const hp = (enemy.getData("hp") as number) - damage;
  enemy.setData("hp", hp);
  if (hp <= 0) {
    enemy.setData("dying", true);
    if (enemy.body) (enemy.body as Phaser.Physics.Arcade.Body).enable = false;
    enemy.destroy();
  }
}

function findNearestOtherEnemy(
  enemy: Phaser.Physics.Arcade.Sprite,
  enemies: Phaser.Physics.Arcade.Group,
  maxRange: number,
): Phaser.Physics.Arcade.Sprite | undefined {
  let closest: Phaser.Physics.Arcade.Sprite | undefined;
  let closestDist = Infinity;
  for (const otherObj of enemies.getChildren()) {
    const other = otherObj as Phaser.Physics.Arcade.Sprite;
    if (other === enemy || !isActiveEnemy(other)) continue;
    const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, other.x, other.y);
    if (dist <= maxRange && dist < closestDist) {
      closestDist = dist;
      closest = other;
    }
  }
  return closest;
}

/** 총알이 적을 명중시킨 직후 한 번 호출 — 플레이어가 보유한 속성탄(elem_*
 * 업그레이드) 하나당 한 번씩, 발사 패턴 업그레이드를 담당하는 다른 작업이
 * 호출한다(이 모듈은 어떤 속성을 보유 중인지 모른다 — 그건 upgrades.ts
 * 소관). stacks는 1~3(포이즌은 무시), hitDamage는 이번 타격의 데미지. */
export function applyElementalOnHit(
  enemy: Phaser.Physics.Arcade.Sprite,
  element: ElementKey,
  stacks: number,
  hitDamage: number,
  ctx: StatusEffectContext,
): void {
  if (!isActiveEnemy(enemy)) return;
  const time = ctx.time;

  switch (element) {
    case "fire": {
      const duration = Math.min(5000, 3000 + (stacks - 1) * 1000);
      enemy.setData("burnUntil", time + duration);
      enemy.setData("burnDps", 4);
      if (enemy.getData("burnLastTickAt") === undefined) {
        enemy.setData("burnLastTickAt", time);
      }
      break;
    }
    case "water": {
      const duration = Math.min(3500, 2000 + (stacks - 1) * 750);
      enemy.setData("slowUntil", time + duration);
      break;
    }
    case "electric": {
      const pct = Math.min(0.7, 0.5 + (stacks - 1) * 0.1);
      const target = findNearestOtherEnemy(enemy, ctx.enemies, 150);
      if (target) {
        reduceHpAndKillIfDead(target, hitDamage * pct);
      }
      break;
    }
    case "wind": {
      const push = Math.min(60, 40 + (stacks - 1) * 10);
      const angle = Phaser.Math.Angle.Between(ctx.player.x, ctx.player.y, enemy.x, enemy.y);
      const newX = Phaser.Math.Clamp(enemy.x + Math.cos(angle) * push, 0, CANVAS_W);
      const newY = Phaser.Math.Clamp(enemy.y + Math.sin(angle) * push, 0, CANVAS_H);
      enemy.setPosition(newX, newY);
      break;
    }
    case "ice": {
      const chance = Math.min(0.35, 0.25 + (stacks - 1) * 0.05);
      if (Math.random() < chance) {
        enemy.setData("stunUntil", time + 600);
      }
      break;
    }
    case "magnet": {
      const radius = Math.min(120, 80 + (stacks - 1) * 20);
      const pullStep = 30;
      for (const otherObj of ctx.enemies.getChildren()) {
        const other = otherObj as Phaser.Physics.Arcade.Sprite;
        if (other === enemy || !isActiveEnemy(other)) continue;
        const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, other.x, other.y);
        if (dist <= radius && dist > 0) {
          const step = Math.min(pullStep, dist);
          const angle = Phaser.Math.Angle.Between(other.x, other.y, enemy.x, enemy.y);
          other.setPosition(other.x + Math.cos(angle) * step, other.y + Math.sin(angle) * step);
        }
      }
      break;
    }
    case "poison": {
      const current = Math.min(5, ((enemy.getData("poisonStacks") as number) ?? 0) + 1);
      enemy.setData("poisonStacks", current);
      enemy.setData("poisonUntil", time + 3000);
      if (enemy.getData("poisonLastTickAt") === undefined) {
        enemy.setData("poisonLastTickAt", time);
      }
      break;
    }
    case "flash": {
      const duration = Math.min(2100, 1500 + (stacks - 1) * 300);
      const wasBlind = (enemy.getData("blindUntil") as number | undefined) ?? 0;
      if (wasBlind <= time) {
        enemy.setData("blindAngle", Math.random() * Math.PI * 2);
      }
      enemy.setData("blindUntil", time + duration);
      break;
    }
    case "fear": {
      const duration = Math.min(3000, 2000 + (stacks - 1) * 500);
      enemy.setData("fearUntil", time + duration);
      break;
    }
    default: {
      const _exhaustive: never = element;
      void _exhaustive;
    }
  }
}

function getEnemySpeed(enemy: Phaser.Physics.Arcade.Sprite): number {
  if (enemy.getData("isElite") as boolean) return ELITE_SPEED_FALLBACK;
  const archetype = enemy.getData("archetype") as string | undefined;
  if (archetype && archetype in ARCHETYPE_SPEED_FALLBACK) {
    return ARCHETYPE_SPEED_FALLBACK[archetype];
  }
  return DEFAULT_SPEED_FALLBACK;
}

/** 매 프레임 한 번, 정상 추적 이동(updateEnemyHoming) 이후에 호출 — 모든
 * 적의 상태이상(스턴/공포/실명/슬로우/화상/중독)을 여기서 일괄 처리한다.
 * 우선순위: 스턴 > 공포/실명(있으면 공포 우선) > 물풍선 슬로우(위에 곱연산)
 * > 지속딜(화상/중독, 항상 처리). */
export function tickStatusEffects(ctx: StatusEffectContext): void {
  const time = ctx.time;
  for (const enemyObj of ctx.enemies.getChildren()) {
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
    if (!isActiveEnemy(enemy)) continue;

    const stunUntil = (enemy.getData("stunUntil") as number | undefined) ?? 0;
    const fearUntil = (enemy.getData("fearUntil") as number | undefined) ?? 0;
    const blindUntil = (enemy.getData("blindUntil") as number | undefined) ?? 0;
    const slowUntil = (enemy.getData("slowUntil") as number | undefined) ?? 0;

    if (stunUntil > time) {
      enemy.setVelocity(0, 0);
    } else if (fearUntil > time) {
      const angle = Phaser.Math.Angle.Between(ctx.player.x, ctx.player.y, enemy.x, enemy.y);
      const speed = getEnemySpeed(enemy);
      enemy.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    } else if (blindUntil > time) {
      const blindAngle = (enemy.getData("blindAngle") as number | undefined) ?? 0;
      const speed = getEnemySpeed(enemy);
      enemy.setVelocity(Math.cos(blindAngle) * speed, Math.sin(blindAngle) * speed);
    } else if (slowUntil > time) {
      const body = enemy.body as Phaser.Physics.Arcade.Body | null;
      if (body) {
        body.velocity.x *= 0.6;
        body.velocity.y *= 0.6;
      }
    }

    // 지속딜(화상/중독)은 위 이동 오버라이드와 무관하게 항상 처리한다.
    const burnUntil = (enemy.getData("burnUntil") as number | undefined) ?? 0;
    if (burnUntil > time) {
      const lastTick = (enemy.getData("burnLastTickAt") as number | undefined) ?? time;
      if (time - lastTick >= 1000) {
        enemy.setData("burnLastTickAt", time);
        const dps = (enemy.getData("burnDps") as number | undefined) ?? 4;
        reduceHpAndKillIfDead(enemy, dps);
      }
    }

    const poisonUntil = (enemy.getData("poisonUntil") as number | undefined) ?? 0;
    const poisonStacks = (enemy.getData("poisonStacks") as number | undefined) ?? 0;
    if (poisonUntil > time && poisonStacks > 0) {
      const lastTick = (enemy.getData("poisonLastTickAt") as number | undefined) ?? time;
      if (time - lastTick >= 1000) {
        enemy.setData("poisonLastTickAt", time);
        reduceHpAndKillIfDead(enemy, 2 * poisonStacks);
      }
    } else if (poisonUntil <= time && poisonStacks > 0) {
      enemy.setData("poisonStacks", 0);
    }
  }
}
