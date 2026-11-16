-- ERP SQL 테스트 공용 도우미 (scripts/sqltest.sh가 테스트 파일 앞에 붙인다)
-- 모두 pg_temp 함수라 트랜잭션이 롤백되면 사라진다.

-- 가짜 Auth 계정 (롤백되므로 실제로 남지 않음)
create or replace function pg_temp.mk_user(p_email text) returns uuid
language plpgsql as $$
declare
  v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, email, aud, role, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', p_email, 'authenticated', 'authenticated', now(), now());
  return v;
end $$;

-- 이후 쿼리를 로그인한 사용자(authenticated + JWT sub)로 실행
create or replace function pg_temp.as_user(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
end $$;

-- 로그인 안 한 손님(anon)
create or replace function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- 원래 접속 계정(관리자)으로 복귀
create or replace function pg_temp.as_admin() returns void
language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- p_sql이 p_code를 포함한 오류로 실패해야 통과
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_code in sqlerrm) = 0 then
      raise exception 'expected error "%" from [%], got "%"', p_code, p_sql, sqlerrm;
    end if;
    return;
  end;
  raise exception 'expected error "%" from [%], got success', p_code, p_sql;
end $$;
