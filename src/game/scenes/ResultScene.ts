import Phaser from "phaser/dist/phaser.js"; // 이유: EventBus.ts 상단 주석 참고
import { ITEM_LABELS } from "@/lib/game-logic";
import type { RunEndedPayload } from "../events";
import { CANVAS_W, CANVAS_H } from "./DungeonScene";

interface VerifiedReward {
  currency: number;
  items: { itemKey: string; quantity: number }[];
}

/** 클라이언트가 주장하는 결과는 화면에 참고용으로만 잠깐 보여주고, 최종
 * 표시는 항상 /api/run/submit이 seed로 재계산해 돌려준 값을 따른다. */
export class ResultScene extends Phaser.Scene {
  private runResult!: RunEndedPayload;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super("ResultScene");
  }

  init(data: RunEndedPayload) {
    this.runResult = data;
  }

  create() {
    this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, 0x1b1d18, 0.92);

    const title = this.runResult.result === "cleared" ? "런 클리어!" : "쓰러졌다...";
    this.add
      .text(CANVAS_W / 2, 90, title, {
        fontFamily: "sans-serif",
        fontSize: "30px",
        color: "#ecede3",
      })
      .setOrigin(0.5);

    this.add
      .text(CANVAS_W / 2, 130, `${this.runResult.wavesCleared}개 노드 클리어`, {
        fontFamily: "sans-serif",
        fontSize: "15px",
        color: "#a6a798",
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(CANVAS_W / 2, 200, "서버에 결과 검증 중...", {
        fontFamily: "monospace",
        fontSize: "15px",
        color: "#e0b85c",
      })
      .setOrigin(0.5);

    void this.submitRun();
  }

  private async submitRun() {
    try {
      const res = await fetch("/api/run/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seed: this.runResult.seed,
          wavesCleared: this.runResult.wavesCleared,
          result: this.runResult.result,
          elapsedMs: this.runResult.elapsedMs,
          collectedItems: this.runResult.collectedItems,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        this.showFailure(body.error ?? "submit_failed");
        return;
      }
      this.showVerified(body.reward as VerifiedReward);
    } catch (err) {
      console.error("[ResultScene] submit failed", err);
      this.showFailure("network_error");
    }
  }

  private showVerified(reward: VerifiedReward) {
    this.statusText.setText("검증 완료 — 확정된 보상");
    this.statusText.setColor("#5fcbb0");

    this.add
      .text(CANVAS_W / 2, 240, `재화 +${reward.currency}`, {
        fontFamily: "monospace",
        fontSize: "18px",
        color: "#f5e9ce",
      })
      .setOrigin(0.5);

    const itemLines = reward.items.length
      ? reward.items
          .map((i) => {
            const label = (ITEM_LABELS as Record<string, { ko: string; icon: string }>)[i.itemKey];
            return `${label?.icon ?? "📦"} ${label?.ko ?? i.itemKey} × ${i.quantity}`;
          })
          .join("\n")
      : "획득한 잡템 없음";
    this.add
      .text(CANVAS_W / 2, 280, itemLines, {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#a6a798",
        align: "center",
      })
      .setOrigin(0.5, 0);

    this.addTownButton();
  }

  private showFailure(reason: string) {
    this.statusText.setText(`검증 실패: ${reason}\n(파밍한 자원은 반영되지 않습니다)`);
    this.statusText.setColor("#e98a66");
    this.statusText.setAlign("center");
    this.addTownButton();
  }

  private addTownButton() {
    this.add
      .text(CANVAS_W / 2, 380, "마을로 돌아가기", {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: "#1b1d18",
        backgroundColor: "#5fcbb0",
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        window.location.href = "/town";
      });
  }
}
