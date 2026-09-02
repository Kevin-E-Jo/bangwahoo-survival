import Phaser from "phaser/dist/phaser.js"; // 이유: EventBus.ts 상단 주석 참고
import { generateRunPlan, computeRunRewards, ROUND_COUNT, type RoundPlan } from "@/lib/game-logic";
import { EventBus } from "../EventBus";
import { CombatEvents, type RunEndedPayload } from "../events";

export const CANVAS_W = 960;
export const CANVAS_H = 540;

const PLAYER_SPEED = 220;
const PLAYER_MAX_HP = 100;
const CONTACT_DAMAGE = { combat: 12, elite: 25 } as const;
const CONTACT_INVULN_MS = 500;

const ENEMY_SPEED = 70;
const ENEMY_HP = 20;
const ELITE_SPEED = 55;
const ELITE_HP = 70;

const BULLET_SPEED = 560;
const FIRE_COOLDOWN_MS = 180;
const RELOAD_MS = 1100;
const AUTO_TARGET_RANGE = 420; // 이 거리 안의 적만 자동 조준·발사한다
const SPAWN_STAGGER_MS = 550;
const SPAWN_MARGIN = 24; // 화면 가장자리 바로 밖에서 스폰

interface DungeonInitData {
  seed: string;
  upgrades: { weaponDamage: number; weaponAmmo: number };
}

type CombatItem = { itemKey: string; quantity: number };

/** 사선 탑뷰 웨이브 서바이벌. 조준·발사는 자동(가장 가까운 적)이고,
 * 플레이어는 WASD로 2D 평면을 자유 이동한다. 정확히 3라운드 고정 —
 * 라운드 인덱스별 보상 확률은 game-logic/rewards.ts 소관. */
export class DungeonScene extends Phaser.Scene {
  private seed!: string;
  private rounds!: readonly RoundPlan[];
  private roundIndex = 0;
  private startedAtMs = 0;

  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private aimLine!: Phaser.GameObjects.Graphics;

  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;

  private hp = PLAYER_MAX_HP;
  private ammoMax = 6;
  private ammo = 6;
  private reloading = false;
  private lastFiredAt = 0;
  private lastHitAt = -Infinity;
  private bulletDamage = 10;

  private roundBusy = false; // 현재 라운드 스폰/진행 중 — 중복 진행 방지
  private cumulativeCurrency = 0;
  private cumulativeItems = new Map<string, number>();
  private ended = false;

  constructor() {
    super("DungeonScene");
  }

  init(data: DungeonInitData) {
    this.seed = data.seed;
    this.rounds = generateRunPlan(data.seed).rounds;
    this.roundIndex = 0;
    this.ended = false;
    this.hp = PLAYER_MAX_HP;
    this.ammoMax = 6 + data.upgrades.weaponAmmo * 2;
    this.ammo = this.ammoMax;
    this.bulletDamage = 10 + data.upgrades.weaponDamage * 4;
    this.cumulativeCurrency = 0;
    this.cumulativeItems = new Map();
  }

  create() {
    this.startedAtMs = this.time.now;

    this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, 0xf2f3ec);
    this.add.tileSprite(0, 0, CANVAS_W, CANVAS_H, "ground").setOrigin(0, 0);

    this.physics.world.setBounds(0, 0, CANVAS_W, CANVAS_H);

    this.player = this.physics.add.sprite(CANVAS_W / 2, CANVAS_H / 2, "player");
    this.player.setCollideWorldBounds(true);
    this.player.body?.setSize(20, 28);

    this.aimLine = this.add.graphics();

    this.bullets = this.physics.add.group({ allowGravity: false });
    this.enemies = this.physics.add.group({ allowGravity: false });

    this.physics.add.overlap(this.bullets, this.enemies, (bulletObj, enemyObj) => {
      this.onBulletHitEnemy(
        bulletObj as Phaser.Physics.Arcade.Image,
        enemyObj as Phaser.Physics.Arcade.Sprite,
      );
    });
    this.physics.add.overlap(this.player, this.enemies, (_p, enemyObj) => {
      this.onPlayerHitEnemy(enemyObj as Phaser.Physics.Arcade.Sprite);
    });

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error("keyboard input unavailable");
    this.cursors = keyboard.createCursorKeys();
    this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyR = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    this.scene.launch("UIScene", {
      totalWaves: ROUND_COUNT,
      hp: this.hp,
      hpMax: PLAYER_MAX_HP,
      ammo: this.ammo,
      ammoMax: this.ammoMax,
    });

    this.startRound(0);
  }

  update(time: number) {
    if (this.ended) return;

    this.updateMovement();
    if (Phaser.Input.Keyboard.JustDown(this.keyR)) this.startReload();
    this.updateAutoAim(time);
    this.updateEnemyHoming();
    this.cleanupOffscreenBullets();
    this.cleanupEscapedEnemies();
  }

  // ── 이동(WASD) ───────────────────────────────────────────────

  private updateMovement() {
    const left = this.keyA.isDown || this.cursors.left?.isDown;
    const right = this.keyD.isDown || this.cursors.right?.isDown;
    const up = this.keyW.isDown || this.cursors.up?.isDown;
    const down = this.keyS.isDown || this.cursors.down?.isDown;

    let vx = (right ? 1 : 0) - (left ? 1 : 0);
    let vy = (down ? 1 : 0) - (up ? 1 : 0);
    if (vx !== 0 && vy !== 0) {
      vx *= Math.SQRT1_2;
      vy *= Math.SQRT1_2;
    }
    this.player.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED);
    if (vx < 0) this.player.setFlipX(true);
    else if (vx > 0) this.player.setFlipX(false);
  }

  // ── 자동 조준·발사 ────────────────────────────────────────────

  private updateAutoAim(time: number) {
    const target = this.findNearestEnemy();
    this.aimLine.clear();
    if (!target) return;

    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y);
    this.aimLine.lineStyle(1.5, 0x24231f, 0.25);
    this.aimLine.lineBetween(this.player.x, this.player.y, target.x, target.y);
    if (dist > AUTO_TARGET_RANGE) return;

    this.tryFireAt(target, time);
  }

  private findNearestEnemy(): Phaser.Physics.Arcade.Sprite | undefined {
    let closest: Phaser.Physics.Arcade.Sprite | undefined;
    let closestDist = Infinity;
    for (const enemyObj of this.enemies.getChildren()) {
      const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (dist < closestDist) {
        closestDist = dist;
        closest = enemy;
      }
    }
    return closest;
  }

  private tryFireAt(target: Phaser.Physics.Arcade.Sprite, time: number) {
    if (this.ended || this.reloading || this.ammo <= 0) {
      if (this.ammo <= 0 && !this.reloading) this.startReload();
      return;
    }
    if (time - this.lastFiredAt < FIRE_COOLDOWN_MS) return;
    this.lastFiredAt = time;

    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    const bullet = this.bullets.create(
      this.player.x,
      this.player.y,
      "bullet",
    ) as Phaser.Physics.Arcade.Image;
    this.physics.velocityFromRotation(angle, BULLET_SPEED, bullet.body!.velocity);

    this.ammo -= 1;
    EventBus.emit(CombatEvents.AmmoChanged, { current: this.ammo, max: this.ammoMax });
    if (this.ammo <= 0) this.startReload();
  }

  private startReload() {
    if (this.reloading || this.ammo >= this.ammoMax) return;
    this.reloading = true;
    this.time.delayedCall(RELOAD_MS, () => {
      this.ammo = this.ammoMax;
      this.reloading = false;
      EventBus.emit(CombatEvents.AmmoChanged, { current: this.ammo, max: this.ammoMax });
    });
  }

  // ── 적 이동(플레이어 추적) ────────────────────────────────────

  private updateEnemyHoming() {
    for (const enemyObj of this.enemies.getChildren()) {
      const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) continue;
      const isElite = enemy.getData("isElite") as boolean;
      const speed = isElite ? ELITE_SPEED : ENEMY_SPEED;
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      enemy.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      enemy.setFlipX(Math.cos(angle) < 0);
    }
  }

  private cleanupOffscreenBullets() {
    for (const bulletObj of this.bullets.getChildren()) {
      const bullet = bulletObj as Phaser.Physics.Arcade.Image;
      if (!bullet.active) continue;
      if (
        bullet.x < -16 ||
        bullet.x > CANVAS_W + 16 ||
        bullet.y < -16 ||
        bullet.y > CANVAS_H + 16
      ) {
        bullet.destroy();
      }
    }
  }

  // 화면 밖으로 완전히 빠져나간 적은 정리한다 — 추적 이동이라 평소엔 거의
  // 안 벌어지지만, 밀림/겹침 등으로 순간적으로 벗어났을 때 대비한 안전망.
  // 없으면 그 개체가 영원히 "생존" 상태로 남아 checkWaveClear()가 절대
  // 통과하지 못하고 라운드가 멈춰버린다 (실제 테스트 중 발견한 버그).
  private cleanupEscapedEnemies() {
    let enemyEscaped = false;
    for (const enemyObj of this.enemies.getChildren()) {
      const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) continue;
      if (enemy.x < -60 || enemy.x > CANVAS_W + 60 || enemy.y < -60 || enemy.y > CANVAS_H + 60) {
        enemy.destroy();
        enemyEscaped = true;
      }
    }
    if (enemyEscaped) this.checkWaveClear();
  }

  // ── 충돌 처리 ────────────────────────────────────────────────

  private onBulletHitEnemy(
    bullet: Phaser.Physics.Arcade.Image,
    enemy: Phaser.Physics.Arcade.Sprite,
  ) {
    if (!bullet.active || !enemy.active) return;
    bullet.destroy();

    const hp = (enemy.getData("hp") as number) - this.bulletDamage;
    enemy.setData("hp", hp);
    if (hp <= 0) {
      enemy.destroy();
      this.checkWaveClear();
    }
  }

  private onPlayerHitEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
    if (this.ended || !enemy.active) return;
    const now = this.time.now;
    if (now - this.lastHitAt < CONTACT_INVULN_MS) return;
    this.lastHitAt = now;

    const isElite = enemy.getData("isElite") as boolean;
    this.hp = Math.max(0, this.hp - CONTACT_DAMAGE[isElite ? "elite" : "combat"]);
    EventBus.emit(CombatEvents.HpChanged, { current: this.hp, max: PLAYER_MAX_HP });
    enemy.destroy();

    if (this.hp <= 0) {
      this.endRun("died");
      return;
    }
    this.checkWaveClear();
  }

  // ── 라운드 진행 ──────────────────────────────────────────────

  private startRound(index: number) {
    if (this.ended) return;
    this.roundIndex = index;
    this.roundBusy = true;

    EventBus.emit(CombatEvents.WaveStarted, { waveIndex: index, totalWaves: ROUND_COUNT });

    const plan = this.rounds[index];
    const spawnIsElite: boolean[] = [
      ...Array<boolean>(plan.enemyCount).fill(false),
      ...Array<boolean>(plan.eliteCount).fill(true),
    ];
    spawnIsElite.forEach((isElite, i) => {
      this.time.delayedCall(i * SPAWN_STAGGER_MS, () => {
        if (this.ended) return;
        const { x, y } = this.randomEdgePoint();
        const enemy = this.enemies.create(
          x,
          y,
          isElite ? "enemy-elite" : "enemy",
        ) as Phaser.Physics.Arcade.Sprite;
        enemy.setData("hp", isElite ? ELITE_HP : ENEMY_HP);
        enemy.setData("isElite", isElite);
      });
    });
    // 마지막 스폰 이후에도 그룹이 즉시 비어있지 않도록, 스폰 완료 시점에 한 번 더 체크.
    this.time.delayedCall(spawnIsElite.length * SPAWN_STAGGER_MS + 50, () => this.checkWaveClear());
  }

  /** 화면 가장자리 바로 밖 임의의 지점 — 사방에서 플레이어를 향해 등장한다. */
  private randomEdgePoint(): { x: number; y: number } {
    switch (Phaser.Math.Between(0, 3)) {
      case 0:
        return { x: Phaser.Math.Between(0, CANVAS_W), y: -SPAWN_MARGIN };
      case 1:
        return { x: Phaser.Math.Between(0, CANVAS_W), y: CANVAS_H + SPAWN_MARGIN };
      case 2:
        return { x: -SPAWN_MARGIN, y: Phaser.Math.Between(0, CANVAS_H) };
      default:
        return { x: CANVAS_W + SPAWN_MARGIN, y: Phaser.Math.Between(0, CANVAS_H) };
    }
  }

  private checkWaveClear() {
    if (this.ended || !this.roundBusy) return;
    if (this.enemies.countActive(true) > 0) return;
    this.clearCurrentRound();
  }

  private clearCurrentRound() {
    if (this.ended || !this.roundBusy) return;
    this.roundBusy = false;

    const clearedCount = this.roundIndex + 1;
    const before = computeRunRewards(this.seed, this.roundIndex);
    const after = computeRunRewards(this.seed, clearedCount);
    const currencyDelta = after.currency - before.currency;
    const itemDeltas = diffItems(before.items, after.items);

    this.cumulativeCurrency = after.currency;
    for (const item of itemDeltas) {
      this.cumulativeItems.set(
        item.itemKey,
        (this.cumulativeItems.get(item.itemKey) ?? 0) + item.quantity,
      );
    }

    EventBus.emit(CombatEvents.WaveCleared, {
      waveIndex: this.roundIndex,
      loot: { currency: currencyDelta, items: itemDeltas },
    });

    if (clearedCount >= ROUND_COUNT) {
      this.endRun("cleared");
      return;
    }
    this.time.delayedCall(600, () => this.startRound(this.roundIndex + 1));
  }

  private endRun(result: "cleared" | "died") {
    if (this.ended) return;
    this.ended = true;
    this.player.setVelocity(0, 0);

    const wavesCleared = result === "cleared" ? ROUND_COUNT : this.roundIndex;
    const collectedItems: CombatItem[] = Array.from(this.cumulativeItems, ([itemKey, quantity]) => ({
      itemKey,
      quantity,
    }));
    const payload: RunEndedPayload = {
      result,
      collectedItems,
      wavesCleared,
      elapsedMs: Math.round(this.time.now - this.startedAtMs),
      seed: this.seed,
    };

    EventBus.emit(CombatEvents.RunEnded, payload);
    this.scene.stop("UIScene");
    this.scene.start("ResultScene", payload);
  }
}

function diffItems(before: CombatItem[], after: CombatItem[]): CombatItem[] {
  const beforeMap = new Map(before.map((i) => [i.itemKey, i.quantity]));
  const deltas: CombatItem[] = [];
  for (const item of after) {
    const prev = beforeMap.get(item.itemKey) ?? 0;
    if (item.quantity > prev) deltas.push({ itemKey: item.itemKey, quantity: item.quantity - prev });
  }
  return deltas;
}
