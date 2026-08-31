# 방과후 서바이벌

웹 로그라이크. 인증(Auth.js)·백엔드 API와 Phaser 전투 씬
(BootScene/DungeonScene/UIScene/ResultScene, `src/game/`)이 각각 별도
세션에서 구현됐다 — 씬 지도 전체 맥락은
[docs/blueprint.html](./docs/blueprint.html) 참고. `/play`는
`src/app/play/PhaserGame.tsx`로 Phaser 캔버스를 마운트한다. 실제
TownScene 비주얼(현재 `/town`은 최소 동작 확인용 플레이스홀더)은 아직
별도 세션 담당으로 남아있다.

## 시작하기

```bash
npm install
cp .env.example .env.local   # 값 채워넣기
npx prisma migrate dev       # 스키마 생성 (Supabase 연결 필요)
npm run dev
```

## 구조

- `prisma/schema.prisma` — Auth.js 표준 모델(User/Account/Session/VerificationToken)
  + 게임 데이터(TownProgress/InventoryItem) + 서버 검증용(RunSeed/RunSubmission)
- `src/lib/auth.ts` — Auth.js 설정 (Google OAuth + 이메일 매직링크, database 세션)
- `src/middleware.ts` — 세션 쿠키 없이 `/town`, `/play` 접근 시 `/login`으로
  리다이렉트 (UX용 1차 방어선일 뿐, 실제 권한 검증은 각 라우트의
  `getSession()`이 담당)
- `src/lib/game-logic/` — **시드 기반 절차생성·보상계산 공유 모듈.** 순수
  TypeScript라 Phaser 클라이언트 코드도 그대로 import해서 쓸 수 있다.
  노드맵/보상 로직이 서버와 클라이언트에서 갈라지면 정상 플레이도 서버
  검증에 실패하니, 이 로직을 변경할 땐 반드시 이 폴더 안에서만 고칠 것.
- `src/app/api/town/progress`, `src/app/api/town/upgrade`,
  `src/app/api/run/start`, `src/app/api/run/submit` — 블루프린트에 정의된
  4개 API. `run/submit`은 클라이언트가 주장하는 보상을 신뢰하지 않고
  seed로 서버가 독립 재계산한다.
- `supabase/rls.sql` — Row Level Security 정책. **주의:** 이 프로젝트는
  Supabase Auth가 아니라 Auth.js로 인증하므로 `auth.uid()`가 채워지지
  않는다. 대신 `src/lib/withUserContext.ts`가 매 요청마다 Postgres 세션
  변수(`app.user_id`)를 세팅하고, RLS 정책은 그 값을 기준으로 격리한다.
  자세한 이유는 `supabase/rls.sql` 상단 주석 참고.
- `src/game/` — Phaser 3 전투 씬. `scenes/BootScene.ts`(seed 발급 +
  업그레이드 레벨 조회 후 진입) → `DungeonScene.ts`(사이드뷰 이동·조준·
  발사, 노드/웨이브 진행, `game-logic`으로 보상을 미리 계산해 표시) →
  `UIScene.ts`(launch()로 병렬 실행되는 HUD, `combat:*` 이벤트만 구독) →
  `ResultScene.ts`(`/api/run/submit` 제출, 서버 검증 결과만 표시). 씬 간
  통신은 `EventBus.ts`(`Phaser.Events.EventEmitter`)로만 하고, 씬끼리
  서로 직접 참조하지 않는다. `textures.ts`는 아직 미정인 실제 스프라이트
  대신 블루프린트 컬러 무드를 따르는 절차 생성 텍스처를 만든다.
  **주의:** `phaser`의 기본 진입점(`module` 필드, ESM 빌드)은 이 프로젝트의
  webpack 설정에서 default export가 깨지므로, 모든 런타임 import는
  `phaser/dist/phaser.js`(UMD 빌드)를 직접 가리킨다 — 새 파일에서도 이
  경로를 그대로 써야 한다(`src/game/EventBus.ts` 상단 주석 참고).

## 미정 사항 (블루프린트에서 이어짐)

- 무기 파츠 종류·밸런스: `src/lib/game-logic/catalog.ts`,
  `src/lib/game-logic/rewards.ts`에 임시 가정을 채워뒀다. 밸런스가
  정해지면 이 두 파일만 고치면 된다.
- 적(몬스터) 컨셉: 노드맵은 `combat`/`elite`/`loot`/`rest` 라벨로만
  표현해뒀다 (`src/lib/game-logic/nodemap.ts`).
