import Phaser from "phaser/dist/phaser.js"; // 이유: EventBus.ts 상단 주석 참고
import type { EnemyArchetype } from "@/lib/game-logic";

// docs/blueprint.html#expansion2 "1. 몹 원거리 공격" 구현. 순환 import를
// 피하려고 DungeonScene.WORLD_W/H를 여기서 다시 상수로 든다 — maps.ts/
// statusEffects.ts가 이미 쓰는 것과 같은 트릭(DungeonScene.ts 주석 참고).
// 주의: 여기는 캔버스(뷰포트, 960x540)가 아니라 월드 크기를 써야 한다 —
// 카메라 추적 + 월드 확장(blueprint#expansion2 "5") 이후로 몹·투사체는
// 뷰포트 밖 월드 전역에서 살아있어야 하기 때문. 캔버스 크기로 걸러내면
// 카메라가 비추지 않는 곳의 투사체가 스폰 직후 곧바로 청소되어버린다
// (실제로 라이브 검증 중 발견 — 병합 직후 통합 테스트로 잡음).
const WORLD_W = 2400;
const WORLD_H = 1350;

export interface RangedConfig {
  /** 투사체 텍스처 키(scripts/pixel-art/generate-sprites.js에서 생성). */
  textureKey: string;
  /** 투사체 속도(px/s). */
  projectileSpeed: number;
  /** 발사당 데미지(발사 1회 = 볼리 전체가 아니라 투사체 1발 기준). */
  damage: number;
  /** 이 거리 안에 플레이어가 있어야 공격을 시작한다. */
  range: number;
  /** 한 번 발사(예열+실제 발사) 후 다음 공격 시도까지의 최소 간격. */
  cooldownMs: number;
  /** 발사 전 예열(텔레그래프) 시간 — 0이면 예열 없이 즉시 발사. */
  windupMs: number;
  /** 예열 중에도 이동을 유지할지(스피드형만 true — "이동 중 발사 가능"). */
  canMoveDuringWindup: boolean;
  /** 부채꼴 다발 투척(엘리트 전용) — 미지정 시 1발. */
  volleyCount?: number;
  /** 다발 투척 시 전체 부채꼴 각도(도) — volleyCount>1일 때만 의미 있음. */
  volleySpreadDeg?: number;
  /** 예열 중 깜빡이는 틴트 색상 — 미지정 시 기본값(TELEGRAPH_TINT) 사용. */
  telegraphTint?: number;
}

const TELEGRAPH_TINT = 0xff6b6b; // 예열 중 경고용 붉은 깜빡임(기본)
const TELEGRAPH_FLICKER_MS = 120; // 깜빡임 주기

// 엘리트를 제외한 일반 몹 유형별 원거리 설정. 롤러형은 의도적으로 항목이
// 없음(방패·구르기 정체성 유지, 블루프린트에서 확정) — 다른 병렬 세션이
// EnemyArchetype에 새 유형(예: "bomber")을 추가해도, 여기 항목이 없으면
// tickEnemyRanged가 조용히 건너뛰므로 이 파일을 손댈 필요가 없다.
const RANGED_CONFIG: Partial<Record<EnemyArchetype, RangedConfig>> = {
  normal: {
    textureKey: "enemy_proj_ddakji",
    projectileSpeed: 300,
    damage: 7,
    range: 210,
    cooldownMs: 2000,
    windupMs: 150,
    canMoveDuringWindup: false,
  },
  tank: {
    textureKey: "enemy_proj_stone",
    projectileSpeed: 150,
    damage: 20,
    range: 260,
    cooldownMs: 3400,
    windupMs: 900,
    canMoveDuringWindup: false,
  },
  speedster: {
    textureKey: "enemy_proj_sling",
    projectileSpeed: 480,
    damage: 6,
    range: 300,
    cooldownMs: 1300,
    windupMs: 60,
    canMoveDuringWindup: true,
  },
};

// 엘리트는 EnemyArchetype 유니온에 속하지 않는 별도 플래그(isElite)라서
// 위 맵과 분리해서 둔다(DungeonScene의 스폰 로직과 동일한 구분).
const ELITE_RANGED_CONFIG: RangedConfig = {
  textureKey: "enemy_proj_book",
  projectileSpeed: 240,
  damage: 12,
  range: 320,
  cooldownMs: 4200,
  windupMs: 1000,
  canMoveDuringWindup: false,
  volleyCount: 5,
  volleySpreadDeg: 50,
};

export interface EnemyRangedContext {
  player: Phaser.Physics.Arcade.Sprite;
  enemies: Phaser.Physics.Arcade.Group;
  projectiles: Phaser.Physics.Arcade.Group;
  time: number;
}

function isActiveEnemy(enemy: Phaser.Physics.Arcade.Sprite): boolean {
  return enemy.active && !enemy.getData("dying");
}

function configFor(enemy: Phaser.Physics.Arcade.Sprite): RangedConfig | undefined {
  if (enemy.getData("isElite") as boolean) return ELITE_RANGED_CONFIG;
  const archetype = enemy.getData("archetype") as EnemyArchetype | undefined;
  if (!archetype) return undefined;
  return RANGED_CONFIG[archetype];
}

function updateTelegraphVisual(
  enemy: Phaser.Physics.Arcade.Sprite,
  config: RangedConfig,
  time: number,
): void {
  const on = Math.floor(time / TELEGRAPH_FLICKER_MS) % 2 === 0;
  if (on) enemy.setTint(config.telegraphTint ?? TELEGRAPH_TINT);
  else enemy.clearTint();
}

function spawnProjectile(
  projectiles: Phaser.Physics.Arcade.Group,
  x: number,
  y: number,
  angle: number,
  config: RangedConfig,
): void {
  const proj = projectiles.create(x, y, config.textureKey) as Phaser.Physics.Arcade.Image;
  proj.setData("damage", config.damage);
  proj.setRotation(angle);
  proj.setVelocity(Math.cos(angle) * config.projectileSpeed, Math.sin(angle) * config.projectileSpeed);
}

/** 예열이 끝나는 순간 호출 — 단발이면 플레이어 방향 한 발, 엘리트처럼
 * volleyCount가 있으면 그 방향을 중심으로 균등 부채꼴로 여러 발 뿌린다. */
function fire(enemy: Phaser.Physics.Arcade.Sprite, config: RangedConfig, ctx: EnemyRangedContext): void {
  const baseAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, ctx.player.x, ctx.player.y);
  const count = config.volleyCount ?? 1;
  if (count <= 1) {
    spawnProjectile(ctx.projectiles, enemy.x, enemy.y, baseAngle, config);
    return;
  }
  const spreadRad = Phaser.Math.DegToRad(config.volleySpreadDeg ?? 0);
  const start = baseAngle - spreadRad / 2;
  const step = spreadRad / (count - 1);
  for (let i = 0; i < count; i++) {
    spawnProjectile(ctx.projectiles, enemy.x, enemy.y, start + step * i, config);
  }
}

/** 몹 1마리분 원거리 공격 상태 진행 — 예열 중이면 (필요 시) 이동을 멈추고
 * 깜빡임 연출을 보여주다가 예열이 끝나면 발사, 아니면 쿨다운·사거리를
 * 체크해서 새 공격을 시작한다. */
function tickOne(enemy: Phaser.Physics.Arcade.Sprite, config: RangedConfig, ctx: EnemyRangedContext): void {
  const time = ctx.time;
  const windupUntil = enemy.getData("rangedWindupUntil") as number | undefined;

  if (windupUntil !== undefined) {
    if (!config.canMoveDuringWindup) enemy.setVelocity(0, 0);
    updateTelegraphVisual(enemy, config, time);
    if (time >= windupUntil) {
      enemy.setData("rangedWindupUntil", undefined);
      enemy.clearTint();
      fire(enemy, config, ctx);
      enemy.setData("rangedCooldownUntil", time + config.cooldownMs);
    }
    return;
  }

  const cooldownUntil = (enemy.getData("rangedCooldownUntil") as number | undefined) ?? 0;
  if (time < cooldownUntil) return;

  const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, ctx.player.x, ctx.player.y);
  if (dist > config.range) return;

  if (config.windupMs > 0) {
    enemy.setData("rangedWindupUntil", time + config.windupMs);
  } else {
    fire(enemy, config, ctx);
    enemy.setData("rangedCooldownUntil", time + config.cooldownMs);
  }
}

function cleanupOffscreenProjectiles(projectiles: Phaser.Physics.Arcade.Group): void {
  for (const obj of projectiles.getChildren()) {
    const proj = obj as Phaser.Physics.Arcade.Image;
    if (!proj.active) continue;
    if (proj.x < -16 || proj.x > WORLD_W + 16 || proj.y < -16 || proj.y > WORLD_H + 16) {
      proj.destroy();
    }
  }
}

/** 매 프레임 한 번, updateEnemyHoming() 이후에 호출 — 원거리 설정이 있는
 * 몹(일반/탱크/스피드/엘리트)의 예열·발사 상태를 진행시키고, 화면 밖으로
 * 나간 적 투사체를 정리한다. 설정이 없는 유형(롤러, 그리고 이 맵에 없는
 * 향후 신규 유형)은 조용히 건너뛴다. */
export function tickEnemyRanged(ctx: EnemyRangedContext): void {
  for (const enemyObj of ctx.enemies.getChildren()) {
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
    if (!isActiveEnemy(enemy)) continue;
    const config = configFor(enemy);
    if (!config) continue;
    tickOne(enemy, config, ctx);
  }
  cleanupOffscreenProjectiles(ctx.projectiles);
}

/** 적 투사체가 엄폐물에 맞았을 때 — 플레이어 총알과 동일 규칙으로 막힌다
 * (도탄 없이 그 자리에서 소멸). */
export function onEnemyProjectileHitObstacle(projectile: Phaser.Physics.Arcade.Image): void {
  if (!projectile.active) return;
  projectile.destroy();
}

/** 적 투사체가 플레이어에 맞았을 때 — 데미지 적용은 DungeonScene이 갖고
 * 있는 hp/무적시간 상태를 건드려야 해서 콜백으로 위임받는다(이 모듈은
 * 그 상태를 모른다). */
export function onEnemyProjectileHitPlayer(
  projectile: Phaser.Physics.Arcade.Image,
  applyDamage: (amount: number) => void,
): void {
  if (!projectile.active) return;
  const damage = (projectile.getData("damage") as number | undefined) ?? 0;
  projectile.destroy();
  applyDamage(damage);
}
