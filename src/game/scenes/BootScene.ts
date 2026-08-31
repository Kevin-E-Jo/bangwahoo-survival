import Phaser from "phaser/dist/phaser.js"; // 이유: EventBus.ts 상단 주석 참고
import { generatePlaceholderTextures } from "../textures";
import { CANVAS_W, CANVAS_H } from "./DungeonScene";

interface TownProgressResponse {
  upgrades: Record<"weaponDamage" | "weaponAmmo", { level: number }>;
}

/** /play 진입 시 최초 실행되는 씬. 에셋을 준비하고 서버가 발급하는 seed를
 * 받아온 뒤에만 DungeonScene을 시작한다 — 로그인·마을 화면(Next.js)에는
 * 관여하지 않는다. */
export class BootScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super("BootScene");
  }

  preload() {
    generatePlaceholderTextures(this);
  }

  create() {
    this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, 0xf2f3ec);
    this.statusText = this.add
      .text(CANVAS_W / 2, CANVAS_H / 2, "던전 입장 준비 중...", {
        fontFamily: "sans-serif",
        fontSize: "18px",
        color: "#24231f",
      })
      .setOrigin(0.5);

    void this.beginRun();
  }

  private async beginRun() {
    try {
      const [runRes, progressRes] = await Promise.all([
        fetch("/api/run/start", { method: "POST" }),
        fetch("/api/town/progress"),
      ]);

      if (!runRes.ok) throw new Error(`run_start_failed:${runRes.status}`);
      const runBody = (await runRes.json()) as { seed: string };

      let upgrades = { weaponDamage: 0, weaponAmmo: 0 };
      if (progressRes.ok) {
        const progressBody = (await progressRes.json()) as TownProgressResponse;
        upgrades = {
          weaponDamage: progressBody.upgrades.weaponDamage.level,
          weaponAmmo: progressBody.upgrades.weaponAmmo.level,
        };
      }

      this.scene.start("DungeonScene", { seed: runBody.seed, upgrades });
    } catch (err) {
      console.error("[BootScene] run start failed", err);
      this.statusText.setText(
        "던전 입장에 실패했습니다 (세션 만료 가능성).\n마을로 돌아가 다시 시도해주세요.",
      );
      this.statusText.setAlign("center");
      this.add
        .text(CANVAS_W / 2, CANVAS_H / 2 + 60, "마을로 돌아가기", {
          fontFamily: "sans-serif",
          fontSize: "16px",
          color: "#2f8f79",
          backgroundColor: "#dcefe9",
          padding: { x: 14, y: 8 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          window.location.href = "/town";
        });
    }
  }
}
