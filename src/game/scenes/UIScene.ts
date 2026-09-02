import Phaser from "phaser/dist/phaser.js"; // 이유: EventBus.ts 상단 주석 참고
import { EventBus } from "../EventBus";
import { CombatEvents, type HpChangedPayload, type AmmoChangedPayload, type WaveStartedPayload, type WaveClearedPayload } from "../events";
import { CANVAS_W } from "./DungeonScene";

/** DungeonScene과 launch()로 병렬 실행되는 HUD 씬. DungeonScene을 직접
 * 참조하지 않고 combat:* 이벤트만 구독한다. */
export class UIScene extends Phaser.Scene {
  private hpBarBg!: Phaser.GameObjects.Rectangle;
  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private ammoText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private roundDots: Phaser.GameObjects.Arc[] = [];
  private lootToast?: Phaser.GameObjects.Text;

  private handlers: { event: string; fn: (...args: unknown[]) => void }[] = [];

  constructor() {
    super("UIScene");
  }

  create(data: { totalWaves: number; hp: number; hpMax: number; ammo: number; ammoMax: number }) {
    const HP_BAR_X = 20;
    const HP_BAR_Y = 18;
    const HP_BAR_W = 200;
    const HP_BAR_H = 18;

    this.add
      .rectangle(0, 0, HP_BAR_X * 2 + HP_BAR_W + 260, 56, 0x24231f, 0.35)
      .setOrigin(0, 0);

    this.hpBarBg = this.add
      .rectangle(HP_BAR_X, HP_BAR_Y, HP_BAR_W, HP_BAR_H, 0x3b3d32)
      .setOrigin(0, 0);
    this.hpBarFill = this.add
      .rectangle(HP_BAR_X, HP_BAR_Y, HP_BAR_W, HP_BAR_H, 0xd65f3c)
      .setOrigin(0, 0);
    this.hpText = this.add.text(HP_BAR_X + HP_BAR_W + 10, HP_BAR_Y, "", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#ffffff",
    });

    this.ammoText = this.add.text(HP_BAR_X, HP_BAR_Y + 26, "", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#f5e9ce",
    });

    this.waveText = this.add.text(CANVAS_W - 20, 16, "", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#ffffff",
    });
    this.waveText.setOrigin(1, 0);

    this.buildRoundDots(data.totalWaves);

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());

    this.subscribe(CombatEvents.HpChanged, (payload: HpChangedPayload) => {
      const ratio = payload.max > 0 ? payload.current / payload.max : 0;
      this.hpBarFill.width = 200 * Phaser.Math.Clamp(ratio, 0, 1);
      this.hpText.setText(`${payload.current} / ${payload.max}`);
    });

    this.subscribe(CombatEvents.AmmoChanged, (payload: AmmoChangedPayload) => {
      this.ammoText.setText(
        payload.current <= 0 ? "탄약: 재장전 중..." : `탄약: ${payload.current} / ${payload.max}`,
      );
    });

    this.subscribe(CombatEvents.WaveStarted, (payload: WaveStartedPayload) => {
      this.waveText.setText(`라운드 ${payload.waveIndex + 1} / ${payload.totalWaves}`);
      this.highlightRound(payload.waveIndex);
    });

    this.subscribe(CombatEvents.WaveCleared, (payload: WaveClearedPayload) => {
      const itemPart = payload.loot.items.map((i) => `${i.itemKey}×${i.quantity}`).join(", ");
      const text = `+${payload.loot.currency}${itemPart ? ` · ${itemPart}` : ""}`;
      this.showLootToast(text);
    });

    // 초기값 — launch() 시점 이전에 발행된 combat:* 이벤트는 구독 전이라
    // 놓치므로, 최초 상태는 launch data로 직접 받는다. 첫 라운드는 항상
    // waveIndex 0이므로 wave-started의 최초 발행분도 여기서 재현한다.
    this.hpText.setText(`${data.hp} / ${data.hpMax}`);
    this.ammoText.setText(`탄약: ${data.ammo} / ${data.ammoMax}`);
    if (data.totalWaves > 0) {
      this.waveText.setText(`라운드 1 / ${data.totalWaves}`);
      this.highlightRound(0);
    }
  }

  private subscribe<T>(event: string, fn: (payload: T) => void) {
    const wrapped = (payload: unknown) => fn(payload as T);
    EventBus.on(event, wrapped);
    this.handlers.push({ event, fn: wrapped });
  }

  private teardown() {
    for (const { event, fn } of this.handlers) EventBus.off(event, fn);
    this.handlers = [];
  }

  private buildRoundDots(totalWaves: number) {
    const startX = CANVAS_W - 20 - totalWaves * 22;
    const y = 42;
    this.roundDots = Array.from({ length: totalWaves }, (_, i) =>
      this.add.circle(startX + i * 22, y, 7, 0xd65f3c, 0.85),
    );
  }

  private highlightRound(index: number) {
    this.roundDots.forEach((dot, i) => {
      dot.setScale(i === index ? 1.4 : 1);
      dot.setAlpha(i < index ? 0.35 : 1);
    });
  }

  private showLootToast(text: string) {
    this.lootToast?.destroy();
    this.lootToast = this.add
      .text(CANVAS_W / 2, 70, text, {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#2f8f79",
        backgroundColor: "#ffffff",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5, 0)
      .setAlpha(0);

    this.tweens.add({
      targets: this.lootToast,
      alpha: 1,
      y: 60,
      duration: 200,
      yoyo: false,
      onComplete: () => {
        this.time.delayedCall(700, () => {
          this.tweens.add({
            targets: this.lootToast,
            alpha: 0,
            duration: 300,
            onComplete: () => this.lootToast?.destroy(),
          });
        });
      },
    });
  }
}
