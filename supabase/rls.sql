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

create role app_user noinherit;
grant usage on schema public to app_user;
grant select, insert, update, delete on
  "TownProgress", "InventoryItem", "RunSeed", "RunSubmission"
  to app_user;
-- User/Account/Session/VerificationToken은 Auth.js가 서버 role로만 건드리므로
-- app_user에게는 권한을 주지 않는다 (RLS 대상에서 제외).

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
