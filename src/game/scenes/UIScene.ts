import Phaser from "phaser/dist/phaser.js"; // 이유: EventBus.ts 상단 주석 참고
import type { NodeType } from "@/lib/game-logic";
import { EventBus } from "../EventBus";
import { CombatEvents, type HpChangedPayload, type AmmoChangedPayload, type WaveStartedPayload, type WaveClearedPayload } from "../events";
import { CANVAS_W } from "./DungeonScene";

const NODE_LABEL: Record<NodeType, string> = {
  combat: "전투",
  elite: "정예",
  loot: "파밍",
  rest: "휴식",
};

/** DungeonScene과 launch()로 병렬 실행되는 HUD 씬. DungeonScene을 직접
 * 참조하지 않고 combat:* 이벤트만 구독한다. */
export class UIScene extends Phaser.Scene {
  private hpBarBg!: Phaser.GameObjects.Rectangle;
  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private ammoText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private nodeIcons: Phaser.GameObjects.Container[] = [];
  private lootToast?: Phaser.GameObjects.Text;

  private handlers: { event: string; fn: (...args: unknown[]) => void }[] = [];

  constructor() {
    super("UIScene");
  }

  create(data: {
    totalWaves: number;
    nodes: readonly NodeType[];
    hp: number;
    hpMax: number;
    ammo: number;
    ammoMax: number;
  }) {
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

    this.buildNodeStrip(data.nodes);

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
      this.waveText.setText(`웨이브 ${payload.waveIndex + 1} / ${payload.totalWaves} — ${NODE_LABEL[payload.nodeType]}`);
      this.highlightNode(payload.waveIndex);
    });

    this.subscribe(CombatEvents.WaveCleared, (payload: WaveClearedPayload) => {
      const itemPart = payload.loot.items.map((i) => `${i.itemKey}×${i.quantity}`).join(", ");
      const text = `+${payload.loot.currency}${itemPart ? ` · ${itemPart}` : ""}`;
      this.showLootToast(text);
    });

    // 초기값 — launch() 시점 이전에 발행된 combat:* 이벤트는 구독 전이라
    // 놓치므로, 최초 상태는 launch data로 직접 받는다. 첫 노드는 항상
    // waveIndex 0이므로 wave-started의 최초 발행분도 여기서 재현한다.
    this.hpText.setText(`${data.hp} / ${data.hpMax}`);
    this.ammoText.setText(`탄약: ${data.ammo} / ${data.ammoMax}`);
    if (data.nodes.length > 0) {
      this.waveText.setText(`웨이브 1 / ${data.totalWaves} — ${NODE_LABEL[data.nodes[0]]}`);
      this.highlightNode(0);
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

  private buildNodeStrip(nodes: readonly NodeType[]) {
    const startX = CANVAS_W - 20 - nodes.length * 22;
    const y = 42;
    this.nodeIcons = nodes.map((type, i) => {
      const container = this.add.container(startX + i * 22, y);
      const bg = this.add.circle(0, 0, 7, colorForNode(type), 0.85);
      container.add(bg);
      return container;
    });
  }

  private highlightNode(index: number) {
    this.nodeIcons.forEach((container, i) => {
      const circle = container.list[0] as Phaser.GameObjects.Arc;
      circle.setScale(i === index ? 1.4 : 1);
      circle.setAlpha(i < index ? 0.35 : 1);
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

function colorForNode(type: NodeType): number {
  switch (type) {
    case "combat":
      return 0xd65f3c;
    case "elite":
      return 0xb3852a;
    case "loot":
      return 0xf5e9ce;
    case "rest":
      return 0x2f8f79;
  }
}
