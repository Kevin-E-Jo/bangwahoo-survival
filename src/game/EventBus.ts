// phaser의 기본 "phaser" 진입점(module 필드, dist/phaser.esm.js)은 webpack에서
// default export가 깨져 있어("does not contain a default export") UMD
// 빌드로 직접 임포트한다.
import Phaser from "phaser/dist/phaser.js";

/** DungeonScene/UIScene/ResultScene은 launch()로 병렬 실행되는 형제 씬이라
 * 서로 직접 참조하지 않고 이 전역 이벤터로만 통신한다. */
export const EventBus = new Phaser.Events.EventEmitter();
