# 방과후 서바이벌 — 프로젝트 기록

> 이 문서는 포트폴리오 열람용으로, 프로젝트 개요·구성·개발 로그를 한 곳에 모아둔다.
> 작업이 진행될 때마다 계속 갱신한다. 팀 내부 설계/할 일 문서는
> [docs/blueprint.html](./docs/blueprint.html), 개발 온보딩은 [README.md](./README.md),
> 병렬 세션 개발 방법론은 [docs/METHODOLOGY.md](./docs/METHODOLOGY.md) 참고.
>
> `feature/*` worktree에서 병렬로 작업하는 각 세션도 의미 있는 변경을 마칠
> 때마다 이 문서의 개발 로그를 직접 갱신한다(각 worktree의 `CLAUDE.md` 참고).
> 이 파일은 `master`에만 있으므로, 갱신은 항상 루트 worktree
> (`C:\Users\whdms\Desktop\방과후 서바이벌`)를 대상으로 한다.

## 한 줄 소개

스마트폰이 없던 시절 골목·놀이터에서 하던 BB탄 서바이벌 놀이를 웹 로그라이크로
재해석한 게임. 또래 아이들과의 대결, 그 시절 문방구 장난감(딱지·구슬·요요 등)을
전리품으로 모으는 컨셉으로, 향수를 자극하는 톤을 게임플레이 전체에 일관되게 반영하는 데
초점을 맞췄다.

## 핵심 특징

- **탑다운 웨이브 서바이벌 전투** — WASD 이동 + 자동 조준/발사, 고정 3라운드 구성
- **엄폐물 기반 맵 다양성** — 박스/화분/벤치가 이동과 총알을 모두 막는 실질적 엄폐로
  기능, 시드 기반으로 4가지 맵 패턴 중 하나가 런마다 결정
- **이동/피격/사망 애니메이션** — 걷기 2프레임, 피격 시 틴트 플래시, 사망 시 스케일·
  알파 트윈
- **시드 기반 서버 검증(안티치트)** — 클라이언트가 보상을 주장하지 않고, 서버가 같은
  절차생성 로직으로 독립 재계산 후 검증
- **22종 그 시절 장난감 전리품 시스템** — 4단계 희귀도, 마을에서 판매해 무기 강화
- **Google OAuth + 이메일 매직링크 인증**, Supabase Postgres + Row Level Security로
  사용자별 데이터 격리
- **에셋 파이프라인 직접 구축** — 이미지 생성 도구 없이, Node 순수 `zlib`만으로 PNG
  인코더를 만들고 그 위에 절차적 픽셀아트(캐릭터/장애물/아이템)를 생성

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | Next.js 14 (App Router, TypeScript) |
| 게임 엔진 | Phaser 3.90 (Arcade Physics) |
| 인증 | Auth.js(NextAuth) v4 — Google OAuth + 이메일 매직링크, DB 세션 |
| DB/ORM | Supabase Postgres + Prisma, Row Level Security (`app_user` 커스텀 롤) |
| 배포 대상 | Vercel |
| 에셋 | 자체 제작 PNG 인코더 + 절차적 스프라이트 생성 스크립트(Node) |

## 프로젝트 구성

### 리포지토리/브랜치 전략

여러 Claude Code 세션을 병렬로 돌려 개발했다. 파일 충돌을 피하기 위해 기능별로
git worktree를 분리했다.

- `master` — 루트 worktree 전용, 통합 브랜치
- `feature/auth-backend` — 인증/DB/API
- `feature/town-scene` — 마을 화면(업그레이드, 인벤토리)
- `feature/combat` — Phaser 전투 씬

각 기능은 GitHub PR로 병합. 지금까지: [PR #1](https://github.com/Kevin-E-Jo/bangwahoo-survival/pull/1)
인증 백엔드 RLS 수정 → [PR #2](https://github.com/Kevin-E-Jo/bangwahoo-survival/pull/2)
1차 픽셀아트 → [PR #3](https://github.com/Kevin-E-Jo/bangwahoo-survival/pull/3) 마을
화면(강화/인벤토리) → [PR #4](https://github.com/Kevin-E-Jo/bangwahoo-survival/pull/4)
전투 탑다운 리워크 → [PR #5](https://github.com/Kevin-E-Jo/bangwahoo-survival/pull/5)
애니메이션 + 엄폐물/맵 다양성(진행 중).

### 폴더 구조 요약

```
src/
  app/               Next.js 라우트 (login, town, play, api/*)
  lib/
    auth.ts          Auth.js 설정
    withUserContext.ts  RLS용 Postgres 세션 변수 주입
    game-logic/      시드 PRNG·보상·런플랜 — 서버·클라이언트 공유 순수 TS 모듈
  game/              Phaser 씬 (Boot/Dungeon/UI/Result), maps.ts, textures.ts
prisma/schema.prisma  User/Account/Session + TownProgress/InventoryItem + RunSeed/RunSubmission
supabase/rls.sql      RLS 정책 (app_user 커스텀 롤 기준)
scripts/pixel-art/    PNG 인코더 + 스프라이트 생성기
docs/blueprint.html   팀 내부 설계 문서
```

## 기술적으로 흥미로웠던 지점

- **이미지 생성 도구 없이 아트 파이프라인 구축** — Node `zlib`만으로 PNG 인코더를
  직접 짜고, 그 위에 사각형/타원 합성만으로 아기자기한 캐릭터·장애물 스프라이트를
  절차 생성했다. 몬스터가 아니라 "또래 아이" 캐릭터로 다시 그려달라는 피드백을 받고
  전체를 리디자인한 이력도 있다.
- **서버 재검증형 안티치트** — 클라이언트가 "이만큼 깼다"만 보내면, 서버가 같은
  시드·같은 절차생성 로직(`game-logic/`)으로 보상을 처음부터 재계산해서 비교한다.
  로직이 클라와 서버에서 갈라지는 순간 정상 플레이도 검증에 실패하므로, 공유 모듈
  하나만 진실의 원천으로 유지하는 규율이 중요했다.
- **Auth.js + Supabase RLS 조합** — Supabase Auth가 아니라 Auth.js를 쓰다 보니
  `auth.uid()`가 채워지지 않는 문제가 있었다. `withUserContext()`가 매 요청마다
  Postgres 세션 변수(`app.user_id`)를 트랜잭션 단위로 세팅하고, RLS 정책은 그 값
  기준으로 격리하도록 별도 설계했다.
- **엄폐물 설계** — 몹이 원거리 공격을 하지 않는 게임이라, "엄폐"가 의미를 가지려면
  장애물이 이동뿐 아니라 총알까지 막아야 했다(사선을 끊어 추격을 따돌리거나, 대신
  자기 총알도 막힌다는 트레이드오프). 단순히 몹 vs 플레이어 시야만 막는 설계보다
  실제 전투에 영향을 주는 쪽을 선택.
- **브라우저 프리뷰 탭의 백그라운드 스로틀링 우회** — 자동화 브라우저 탭이 rAF/타이머
  스로틀을 받아 게임이 사실상 멈춘 것처럼 보이는 문제를, `game.loop.step()`을 직접
  호출해 프레임을 수동으로 진행시키는 방식으로 우회해 안정적으로 검증했다.

## 개발 로그

최신 항목이 위로 온다.

- **2026-09-05** — 엘리트 외 일반 몹 3종 추가: 느리고 체력 많은 탱크형, 빠르고
  약한 스피드형, 평소엔 방패(엄폐물)를 들고 정지해 총알을 막다가 일정 주기로만
  한 번씩 굴러 돌진하는 롤러형(구르는 동안만 피격 가능). 라운드별 등장 유형은
  런 시드로 결정. ([PR #6](https://github.com/Kevin-E-Jo/bangwahoo-survival/pull/6))
- **2026-09-04** — [PR #5](https://github.com/Kevin-E-Jo/bangwahoo-survival/pull/5)
  (애니메이션 + 엄폐물/맵 다양성) 머지.
- **2026-09-03** — 병렬 세션 워크플로우에서 실제로 효과가 있었던 설계·개발
  원칙을 [docs/METHODOLOGY.md](./docs/METHODOLOGY.md)로 정형화. 각 worktree의
  `CLAUDE.md`가 세션 시작 시 이 문서를 필독하도록 강제.
- **2026-09-03** — 전투 씬에 엄폐물(박스/화분/벤치) 및 맵 4종 추가. 엄폐물은 이동과
  총알을 모두 차단하도록 설계, 런 시드 기반으로 맵 패턴 결정. 실제 실행 중인 게임에
  물리 충돌을 직접 조작해 플레이어/몹/총알이 장애물에 막히는 것을 확인. ([PR #5](https://github.com/Kevin-E-Jo/bangwahoo-survival/pull/5))
- **2026-09-02** — 캐릭터/몹 이동·피격·공격·사망 애니메이션 추가(걷기 2프레임, 피격
  틴트, 사망 트윈, 발사 머즐 플래시). ([PR #5](https://github.com/Kevin-E-Jo/bangwahoo-survival/pull/5))
- **2026-09-02** — 전투를 사이드뷰 노드맵 방식에서 탑다운 WASD 자유이동 + 자동조준
  + 고정 3라운드 구조로 전면 리워크. ([PR #4](https://github.com/Kevin-E-Jo/bangwahoo-survival/pull/4))
- **2026-09-02** — 마을 화면: 업그레이드(탄환 위력/탄창 용량) UI, 인벤토리 판매 기능.
  ([PR #3](https://github.com/Kevin-E-Jo/bangwahoo-survival/pull/3))
- **2026-09-02** — 캐릭터를 몬스터에서 "또래 아이" 컨셉으로 리디자인, 22종 장난감
  전리품 카탈로그(4단계 희귀도) 추가.
- **2026-09-02** — 1차 절차적 픽셀아트 파이프라인 구축(PNG 인코더 직접 제작), 플레이스홀더
  도형 아트를 실제 스프라이트로 교체. ([PR #2](https://github.com/Kevin-E-Jo/bangwahoo-survival/pull/2))
- **2026-09-01** — `app_user` RLS 롤에 LOGIN 권한 및 Auth.js 테이블 정책 누락분 수정.
  ([PR #1](https://github.com/Kevin-E-Jo/bangwahoo-survival/pull/1))
- **2026-09-01** — 로그인 중복 제출 버그, 화면 밖으로 나간 적이 웨이브 클리어를
  막는 소프트락 버그 수정.
- **2026-08-31** — 초기 커밋: Next.js 스캐폴드, Auth.js 인증, 시드 기반 API 라우트,
  Phaser 전투 씬 뼈대.

## 남은 작업 (로드맵)

- [PR #6](https://github.com/Kevin-E-Jo/bangwahoo-survival/pull/6)(몹 다양성) 리뷰 및 머지
- 실제 배포(Vercel) 및 스크린샷/플레이 영상 추가

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
