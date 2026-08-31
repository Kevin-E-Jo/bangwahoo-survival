// phaser의 "module" 진입점(dist/phaser.esm.js)은 webpack에서 default export가
// 깨져 있어("does not contain a default export"), 런타임 import는 항상
// "phaser/dist/phaser.js"(UMD 빌드)를 직접 가리킨다(src/game/EventBus.ts 참고).
// 이 딥 경로에는 타입 선언이 없으므로, 패키지 본체("phaser")의 타입을 그대로
// 재노출해 타입 체크가 끊기지 않게 한다.
declare module "phaser/dist/phaser.js" {
  import Phaser from "phaser";
  export = Phaser;
}
