import Phaser from "phaser/dist/phaser.js"; // 이유: EventBus.ts 상단 주석 참고
import {
  generateRunPlan,
  computeRunRewards,
  pickUpgradeChoices,
  ROUND_COUNT,
  type RoundPlan,
  type EnemyArchetype,
  type UpgradeId,
} from "@/lib/game-logic";
import type { ElementKey } from "@/lib/game-logic/upgradeTypes";
import { EventBus } from "../EventBus";
import { CombatEvents, type RunEndedPayload, type UpgradeChosenPayload } from "../events";
import { pickMapLayout, type ObstacleType } from "../maps";
import { applyElementalOnHit, tickStatusEffects } from "../statusEffects";

const OBSTACLE_TEXTURE: Record<ObstacleType, string> = {
  box: "obstacle_box",
  planter: "obstacle_planter",
  bench: "obstacle_bench",
};

export const CANVAS_W = 960;
export const CANVAS_H = 540;

// 월드(=물리 경계·카메라 스크롤 범위)는 뷰포트(CANVAS_W/H)의 2.5배(블루프린트
// 「카메라 추적 + 월드 확장」). 뷰포트는 화면에 보이는 크기 그대로 유지하고,
// 카메라가 플레이어를 따라다니며 이 월드 안을 스크롤한다.
export const WORLD_W = 2400;
export const WORLD_H = 1350;

const PLAYER_SPEED = 220;
const PLAYER_MAX_HP = 100;
const CONTACT_INVULN_MS = 500;

const ELITE_SPEED = 55;
const ELITE_HP = 123; // 70 × 1.75 — 다른 몹(×1.5)보다 별도로 더 세게, 마무리 보스 체감용
const ELITE_CONTACT_DAMAGE = 44; // 25 × 1.75

// 업그레이드 시스템 도입에 맞춰 전체 난이도 상향(블루프린트 「몹 난이도 상향」
// 참고) — 방어력은 신규 스탯, 총알 데미지에서 고정 경감한다(최소 1 데미지는
// 항상 보장, onBulletHitEnemy 참고).
const BASE_ARMOR = 2;

/** 엘리트를 제외한 일반 몹 유형별 스탯. 어떤 유형이 몇 마리 나오는지는
 * game-logic/runPlan.ts(시드 기반, 서버·클라 공유)가 정하고, 여기서는 유형별
 * 수치·스프라이트만 관리한다. */
const ARCHETYPE_STATS: Record<
  EnemyArchetype,
  { hp: number; speed: number; contactDamage: number; spriteBase: string }
> = {
  normal: { hp: 30, speed: 70, contactDamage: 18, spriteBase: "enemy" },
  tank: { hp: 90, speed: 40, contactDamage: 24, spriteBase: "enemy-tank" },
  speedster: { hp: 15, speed: 150, contactDamage: 15, spriteBase: "enemy-speed" },
  // speed는 "구르기" 돌진 중에만 쓰인다 — 평소엔 방패를 든 채 정지.
  roller: { hp: 45, speed: 260, contactDamage: 27, spriteBase: "enemy-roller" },
};

const ROLLER_GUARD_MS = 900; // 방패를 든 채 정지해있는 시간
const ROLLER_ROLL_MS = 500; // 한 번 구를 때 지속 시간
const ROLLER_SPIN_DEG_PER_MS = 0.9; // 구르는 동안 스프라이트 회전 속도(시각 효과)

const BULLET_SPEED = 560;
const FIRE_COOLDOWN_MS = 180;
const RELOAD_MS = 1100;
const AUTO_TARGET_RANGE = 420; // 이 거리 안의 적만 자동 조준·발사한다
const SPAWN_STAGGER_MS = 550;
const SPAWN_MARGIN = 24; // 화면 가장자리 바로 밖에서 스폰

// 업그레이드 시스템(블루프린트 「업그레이드 시스템」) — 런 한정 빌드 강화.
// 스택당 배율/가산치는 문서에 확정된 수치를 그대로 옮긴 것.
const MULTISHOT_SPREAD_DEG = 15;
const DOUBLESHOT_DELAY_MS = 80;
const DAMAGE_PCT_PER_STACK = 0.15;
const FIRERATE_MULT_PER_STACK = 0.88; // -12%/스택
const FIRERATE_FLOOR_MS = 60;
const MOVESPEED_PCT_PER_STACK = 0.1;
const AMMO_PER_STACK = 2;
const RELOAD_MULT_PER_STACK = 0.85; // -15%/스택
const RELOAD_FLOOR_MS = 400;

const WALK_TOGGLE_MS = 150; // 이동 중 idle↔walk 프레임 전환 주기
const HIT_TINT_MS = 90; // 피격 시 흰색 플래시 지속 시간
const DEATH_TWEEN_MS = 220; // 사망 시 축소·페이드 연출 길이
const MUZZLE_FLASH_MS = 70;

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
  private muzzleFlash!: Phaser.GameObjects.Arc;

  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;

  private hp = PLAYER_MAX_HP;
  // ammoMaxBase는 마을 상점(town shop) 영구 업그레이드까지만 반영한 값이고,
  // ammoMax는 여기에 런 한정 "문방구 사재기" 스택을 더한 실제 사용값이다.
  private ammoMaxBase = 6;
  private ammoMax = 6;
  private ammo = 6;
  private reloading = false;
  private lastFiredAt = 0;
  private lastHitAt = -Infinity;
  private bulletDamage = 10;

  // 런 한정 업그레이드 보유 현황(블루프린트 「업그레이드 시스템」) — 마을 상점의
  // weaponDamage/weaponAmmo(영구)와는 완전히 별개이고, 런이 끝나면 사라진다.
  private appliedUpgrades = new Map<UpgradeId, number>();

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
    this.ammoMaxBase = 6 + data.upgrades.weaponAmmo * 2;
    this.ammoMax = this.ammoMaxBase;
    this.ammo = this.ammoMax;
    this.bulletDamage = 10 + data.upgrades.weaponDamage * 4;
    this.appliedUpgrades = new Map();
    this.cumulativeCurrency = 0;
    this.cumulativeItems = new Map();
  }

  create() {
    this.startedAtMs = this.time.now;

    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0xf2f3ec);
    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, "ground").setOrigin(0, 0);

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    this.obstacles = this.physics.add.staticGroup();
    const mapLayout = pickMapLayout(this.seed);
    for (const o of mapLayout.obstacles) {
      this.obstacles.create(o.x, o.y, OBSTACLE_TEXTURE[o.type]);
    }

    this.player = this.physics.add.sprite(WORLD_W / 2, WORLD_H / 2, "player");
    this.player.setCollideWorldBounds(true);
    this.player.body?.setSize(20, 28);
    this.player.setData("baseKey", "player");

    // 카메라 추적(블루프린트 「카메라 추적 + 월드 확장」) — 뷰포트는 그대로,
    // 월드가 더 커진 만큼 카메라가 플레이어를 부드럽게 따라간다.
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    this.aimLine = this.add.graphics();
    this.muzzleFlash = this.add.circle(0, 0, 6, 0xffffff, 0.9).setVisible(false);

    this.bullets = this.physics.add.group({ allowGravity: false });
    this.enemies = this.physics.add.group({ allowGravity: false });

    // 엄폐물은 이동과 총알을 둘 다 막는다 — 적에게 원거리 공격이 없어서, 이게
    // "은폐/엄폐"가 실질적인 의미를 가지는 유일한 방식이다(플레이어가 사선을
    // 끊어 추격을 따돌리거나, 자기 총알도 막힌다는 트레이드오프를 진다).
    this.physics.add.collider(this.player, this.obstacles);
    this.physics.add.collider(this.enemies, this.obstacles);
    this.physics.add.collider(this.bullets, this.obstacles, (bulletObj, obstacleObj) => {
      this.onBulletHitObstacle(
        bulletObj as Phaser.Physics.Arcade.Image,
        obstacleObj as Phaser.Physics.Arcade.Image,
      );
    });

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

    // 런 시작 직후, 첫 라운드 스폰 전에 첫 업그레이드 선택(pickIndex 0)을 끼워 넣는다.
    this.showUpgradeChoice(0, () => this.startRound(0));
  }

  update(time: number) {
    if (this.ended) return;

    this.updateMovement(time);
    if (Phaser.Input.Keyboard.JustDown(this.keyR)) this.startReload();
    this.updateAutoAim(time);
    this.updateEnemyHoming();

    // NOTE(merge): 속성탄 상태이상 틱 처리. 병렬 브랜치가 statusEffects.ts를
    // 실제 구현으로 교체할 때 이 한 줄과 import만 바뀌면 된다 — 위아래 줄은
    // 건드릴 필요 없음.
    tickStatusEffects({ player: this.player, enemies: this.enemies, time });

    this.cleanupOffscreenBullets();
    this.cleanupEscapedEnemies();
  }

  // ── 업그레이드 선택(런당 3회: 시작 직후 / 1라운드 클리어 후 / 2라운드 클리어 후) ──

  private stacksOf(id: UpgradeId): number {
    return this.appliedUpgrades.get(id) ?? 0;
  }

  /** DungeonScene을 pause()하고 UpgradeChoiceScene을 병렬 launch, 선택 완료
   * 이벤트를 받으면 스택을 갱신하고 resume() 후 onDone을 호출한다. 후보가
   * 하나도 없으면(이론상 거의 불가능하지만 안전장치) 그냥 넘어간다. */
  private showUpgradeChoice(pickIndex: number, onDone: () => void) {
    const choices = pickUpgradeChoices(this.seed, pickIndex, this.appliedUpgrades);
    if (choices.length === 0) {
      onDone();
      return;
    }

    this.scene.pause();
    this.scene.launch("UpgradeChoiceScene", { choices });

    const onChosen = (payload: UpgradeChosenPayload) => {
      this.applyUpgrade(payload.upgradeId);
      this.scene.resume();
      onDone();
    };
    EventBus.once(CombatEvents.UpgradeChosen, onChosen);
  }

  private applyUpgrade(id: UpgradeId) {
    const stacks = this.stacksOf(id) + 1;
    this.appliedUpgrades.set(id, stacks);

    // 탄창 용량은 즉시 반영해야(+2) 다음 발사부터 바로 체감되고, 이미 장전된
    // 탄약도 같이 늘어나야 자연스럽다(재장전을 기다릴 필요 없음).
    if (id === "ammo") {
      const newMax = this.ammoMaxBase + AMMO_PER_STACK * stacks;
      const delta = newMax - this.ammoMax;
      this.ammoMax = newMax;
      this.ammo = Math.min(this.ammoMax, this.ammo + delta);
      EventBus.emit(CombatEvents.AmmoChanged, { current: this.ammo, max: this.ammoMax });
    }
  }

  // ── 스탯 강화계 실효치(마을 영구 업그레이드 위에 런 한정 스택을 곱/가산) ──

  private effectiveBulletDamage(): number {
    return this.bulletDamage * (1 + DAMAGE_PCT_PER_STACK * this.stacksOf("damage"));
  }

  private effectiveFireCooldownMs(): number {
    return Math.max(
      FIRERATE_FLOOR_MS,
      FIRE_COOLDOWN_MS * Math.pow(FIRERATE_MULT_PER_STACK, this.stacksOf("firerate")),
    );
  }

  private effectivePlayerSpeed(): number {
    return PLAYER_SPEED * (1 + MOVESPEED_PCT_PER_STACK * this.stacksOf("movespeed"));
  }

  private effectiveReloadMs(): number {
    return Math.max(
      RELOAD_FLOOR_MS,
      RELOAD_MS * Math.pow(RELOAD_MULT_PER_STACK, this.stacksOf("reload")),
    );
  }

  // ── 이동(WASD) ───────────────────────────────────────────────

  private updateMovement(time: number) {
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
    const speed = this.effectivePlayerSpeed();
    this.player.setVelocity(vx * speed, vy * speed);
    if (vx < 0) this.player.setFlipX(true);
    else if (vx > 0) this.player.setFlipX(false);

    this.updateWalkFrame(this.player, vx !== 0 || vy !== 0, time);
  }

  /** idle↔walk 텍스처를 주기적으로 토글해 간단한 걷기 연출을 낸다. 걷기
   * 프레임이 없는 텍스처(예: enemy-elite)는 조용히 건너뛴다. */
  private updateWalkFrame(sprite: Phaser.Physics.Arcade.Sprite, moving: boolean, time: number) {
    const baseKey = sprite.getData("baseKey") as string | undefined;
    if (!baseKey) return;
    const walkKey = `${baseKey}-walk`;
    if (!this.textures.exists(walkKey)) return;

    if (!moving) {
      if (sprite.texture.key !== baseKey) sprite.setTexture(baseKey);
      sprite.setData("walkToggleAt", 0);
      return;
    }
    const toggleAt = (sprite.getData("walkToggleAt") as number) ?? 0;
    if (time - toggleAt < WALK_TOGGLE_MS) return;
    sprite.setData("walkToggleAt", time);
    const showWalk = sprite.texture.key !== walkKey;
    sprite.setTexture(showWalk ? walkKey : baseKey);
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
      if (!enemy.active || enemy.getData("dying")) continue;
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
    if (time - this.lastFiredAt < this.effectiveFireCooldownMs()) return;
    this.lastFiredAt = time;

    const baseAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    const angles = this.computeFiringAngles(baseAngle);
    const originX = this.player.x;
    const originY = this.player.y;
    this.fireBulletSet(angles, originX, originY);
    this.showMuzzleFlash(baseAngle);

    // 쌍딱총(doubleshot) — 확산 없이 같은 각도 배열을 그대로, 같은 발사 지점
    // (originX/Y)에서 약 80ms 뒤 한 번 더 쏜다. 그 사이 플레이어가 움직여도
    // "그 순간 쐈던 것과 완전히 겹치는 한 발"이라는 의미가 유지되도록 재조준하지 않는다.
    if (this.stacksOf("doubleshot") > 0) {
      this.time.delayedCall(DOUBLESHOT_DELAY_MS, () => {
        if (this.ended) return;
        this.fireBulletSet(angles, originX, originY);
      });
    }

    this.ammo -= 1;
    EventBus.emit(CombatEvents.AmmoChanged, { current: this.ammo, max: this.ammoMax });
    if (this.ammo <= 0) this.startReload();
  }

  /** 고무줄 연사(multishot) 스택 수만큼 각도 배열을 만든다 — 기본 1발이면
   * baseAngle 그대로, 스택이 있으면 baseAngle을 중심으로 15° 간격 부채꼴로
   * 균등 확산시킨다(최대 3스택 = 4발). 쌍딱총이 "이 배열 전체"를 한 번 더
   * 쏘는 방식으로 자연스럽게 합성되도록, 발사 로직은 이 각도 배열만 소비한다. */
  private computeFiringAngles(baseAngle: number): number[] {
    const bulletCount = 1 + this.stacksOf("multishot");
    if (bulletCount <= 1) return [baseAngle];

    // 짝수 개일 때 좌우 대칭으로만 벌리면 정중앙(진짜 조준각)엔 총알이 하나도
    // 안 간다(2발 = -7.5°/+7.5°뿐이라 가운데 타겟은 항상 빗나감). 그래서 항상
    // baseAngle을 하나 포함시키고, 나머지를 좌→우→좌→우 순서로 덧붙인다 —
    // 홀수 개는 기존과 동일한 대칭 부채꼴이 되고, 짝수 개만 가운데 하나 +
    // 한쪽으로 치우친 나머지가 된다.
    const spreadRad = Phaser.Math.DegToRad(MULTISHOT_SPREAD_DEG);
    const angles = [baseAngle];
    for (let extra = 1; extra < bulletCount; extra++) {
      const step = Math.ceil(extra / 2) * spreadRad;
      const sign = extra % 2 === 1 ? 1 : -1;
      angles.push(baseAngle + sign * step);
    }
    return angles;
  }

  /** 주어진 각도 배열대로 총알을 한 세트 생성한다. 비석치기(ricochet) 스택이
   * 있으면 각 총알에 남은 튕김 횟수를 데이터로 심어둔다(obstacle collider에서 소비). */
  private fireBulletSet(angles: readonly number[], originX: number, originY: number) {
    const bounces = this.stacksOf("ricochet");
    for (const angle of angles) {
      const bullet = this.bullets.create(originX, originY, "bullet") as Phaser.Physics.Arcade.Image;
      this.physics.velocityFromRotation(angle, BULLET_SPEED, bullet.body!.velocity);
      if (bounces > 0) bullet.setData("bouncesLeft", bounces);
    }
  }

  /** 발사 순간 총구 앞에 잠깐 뜨는 섬광 — 자동사격이라 타격감을 눈으로
   * 보여줄 지점이 마땅치 않아서, 발사 자체에 최소한의 피드백을 준다. */
  private showMuzzleFlash(angle: number) {
    const dist = 14;
    this.muzzleFlash.setPosition(
      this.player.x + Math.cos(angle) * dist,
      this.player.y + Math.sin(angle) * dist,
    );
    this.muzzleFlash.setVisible(true).setAlpha(1);
    this.time.delayedCall(MUZZLE_FLASH_MS, () => this.muzzleFlash.setVisible(false));
  }

  private startReload() {
    if (this.reloading || this.ammo >= this.ammoMax) return;
    this.reloading = true;
    this.time.delayedCall(this.effectiveReloadMs(), () => {
      this.ammo = this.ammoMax;
      this.reloading = false;
      EventBus.emit(CombatEvents.AmmoChanged, { current: this.ammo, max: this.ammoMax });
    });
  }

  // ── 적 이동(플레이어 추적) ────────────────────────────────────

  private updateEnemyHoming() {
    const time = this.time.now;
    for (const enemyObj of this.enemies.getChildren()) {
      const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active || enemy.getData("dying")) continue;

      if (enemy.getData("isElite") as boolean) {
        this.homeTowardPlayer(enemy, ELITE_SPEED, time);
        continue;
      }
      const archetype = enemy.getData("archetype") as EnemyArchetype;
      if (archetype === "roller") {
        this.updateRoller(enemy, time);
        continue;
      }
      this.homeTowardPlayer(enemy, ARCHETYPE_STATS[archetype].speed, time);
    }
  }

  private homeTowardPlayer(enemy: Phaser.Physics.Arcade.Sprite, speed: number, time: number) {
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    enemy.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    enemy.setFlipX(Math.cos(angle) < 0);
    this.updateWalkFrame(enemy, true, time);
  }

  /** 롤러형 몹의 움직임: 평소엔 방패(엄폐물)를 든 채 완전히 정지(총알 무효)해
   * 있다가, 일정 시간마다 그 순간 플레이어 방향으로 한 번 굴러 돌진한다.
   * 구르는 동안은 방향을 다시 좇지 않는다(구르기로만, 즉 이산적으로만
   * 이동) — 그래서 플레이어가 타이밍을 보고 굴러오는 궤적을 피할 수 있다. */
  private updateRoller(enemy: Phaser.Physics.Arcade.Sprite, time: number) {
    const state = (enemy.getData("rollState") as "guard" | "rolling" | undefined) ?? "guard";
    const stateAt = (enemy.getData("rollStateAt") as number | undefined) ?? time;

    if (state === "guard") {
      enemy.setVelocity(0, 0);
      enemy.setAngle(0);
      enemy.setFlipX(this.player.x < enemy.x);
      if (time - stateAt >= ROLLER_GUARD_MS) {
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
        enemy.setData("rollState", "rolling");
        enemy.setData("rollStateAt", time);
        const rollSpeed = ARCHETYPE_STATS.roller.speed;
        enemy.setVelocity(Math.cos(angle) * rollSpeed, Math.sin(angle) * rollSpeed);
      }
      return;
    }

    enemy.setAngle((time - stateAt) * ROLLER_SPIN_DEG_PER_MS);
    if (time - stateAt >= ROLLER_ROLL_MS) {
      enemy.setData("rollState", "guard");
      enemy.setData("rollStateAt", time);
      enemy.setVelocity(0, 0);
      enemy.setAngle(0);
    }
  }

  private cleanupOffscreenBullets() {
    for (const bulletObj of this.bullets.getChildren()) {
      const bullet = bulletObj as Phaser.Physics.Arcade.Image;
      if (!bullet.active) continue;
      if (
        bullet.x < -16 ||
        bullet.x > WORLD_W + 16 ||
        bullet.y < -16 ||
        bullet.y > WORLD_H + 16
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
      if (enemy.x < -60 || enemy.x > WORLD_W + 60 || enemy.y < -60 || enemy.y > WORLD_H + 60) {
        enemy.destroy();
        enemyEscaped = true;
      }
    }
    if (enemyEscaped) this.checkWaveClear();
  }

  // ── 충돌 처리 ────────────────────────────────────────────────

  /** 비석치기(ricochet) 스택이 있는 총알은 엄폐물에 맞아도 파괴되지 않고
   * 반사각으로 튕겨 계속 날아간다. 장애물이 축에 정렬된 사각형이라, 정밀한
   * 충돌면 계산 대신 "더 얕게 겹친 축을 반사면으로 본다"는 근사치를 쓴다 —
   * 완벽한 물리는 아니어도 "튕겨 나간다"는 느낌은 충분히 낸다. */
  private onBulletHitObstacle(
    bullet: Phaser.Physics.Arcade.Image,
    obstacle: Phaser.Physics.Arcade.Image,
  ) {
    if (!bullet.active) return;

    const bouncesLeft = (bullet.getData("bouncesLeft") as number | undefined) ?? 0;
    if (bouncesLeft <= 0) {
      bullet.destroy();
      return;
    }

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    const obstacleBody = obstacle.body as Phaser.Physics.Arcade.StaticBody;
    const dx = bullet.x - obstacle.x;
    const dy = bullet.y - obstacle.y;
    const overlapX = obstacleBody.halfWidth - Math.abs(dx);
    const overlapY = obstacleBody.halfHeight - Math.abs(dy);

    if (overlapX < overlapY) {
      body.velocity.x *= -1;
    } else {
      body.velocity.y *= -1;
    }

    bullet.setData("bouncesLeft", bouncesLeft - 1);
  }

  private onBulletHitEnemy(
    bullet: Phaser.Physics.Arcade.Image,
    enemy: Phaser.Physics.Arcade.Sprite,
  ) {
    if (!bullet.active || !enemy.active || enemy.getData("dying")) return;
    bullet.destroy();

    // 롤러형은 구르는 중이 아니면 방패를 들고 있어 총알이 데미지 없이 막힌다.
    const archetype = enemy.getData("archetype") as EnemyArchetype | undefined;
    if (archetype === "roller" && enemy.getData("rollState") !== "rolling") {
      this.flashHit(enemy, 0xffe066); // 노란 틴트로 "막혔다"를 흰색 피격과 구분
      return;
    }

    // 기본 방어력(전체 몹 공통) — 총알 데미지에서 고정 경감, 최소 1 데미지는 항상 보장.
    const dmg = Math.max(1, Math.round(this.effectiveBulletDamage()) - BASE_ARMOR);
    const hp = (enemy.getData("hp") as number) - dmg;
    enemy.setData("hp", hp);

    this.applyElementalHits(enemy, dmg);

    if (hp <= 0) {
      this.killEnemy(enemy);
    } else {
      this.flashHit(enemy);
    }
  }

  /** 보유한 속성탄(elem_*)을 전부 순회해 명중 효과를 건다 — 스택형이라 여러
   * 속성탄을 동시에 들고 있으면 전부 함께 적용된다(서로 상쇄 없음). 실제
   * 상태이상 로직은 병렬 브랜치가 statusEffects.ts에 구현하고, 여기서는
   * "무엇이 몇 스택 있는지"만 넘겨준다. */
  private applyElementalHits(enemy: Phaser.Physics.Arcade.Sprite, hitDamage: number) {
    if (this.appliedUpgrades.size === 0) return;
    const ctx = { player: this.player, enemies: this.enemies, time: this.time.now };
    // Map을 for-of로 직접 순회하면 이 프로젝트의 tsconfig(target 미지정 → ES3
    // 기본값)에서 downlevelIteration 에러가 나서, forEach로 순회한다.
    this.appliedUpgrades.forEach((stacks, id) => {
      if (stacks <= 0 || !id.startsWith("elem_")) return;
      const element = id.slice("elem_".length) as ElementKey;
      applyElementalOnHit(enemy, element, stacks, hitDamage, ctx);
    });
  }

  private onPlayerHitEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
    if (this.ended || !enemy.active || enemy.getData("dying")) return;
    const now = this.time.now;
    if (now - this.lastHitAt < CONTACT_INVULN_MS) return;
    this.lastHitAt = now;

    const contactDamage = enemy.getData("contactDamage") as number;
    this.hp = Math.max(0, this.hp - contactDamage);
    EventBus.emit(CombatEvents.HpChanged, { current: this.hp, max: PLAYER_MAX_HP });
    this.flashHit(this.player);
    this.killEnemy(enemy);

    if (this.hp <= 0) {
      this.endRun("died");
      return;
    }
  }

  /** 짧게 틴트 플래시 후 원래대로 — 총알/접촉 피격 둘 다 재사용. 기본은
   * 흰색(피격), 롤러형의 방패 차단은 노란색으로 구분해서 보여준다. */
  private flashHit(sprite: Phaser.Physics.Arcade.Sprite, tint = 0xffffff) {
    sprite.setTintFill(tint);
    this.time.delayedCall(HIT_TINT_MS, () => sprite.clearTint());
  }

  /** 즉시 destroy하는 대신 살짝 찌그러지며 사라지는 사망 연출을 재생한다.
   * 연출 중엔 "dying" 플래그로 타겟팅·추적·재판정에서 제외하고, 물리
   * 충돌도 꺼서 죽은 채로 플레이어를 막거나 총알을 더 맞지 않게 한다.
   * 애니메이션이 끝나야 실제로 destroy + checkWaveClear를 호출한다 —
   * 그래야 "마지막 한 마리"가 사라지는 도중에 라운드가 클리어 판정되는
   * 것도 자연히 방지된다. */
  private killEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
    if (enemy.getData("dying")) return;
    enemy.setData("dying", true);
    enemy.setVelocity(0, 0);
    if (enemy.body) (enemy.body as Phaser.Physics.Arcade.Body).enable = false;
    enemy.setTintFill(0xffffff);

    this.tweens.add({
      targets: enemy,
      scale: 0,
      alpha: 0,
      angle: Phaser.Math.Between(-90, 90),
      duration: DEATH_TWEEN_MS,
      ease: "Cubic.easeIn",
      onComplete: () => {
        enemy.destroy();
        this.checkWaveClear();
      },
    });
  }

  // ── 라운드 진행 ──────────────────────────────────────────────

  private startRound(index: number) {
    if (this.ended) return;
    this.roundIndex = index;
    this.roundBusy = true;

    EventBus.emit(CombatEvents.WaveStarted, { waveIndex: index, totalWaves: ROUND_COUNT });

    const plan = this.rounds[index];
    const spawns: Array<{ isElite: boolean; archetype?: EnemyArchetype }> = [
      ...plan.archetypes.map((archetype) => ({ isElite: false, archetype })),
      ...Array.from({ length: plan.eliteCount }, () => ({ isElite: true })),
    ];
    spawns.forEach((spawn, i) => {
      this.time.delayedCall(i * SPAWN_STAGGER_MS, () => {
        if (this.ended) return;
        const { x, y } = this.randomEdgePoint();
        const stats = spawn.archetype ? ARCHETYPE_STATS[spawn.archetype] : undefined;
        const textureKey = spawn.isElite ? "enemy-elite" : stats!.spriteBase;

        const enemy = this.enemies.create(x, y, textureKey) as Phaser.Physics.Arcade.Sprite;
        enemy.setData("hp", spawn.isElite ? ELITE_HP : stats!.hp);
        enemy.setData("isElite", spawn.isElite);
        enemy.setData("baseKey", textureKey);
        enemy.setData("contactDamage", spawn.isElite ? ELITE_CONTACT_DAMAGE : stats!.contactDamage);
        if (spawn.archetype) {
          enemy.setData("archetype", spawn.archetype);
          if (spawn.archetype === "roller") {
            enemy.setData("rollState", "guard");
            enemy.setData("rollStateAt", this.time.now);
          }
        }
      });
    });
    // 마지막 스폰 이후에도 그룹이 즉시 비어있지 않도록, 스폰 완료 시점에 한 번 더 체크.
    this.time.delayedCall(spawns.length * SPAWN_STAGGER_MS + 50, () => this.checkWaveClear());
  }

  /** 월드 가장자리 바로 밖 임의의 지점 — 사방에서 플레이어를 향해 등장한다.
   * 월드가 뷰포트보다 커진 뒤로는 "화면 밖"이 아니라 "월드 밖"에서 스폰돼야
   * 카메라가 플레이어를 따라갈 때도 몹이 항상 월드 경계 바깥에서 자연스럽게
   * 걸어 들어온다. */
  private randomEdgePoint(): { x: number; y: number } {
    switch (Phaser.Math.Between(0, 3)) {
      case 0:
        return { x: Phaser.Math.Between(0, WORLD_W), y: -SPAWN_MARGIN };
      case 1:
        return { x: Phaser.Math.Between(0, WORLD_W), y: WORLD_H + SPAWN_MARGIN };
      case 2:
        return { x: -SPAWN_MARGIN, y: Phaser.Math.Between(0, WORLD_H) };
      default:
        return { x: WORLD_W + SPAWN_MARGIN, y: Phaser.Math.Between(0, WORLD_H) };
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

    // 1라운드 클리어 후(pickIndex 1) / 2라운드 클리어 후(pickIndex 2) 업그레이드
    // 선택을 끼워 넣는다 — 여기 도달했다는 건 clearedCount < ROUND_COUNT(3)이라는
    // 뜻이라 roundIndex는 항상 0 아니면 1이고, 다음 pickIndex도 자연히 1 또는 2가
    // 된다. 3라운드(엘리트) 클리어 후에는 위에서 이미 endRun으로 빠져서 4번째
    // 선택은 생기지 않는다.
    const nextRoundIndex = this.roundIndex + 1;
    const pickIndex = nextRoundIndex;
    this.time.delayedCall(600, () => {
      this.showUpgradeChoice(pickIndex, () => this.startRound(nextRoundIndex));
    });
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
