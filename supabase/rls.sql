-- 방과후 서바이벌 — Row Level Security 정책
--
-- 왜 auth.uid()가 아니라 세션 변수인가:
-- 이 프로젝트는 Supabase Auth 대신 Auth.js(NextAuth)로 로그인을 처리한다.
-- Supabase Auth를 쓰지 않으므로 Postgres 세션에 auth.uid()를 채워주는
-- Supabase의 GoTrue JWT가 존재하지 않는다 — 그래서 블루프린트가 적어둔
-- `user_id = auth.uid()` 그대로는 항상 NULL과 비교되어 동작하지 않는다.
--
-- 대신 API 라우트가 Prisma 트랜잭션 안에서 매 요청마다
--   SELECT set_config('app.user_id', '<현재 로그인한 유저 id>', true);
-- 를 실행하고(src/lib/withUserContext.ts), 아래 정책은 그 세션 변수를
-- 기준으로 행을 필터링한다. `true`(is_local)로 세팅하므로 트랜잭션이
-- 끝나면 값이 사라진다 — 커넥션 풀에서 다른 요청으로 값이 새지 않는다.
--
-- 주의: RLS는 "이 role로 붙은 커넥션이 BYPASSRLS가 아닐 때"만 강제된다.
-- Supabase의 기본 `postgres` role은 슈퍼유저라 RLS를 우회한다. Prisma가
-- 쓰는 DATABASE_URL은 BYPASSRLS 권한이 없는 전용 role(app_user 등)을
-- 쓰도록 만들어야 이 정책이 실제로 의미가 있다.
--
-- 1차 방어선은 각 API 라우트가 세션을 검사하는 서버 코드이고, 이 RLS는
-- 그 위의 2차 방어선(defense in depth)이다.

-- LOGIN 없이 role만 만들면 접속 자체가 안 된다. 비밀번호는 이 파일에 커밋하지
-- 않는다 — role 생성 후 별도로
--   ALTER ROLE app_user WITH PASSWORD '<비밀 값>';
-- 를 한 번 실행해서 세팅한다.
create role app_user with login noinherit;
grant usage on schema public to app_user;

grant select, insert, update, delete on
  "TownProgress", "InventoryItem", "RunSeed", "RunSubmission"
  to app_user;

-- User/Account/Session/VerificationToken도 app_user 권한이 필요하다 —
-- Auth.js(PrismaAdapter)는 "서버 전용 role"이 따로 있는 게 아니라 앱이 쓰는
-- 이 PrismaClient(=DATABASE_URL=app_user)를 그대로 재사용해서 로그인 때마다
-- 이 테이블들을 읽고 쓴다. 여기 권한을 안 주면 로그인 자체가 깨진다.
grant select, insert, update, delete on
  "User", "Account", "Session", "VerificationToken"
  to app_user;

-- 주의: Supabase는 public 스키마에 테이블이 생기면 기본적으로 RLS를 켠다
-- (Prisma migrate로 만든 테이블도 예외 없음). 정책을 하나도 안 만들면
-- "RLS는 켜져 있는데 허용 정책이 없는" 상태가 되어 소유자가 아닌 role은
-- 아예 접근이 막힌다 — app_user로도 로그인/세션 조회가 통째로 실패한다.
-- 이 4개 테이블은 app.user_id 기준으로 행을 나눌 수 없다(세션 조회
-- 시점엔 아직 "누구인지"를 모르므로 — 그걸 알아내는 게 바로 이 조회다)
-- 그리고 애초에 Auth.js 라우트 핸들러만 건드리는 신뢰된 경로이므로,
-- app_user에게는 무조건 허용하는 정책을 명시적으로 둔다.
alter table "User" enable row level security;
alter table "Account" enable row level security;
alter table "Session" enable row level security;
alter table "VerificationToken" enable row level security;

create policy app_user_full_access on "User"
  for all to app_user using (true) with check (true);
create policy app_user_full_access on "Account"
  for all to app_user using (true) with check (true);
create policy app_user_full_access on "Session"
  for all to app_user using (true) with check (true);
create policy app_user_full_access on "VerificationToken"
  for all to app_user using (true) with check (true);

alter table "TownProgress" enable row level security;
alter table "InventoryItem" enable row level security;
alter table "RunSeed" enable row level security;
alter table "RunSubmission" enable row level security;

create policy town_progress_isolation on "TownProgress"
  using ("userId" = current_setting('app.user_id', true))
  with check ("userId" = current_setting('app.user_id', true));

create policy inventory_item_isolation on "InventoryItem"
  using ("userId" = current_setting('app.user_id', true))
  with check ("userId" = current_setting('app.user_id', true));

create policy run_seed_isolation on "RunSeed"
  using ("userId" = current_setting('app.user_id', true))
  with check ("userId" = current_setting('app.user_id', true));

create policy run_submission_isolation on "RunSubmission"
  using ("userId" = current_setting('app.user_id', true))
  with check ("userId" = current_setting('app.user_id', true));
