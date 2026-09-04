import Phaser from "phaser/dist/phaser.js"; // 이유: EventBus.ts 상단 주석 참고
import { BootScene } from "./scenes/BootScene";
import { DungeonScene, CANVAS_W, CANVAS_H } from "./scenes/DungeonScene";
import { UIScene } from "./scenes/UIScene";
import { UpgradeChoiceScene } from "./scenes/UpgradeChoiceScene";
import { ResultScene } from "./scenes/ResultScene";

/** 고정 해상도 캔버스 + 레터박스(블루프린트 「게임플레이 › 전투」)로 BootScene부터
 * 시작하는 Phaser.Game을 만든다. React 쪽은 이 함수만 호출하면 되고, phaser
 * 패키지를 직접 import할 필요가 없다. */
export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game(buildConfig(parent));
}

function buildConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: "#F2F3EC",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: [BootScene, DungeonScene, UIScene, UpgradeChoiceScene, ResultScene],
  };
}
