import Phaser from "phaser/dist/phaser.js"; // 이유: EventBus.ts 상단 주석 참고
import type { UpgradeCard } from "@/lib/game-logic/upgrades";
import { EventBus } from "../EventBus";
import { CombatEvents } from "../events";
import { CANVAS_W, CANVAS_H } from "./DungeonScene";

const CAPSULE_RADIUS = 42;
// "그 시절 가챠캡슐" 파스텔 톤 — 실제 아트 패스가 나오기 전까지의 자리표시.
const CAPSULE_COLORS = [0xffb6c1, 0xa0d8ef, 0xfff6a5];
const OPEN_TWEEN_MS = 160;
const ADVANCE_DELAY_MS = 900; // 내용물이 드러난 뒤 다음 화면으로 넘어가기 전 대기

interface Capsule {
  container: Phaser.GameObjects.Container;
  shell: Phaser.GameObjects.Arc;
}

/** DungeonScene과 launch()로 병렬 실행되는 업그레이드 선택 씬(UIScene과 같은
 * 패턴). DungeonScene은 이 씬이 떠 있는 동안 scene.pause()로 멈춰 있고, 캡슐을
 * 골라 열리는 연출이 끝나면 combat:upgrade-chosen을 발행하고 스스로
 * scene.stop()한다 — DungeonScene은 그 이벤트를 받아 resume()한다. */
export class UpgradeChoiceScene extends Phaser.Scene {
  private choices!: UpgradeCard[];
  private capsules: Capsule[] = [];
  private chosen = false;

  constructor() {
    super("UpgradeChoiceScene");
  }

  create(data: { choices: UpgradeCard[] }) {
    this.choices = data.choices;
    this.chosen = false;
    this.capsules = [];

    this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, 0x1b1d18, 0.72);
    this.add
      .text(CANVAS_W / 2, 70, "강화 뽑기", {
        fontFamily: "sans-serif",
        fontSize: "24px",
        color: "#f5e9ce",
      })
      .setOrigin(0.5);
    this.add
      .text(CANVAS_W / 2, 100, "캡슐 하나를 눌러서 열어봐", {
        fontFamily: "sans-serif",
        fontSize: "14px",
        color: "#a6a798",
      })
      .setOrigin(0.5);

    const count = this.choices.length;
    const spacing = 220;
    const startX = CANVAS_W / 2 - (spacing * (count - 1)) / 2;

    this.choices.forEach((card, i) => {
      this.capsules.push(this.buildCapsule(card, startX + i * spacing, CANVAS_H / 2, i));
    });
  }

  private buildCapsule(card: UpgradeCard, x: number, y: number, colorIndex: number): Capsule {
    const container = this.add.container(x, y);

    const shell = this.add.circle(
      0,
      0,
      CAPSULE_RADIUS,
      CAPSULE_COLORS[colorIndex % CAPSULE_COLORS.length],
    );
    shell.setStrokeStyle(3, 0x24231f, 0.6);
    const seam = this.add.rectangle(0, 0, CAPSULE_RADIUS * 2, 6, 0x24231f, 0.35);
    const hint = this.add
      .text(0, 0, "?", {
        fontFamily: "monospace",
        fontSize: "22px",
        color: "#24231f",
      })
      .setOrigin(0.5);

    container.add([shell, seam, hint]);

    shell.setInteractive({ useHandCursor: true });
    shell.on("pointerdown", () => this.openCapsule({ container, shell }, card, hint));

    return { container, shell };
  }

  private openCapsule(capsule: Capsule, card: UpgradeCard, hint: Phaser.GameObjects.Text) {
    if (this.chosen) return;
    this.chosen = true;

    // 고르지 않은 캡슐은 흐리게 처리하고 더 이상 반응하지 않게 한다.
    for (const other of this.capsules) {
      if (other === capsule) continue;
      other.container.setAlpha(0.35);
      other.shell.disableInteractive();
    }
    capsule.shell.disableInteractive();
    hint.setText("");

    this.tweens.add({
      targets: capsule.container,
      scale: 1.25,
      duration: OPEN_TWEEN_MS,
      yoyo: true,
      ease: "Quad.easeOut",
      onComplete: () => this.revealCard(capsule.container, card),
    });
  }

  private revealCard(container: Phaser.GameObjects.Container, card: UpgradeCard) {
    const nameText = this.add
      .text(container.x, container.y + CAPSULE_RADIUS + 16, card.name, {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: "#f5e9ce",
      })
      .setOrigin(0.5, 0)
      .setAlpha(0);
    const descText = this.add
      .text(container.x, container.y + CAPSULE_RADIUS + 40, card.description, {
        fontFamily: "sans-serif",
        fontSize: "12px",
        color: "#a6a798",
        align: "center",
        wordWrap: { width: 200 },
      })
      .setOrigin(0.5, 0)
      .setAlpha(0);

    this.tweens.add({ targets: [nameText, descText], alpha: 1, duration: 200 });

    this.time.delayedCall(ADVANCE_DELAY_MS, () => {
      EventBus.emit(CombatEvents.UpgradeChosen, { upgradeId: card.id });
      this.scene.stop();
    });
  }
}
