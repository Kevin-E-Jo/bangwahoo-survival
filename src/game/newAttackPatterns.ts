import Phaser from "phaser/dist/phaser.js"; // 이유: EventBus.ts 상단 주석 참고
import type { UpgradeId } from "@/lib/game-logic/upgradeTypes";

// 블루프린트 docs/blueprint.html#expansion2 「4. 플레이어 신규 공격 패턴」
// 구현 — 부비트랩(mine)·자동 딱총(turret)·폭탄 던지기(bomb). 기존 발사
// 패턴계(고무줄 연사·쌍딱총·비석치기)와 달리 메인 총알 발사 파이프라인을
// 건드리지 않는 독립 하위 시스템이라 별도 파일로 뺐다 — DungeonScene.ts는
// 이 컨트롤러를 생성하고(create) 매 프레임 tick()만 호출하면 된다.
//
// 순환 import를 피하려고(game-logic/index.ts가 이미 쓰는 것과 같은 트릭 —
// 그 파일 상단 주석 참고) DungeonScene.ts의 상수를 다시 import하지 않고
// 여기 별도로 작은 사본을 둔다. 값이 바뀌면 양쪽을 수동으로 맞춰야 하는
// known gap이지만, 게임 전체 캔버스 크기·자동 조준 사거리·총알 속도는
// 거의 바뀌지 않는 상수라 실질적 위험은 낮다.
const CANVAS_W = 960;
const CANVAS_H = 540;
const AUTO_TARGET_RANGE = 420;
const BULLET_SPEED = 560;

const MINE_COOLDOWN_MS = 4000;
const MINE_MAX_ACTIVE = 3;
const MINE_EXPLOSION_RADIUS = 60;
const MINE_DAMAGE_MULT = 2.0; // 메인 총알 데미지의 2배 — 설치 개수가 제한적이라 한 방이 묵직해야 함

const TURRET_COOLDOWN_MULT = 2; // 메인 총 쿨다운의 2배(블루프린트 확정)
const TURRET_DAMAGE_MULT = 0.5; // 메인 총 데미지의 50%(블루프린트 확정)

const BOMB_COOLDOWN_MS = 3000;
const BOMB_FLIGHT_MS = 480; // 포물선 비행 시간
const BOMB_FUSE_MS = 400; // 착지 후 폭발까지 지연
const BOMB_EXPLOSION_RADIUS = 80;
const BOMB_DAMAGE_MULT = 1.5;

const EXPLOSION_FX_MS = 220;

/** DungeonScene이 이 컨트롤러에 주입하는 최소한의 인터페이스. 전부 화살표
 * 함수로 감싸서 넘기면 DungeonScene의 private 메서드도 그대로 재사용할 수
 * 있다(생성 시점이 DungeonScene 내부라 private 접근이 가능하다). */
export interface AttackPatternHost {
  scene: Phaser.Scene;
  getPlayer: () => Phaser.Physics.Arcade.Sprite;
  getEnemies: () => Phaser.Physics.Arcade.Group;
  /** 메인 총알과 같은 그룹 — 자동 딱총(turret) 총알도 여기 합류시켜서
   * 기존 bullets-vs-enemies/obstacles 충돌·피격 파이프라인(데미지·속성탄
   * 적용·사망 연출)을 그대로 재사용한다. */
  getBullets: () => Phaser.Physics.Arcade.Group;
  isEnded: () => boolean;
  stacksOf: (id: UpgradeId) => number;
  effectiveBulletDamage: () => number;
  effectiveFireCooldownMs: () => number;
  findNearestEnemy: () => Phaser.Physics.Arcade.Sprite | undefined;
  /** 지뢰·폭탄 폭발용 광역 데미지 — onBulletHitEnemy와 같은 방어력 경감·
   * 방패 차단·속성탄 적용·사망 연출 규칙을 그대로 따른다(DungeonScene 소관). */
  applyAoeDamage: (x: number, y: number, radius: number, rawDamage: number) => void;
}

/** 부비트랩(mine)·자동 딱총(turret)·폭탄 던지기(bomb) 3종 신규 공격 패턴을
 * 관리하는 컨트롤러. DungeonScene은 create()에서 만들고 setup()을 한 번
 * 호출한 뒤, update()에서 매 프레임 tick()만 불러주면 된다 — 나머지는 전부
 * 이 클래스가 자기 쿨다운으로 알아서 처리한다(설계상 "플레이어 조작과
 * 무관한 자동 발사" 3종이라 트리거할 입력 훅 자체가 없다). */
export class AttackPatternsController {
  private readonly host: AttackPatternHost;

  private mines!: Phaser.Physics.Arcade.Group;
  // 가장 오래된 지뢰부터 소멸시켜야 해서(최대 3개 상한) 배치 순서를 별도로 든다.
  private mineOrder: Phaser.Physics.Arcade.Image[] = [];

  private lastMinePlacedAt = -Infinity;
  private lastTurretFiredAt = -Infinity;
  private lastBombThrownAt = -Infinity;

  constructor(host: AttackPatternHost) {
    this.host = host;
  }

  /** DungeonScene.create()에서 한 번 호출 — 지뢰 그룹 생성 + 지뢰-적 overlap
   * 등록. 자동 딱총은 기존 bullets 그룹에 합류하므로 별도 그룹/콜라이더가
   * 필요 없다(DungeonScene.create()의 기존 bullets-obstacles/enemies 콜라이더가
   * 이미 커버함). */
  setup(): void {
    this.mines = this.host.scene.physics.add.group({ allowGravity: false });
    this.host.scene.physics.add.overlap(this.mines, this.host.getEnemies(), (mineObj, enemyObj) => {
      this.onEnemyHitMine(
        mineObj as Phaser.Physics.Arcade.Image,
        enemyObj as Phaser.Physics.Arcade.Sprite,
      );
    });
  }

  /** DungeonScene.update()에서 매 프레임 호출. */
  tick(time: number): void {
    if (this.host.isEnded()) return;
    this.tickMine(time);
    this.tickTurret(time);
    this.tickBomb(time);
  }

  // ── 부비트랩(mine) ───────────────────────────────────────────

  private tickMine(time: number): void {
    if (this.host.stacksOf("mine") <= 0) return;
    if (time - this.lastMinePlacedAt < MINE_COOLDOWN_MS) return;
    this.lastMinePlacedAt = time;
    this.placeMine();
  }

  private placeMine(): void {
    const player = this.host.getPlayer();
    const mine = this.mines.create(player.x, player.y, "mine") as Phaser.Physics.Arcade.Image;
    this.mineOrder.push(mine);
    if (this.mineOrder.length > MINE_MAX_ACTIVE) {
      const oldest = this.mineOrder.shift()!;
      if (oldest.active) oldest.destroy();
    }
  }

  private onEnemyHitMine(
    mine: Phaser.Physics.Arcade.Image,
    enemy: Phaser.Physics.Arcade.Sprite,
  ): void {
    if (!mine.active || !enemy.active || enemy.getData("dying")) return;

    const idx = this.mineOrder.indexOf(mine);
    if (idx >= 0) this.mineOrder.splice(idx, 1);
    const { x, y } = mine;
    mine.destroy();

    this.spawnExplosionFx(x, y, MINE_EXPLOSION_RADIUS);
    this.host.applyAoeDamage(
      x,
      y,
      MINE_EXPLOSION_RADIUS,
      this.host.effectiveBulletDamage() * MINE_DAMAGE_MULT,
    );
  }

  // ── 자동 딱총(turret) ────────────────────────────────────────

  private tickTurret(time: number): void {
    if (this.host.stacksOf("turret") <= 0) return;
    const cooldown = this.host.effectiveFireCooldownMs() * TURRET_COOLDOWN_MULT;
    if (time - this.lastTurretFiredAt < cooldown) return;

    const target = this.host.findNearestEnemy();
    if (!target) return;
    const player = this.host.getPlayer();
    const dist = Phaser.Math.Distance.Between(player.x, player.y, target.x, target.y);
    if (dist > AUTO_TARGET_RANGE) return;

    this.lastTurretFiredAt = time;
    this.fireTurretAt(target);
  }

  private fireTurretAt(target: Phaser.Physics.Arcade.Sprite): void {
    const player = this.host.getPlayer();
    const angle = Phaser.Math.Angle.Between(player.x, player.y, target.x, target.y);
    const bullet = this.host
      .getBullets()
      .create(player.x, player.y, "turret_bullet") as Phaser.Physics.Arcade.Image;
    this.host.scene.physics.velocityFromRotation(angle, BULLET_SPEED, bullet.body!.velocity);
    // onBulletHitEnemy가 이 데이터가 있으면 effectiveBulletDamage() 대신 이
    // 값을 쓴다 — 메인 총과 완전히 같은 피격·속성탄·사망 파이프라인을 타면서
    // 데미지만 50%로 낮추는 최소한의 훅.
    bullet.setData("damageOverride", this.host.effectiveBulletDamage() * TURRET_DAMAGE_MULT);
  }

  // ── 폭탄 던지기(bomb) ────────────────────────────────────────

  private tickBomb(time: number): void {
    if (this.host.stacksOf("bomb") <= 0) return;
    if (time - this.lastBombThrownAt < BOMB_COOLDOWN_MS) return;

    const target = this.host.findNearestEnemy();
    if (!target) return;
    const player = this.host.getPlayer();
    const dist = Phaser.Math.Distance.Between(player.x, player.y, target.x, target.y);
    if (dist > AUTO_TARGET_RANGE) return;

    this.lastBombThrownAt = time;
    this.throwBombAt(target.x, target.y);
  }

  /** 착지 지점(투척 시점의 타겟 위치로 고정 — 도중에 적이 움직여도 재조준
   * 안 함, 쌍딱총의 "그 순간 쏜 것" 원칙과 동일한 이유)까지 포물선으로
   * 날아간 뒤, 짧은 지연 후 폭발(광역)한다. */
  private throwBombAt(targetX: number, targetY: number): void {
    const player = this.host.getPlayer();
    const scene = this.host.scene;
    const bomb = scene.add.image(player.x, player.y, "bomb").setDepth(5);

    scene.tweens.add({
      targets: bomb,
      x: Phaser.Math.Clamp(targetX, 0, CANVAS_W),
      y: Phaser.Math.Clamp(targetY, 0, CANVAS_H),
      scale: { from: 1, to: 1.4 }, // 포물선으로 떠오르는 느낌의 근사(높이 대신 확대)
      duration: BOMB_FLIGHT_MS,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (!bomb.active) return;
        scene.tweens.add({ targets: bomb, scale: 1, duration: 100 });
        scene.time.delayedCall(BOMB_FUSE_MS, () => this.detonateBomb(bomb));
      },
    });
  }

  private detonateBomb(bomb: Phaser.GameObjects.Image): void {
    if (!bomb.active) return;
    const { x, y } = bomb;
    bomb.destroy();
    this.spawnExplosionFx(x, y, BOMB_EXPLOSION_RADIUS);
    this.host.applyAoeDamage(
      x,
      y,
      BOMB_EXPLOSION_RADIUS,
      this.host.effectiveBulletDamage() * BOMB_DAMAGE_MULT,
    );
  }

  // ── 공용 연출 ────────────────────────────────────────────────

  /** 지뢰·폭탄 공용 폭발 연출 — 반경 크기의 원을 작게 시작해 확대·페이드.
   * Arc의 radius를 직접 트윈하는 대신(내부 지오메트리 갱신이 보장 안 됨)
   * 최종 반경으로 그려두고 scale/alpha만 트윈하는 안전한 방식을 쓴다. */
  private spawnExplosionFx(x: number, y: number, radius: number): void {
    const scene = this.host.scene;
    const fx = scene.add.circle(x, y, radius, 0xff9d4d, 0.55).setScale(0.3);
    scene.tweens.add({
      targets: fx,
      scale: 1,
      alpha: 0,
      duration: EXPLOSION_FX_MS,
      ease: "Cubic.easeOut",
      onComplete: () => fx.destroy(),
    });
  }
}
