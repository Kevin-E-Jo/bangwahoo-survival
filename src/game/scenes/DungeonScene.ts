import Phaser from "phaser/dist/phaser.js"; // 이유: EventBus.ts 상단 주석 참고
import { generateRunPlan, computeRunRewards, type NodeType } from "@/lib/game-logic";
import { EventBus } from "../EventBus";
import { CombatEvents, type RunEndedPayload } from "../events";

export const CANVAS_W = 960;
export const CANVAS_H = 540;
const GROUND_Y = 460;

const PLAYER_SPEED = 220;
const PLAYER_MAX_HP = 100;
const CONTACT_DAMAGE = { combat: 12, elite: 25 } as const;
const CONTACT_INVULN_MS = 500;

const ENEMY_SPEED = 70;
const ENEMY_HP = 20;
const ELITE_SPEED = 42;
const ELITE_HP = 70;

const BULLET_SPEED = 560;
const FIRE_COOLDOWN_MS = 180;
const RELOAD_MS = 1100;

const REST_DURATION_MS = 2000;
const LOOT_COLLECT_RADIUS = 26;

interface DungeonInitData {
  seed: string;
  upgrades: { weaponDamage: number; weaponAmmo: number };
}

type CombatItem = { itemKey: string; quantity: number };

export class DungeonScene extends Phaser.Scene {
  private seed!: string;
  private nodes!: readonly NodeType[];
  private waveIndex = 0;
  private startedAtMs = 0;

  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private aimLine!: Phaser.GameObjects.Graphics;

  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private pickup?: Phaser.Physics.Arcade.Sprite;

  private hp = PLAYER_MAX_HP;
  private ammoMax = 6;
  private ammo = 6;
  private reloading = false;
  private lastFiredAt = 0;
  private lastHitAt = -Infinity;
  private bulletDamage = 10;

  private nodeBusy = false; // 현재 노드 처리 중(스폰/휴식) — 중복 진행 방지
  private nodeType: NodeType = "combat";
  private cumulativeCurrency = 0;
  private cumulativeItems = new Map<string, number>();
  private ended = false;

  constructor() {
    super("DungeonScene");
  }

  init(data: DungeonInitData) {
    this.seed = data.seed;
    const plan = generateRunPlan(data.seed);
    this.nodes = plan.nodes;
    this.waveIndex = 0;
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
    for (let x = 0; x < CANVAS_W; x += 64) {
      this.add.image(x + 32, GROUND_Y + 24, "ground");
    }
    this.add
      .rectangle(CANVAS_W / 2, GROUND_Y + 40, CANVAS_W, 4, 0xd9dacd)
      .setOrigin(0.5, 0);

    this.physics.world.setBounds(0, 0, CANVAS_W, GROUND_Y + 40);

    this.player = this.physics.add.sprite(120, GROUND_Y - 16, "player");
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
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyR = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    this.input.on("pointerdown", () => this.tryFire());

    this.scene.launch("UIScene", {
      totalWaves: this.nodes.length,
      nodes: this.nodes,
      hp: this.hp,
      hpMax: PLAYER_MAX_HP,
      ammo: this.ammo,
      ammoMax: this.ammoMax,
    });

    this.startNode(0);
  }

  update(time: number) {
    if (this.ended) return;

    const left = this.cursors.left?.isDown || this.keyA.isDown;
    const right = this.cursors.right?.isDown || this.keyD.isDown;
    const vx = left ? -PLAYER_SPEED : right ? PLAYER_SPEED : 0;
    this.player.setVelocityX(vx);
    this.player.setFlipX(vx < 0 || (vx === 0 && this.player.flipX));

    if (Phaser.Input.Keyboard.JustDown(this.keyR)) this.startReload();

    const pointer = this.input.activePointer;
    this.aimLine.clear();
    this.aimLine.lineStyle(2, 0x24231f, 0.35);
    this.aimLine.lineBetween(this.player.x, this.player.y, pointer.worldX, pointer.worldY);

    for (const enemyObj of this.enemies.getChildren()) {
      const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) continue;
      const isElite = enemy.getData("isElite") as boolean;
      enemy.setVelocityX(isElite ? -ELITE_SPEED : -ENEMY_SPEED);
    }

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

    // 화면 밖(왼쪽)으로 빠져나간 적은 정리한다 — 그렇지 않으면 플레이어와
    // 높이가 안 맞아 접촉 판정도, 총알도 맞지 않고 지나간 개체가 영원히
    // "생존" 상태로 남아 checkWaveClear()가 절대 통과하지 못하고 웨이브가
    // 멈춰버린다 (실제 테스트 중 발견).
    let enemyEscaped = false;
    for (const enemyObj of this.enemies.getChildren()) {
      const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
      if (enemy.active && enemy.x < -40) {
        enemy.destroy();
        enemyEscaped = true;
      }
    }
    if (enemyEscaped) this.checkWaveClear();

    if (this.pickup?.active) {
      const dist = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        this.pickup.x,
        this.pickup.y,
      );
      if (dist <= LOOT_COLLECT_RADIUS) {
        this.pickup.destroy();
        this.pickup = undefined;
        this.clearCurrentNode();
      }
    }

    void time;
  }

  // ── 발사/재장전 ──────────────────────────────────────────────

  private tryFire() {
    if (this.ended || this.reloading || this.ammo <= 0) {
      if (this.ammo <= 0 && !this.reloading) this.startReload();
      return;
    }
    const now = this.time.now;
    if (now - this.lastFiredAt < FIRE_COOLDOWN_MS) return;
    this.lastFiredAt = now;

    const pointer = this.input.activePointer;
    const angle = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      pointer.worldX,
      pointer.worldY,
    );
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

  // ── 노드(웨이브) 진행 ────────────────────────────────────────

  private startNode(index: number) {
    if (this.ended) return;
    this.waveIndex = index;
    this.nodeType = this.nodes[index];
    this.nodeBusy = true;

    EventBus.emit(CombatEvents.WaveStarted, {
      waveIndex: index,
      totalWaves: this.nodes.length,
      nodeType: this.nodeType,
    });

    switch (this.nodeType) {
      case "combat":
        this.spawnWave(3, false);
        break;
      case "elite":
        this.spawnWave(1, true);
        break;
      case "loot":
        this.spawnPickup();
        break;
      case "rest":
        this.hp = PLAYER_MAX_HP;
        EventBus.emit(CombatEvents.HpChanged, { current: this.hp, max: PLAYER_MAX_HP });
        this.time.delayedCall(REST_DURATION_MS, () => this.clearCurrentNode());
        break;
    }
  }

  private spawnWave(count: number, elite: boolean) {
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * 700, () => {
        if (this.ended) return;
        const y = Phaser.Math.Between(GROUND_Y - 110, GROUND_Y - 16);
        const enemy = this.enemies.create(
          CANVAS_W + 30,
          y,
          elite ? "enemy-elite" : "enemy",
        ) as Phaser.Physics.Arcade.Sprite;
        enemy.setData("hp", elite ? ELITE_HP : ENEMY_HP);
        enemy.setData("isElite", elite);
      });
    }
    // 마지막 스폰 이후에도 그룹이 즉시 비어있지 않도록, 스폰 완료 시점에 한 번 더 체크.
    this.time.delayedCall(count * 700 + 50, () => this.checkWaveClear());
  }

  private spawnPickup() {
    this.pickup = this.physics.add.sprite(CANVAS_W - 120, GROUND_Y - 20, "pickup");
    this.pickup.setData("bob", 0);
  }

  private checkWaveClear() {
    if (this.ended || !this.nodeBusy) return;
    if (this.nodeType === "loot" || this.nodeType === "rest") return; // 별도 트리거로 처리
    if (this.enemies.countActive(true) > 0) return;
    this.clearCurrentNode();
  }

  private clearCurrentNode() {
    if (this.ended || !this.nodeBusy) return;
    this.nodeBusy = false;

    const clearedCount = this.waveIndex + 1;
    const before = computeRunRewards(this.seed, this.waveIndex);
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
      waveIndex: this.waveIndex,
      loot: { currency: currencyDelta, items: itemDeltas },
    });

    if (clearedCount >= this.nodes.length) {
      this.endRun("cleared");
      return;
    }
    this.time.delayedCall(600, () => this.startNode(this.waveIndex + 1));
  }

  private endRun(result: "cleared" | "died") {
    if (this.ended) return;
    this.ended = true;
    this.player.setVelocity(0, 0);

    const wavesCleared = result === "cleared" ? this.nodes.length : this.waveIndex;
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
