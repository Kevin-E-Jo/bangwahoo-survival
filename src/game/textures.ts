import Phaser from "phaser/dist/phaser.js"; // 이유: EventBus.ts 상단 주석 참고

// 실제 스프라이트 아틀라스는 미정(블루프린트 「미정 사항」— 몬스터 컨셉 보류)이라,
// 블루프린트 컬러 무드(따뜻한 파스텔 — 피치·크림·민트)를 따르는 절차 생성
// 텍스처로 대체한다. 아트가 확정되면 BootScene.preload()의 로더 호출로
// 교체하고 이 파일은 그대로 폴백으로 남겨두면 된다.

const PALETTE = {
  playerBody: 0x2f8f79, // mint
  playerOutline: 0x1f5f4f,
  enemyBody: 0xd65f3c, // coral
  enemyOutline: 0x9a3f26,
  eliteBody: 0xb3852a, // gold
  eliteOutline: 0x7a5915,
  bullet: 0xece7d5, // cream
  ground: 0xdccfa6,
  pickup: 0xf5e9ce,
  pickupOutline: 0xb3852a,
};

function ensure(scene: Phaser.Scene, key: string, draw: (g: Phaser.GameObjects.Graphics) => void, size: number) {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, size, size);
  g.destroy();
}

/** BootScene에서 한 번 호출해 전투에 필요한 모든 텍스처를 만들어둔다. */
export function generatePlaceholderTextures(scene: Phaser.Scene): void {
  ensure(
    scene,
    "player",
    (g) => {
      g.fillStyle(PALETTE.playerBody, 1);
      g.fillRoundedRect(6, 4, 20, 28, 8);
      g.lineStyle(2, PALETTE.playerOutline, 1);
      g.strokeRoundedRect(6, 4, 20, 28, 8);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(20, 14, 3); // 눈(조준 방향 표시용 포인트)
    },
    32,
  );

  ensure(
    scene,
    "enemy",
    (g) => {
      g.fillStyle(PALETTE.enemyBody, 1);
      g.fillCircle(14, 14, 13);
      g.lineStyle(2, PALETTE.enemyOutline, 1);
      g.strokeCircle(14, 14, 13);
    },
    28,
  );

  ensure(
    scene,
    "enemy-elite",
    (g) => {
      g.fillStyle(PALETTE.eliteBody, 1);
      g.fillCircle(20, 20, 19);
      g.lineStyle(3, PALETTE.eliteOutline, 1);
      g.strokeCircle(20, 20, 19);
    },
    40,
  );

  ensure(
    scene,
    "bullet",
    (g) => {
      g.fillStyle(PALETTE.bullet, 1);
      g.fillCircle(4, 4, 4);
    },
    8,
  );

  ensure(
    scene,
    "ground",
    (g) => {
      g.fillStyle(PALETTE.ground, 1);
      g.fillRect(0, 0, 64, 16);
      g.lineStyle(1, PALETTE.eliteOutline, 0.3);
      g.strokeRect(0, 0, 64, 16);
    },
    64,
  );

  ensure(
    scene,
    "pickup",
    (g) => {
      g.fillStyle(PALETTE.pickup, 1);
      g.fillCircle(10, 10, 9);
      g.lineStyle(2, PALETTE.pickupOutline, 1);
      g.strokeCircle(10, 10, 9);
    },
    20,
  );
}
