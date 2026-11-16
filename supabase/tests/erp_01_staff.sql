-- Task 1: 직원 계정·역할·작업 기록
do $$
declare
  o uuid; m uuid; s uuid; x uuid;
  r jsonb;
  n int;
begin
  perform pg_temp.as_admin();
  o := pg_temp.mk_user('erp-t-owner@test.dev');
  m := pg_temp.mk_user('erp-t-mgr@test.dev');
  s := pg_temp.mk_user('erp-t-staff@test.dev');
  x := pg_temp.mk_user('erp-t-x@test.dev');
  -- 첫 owner는 SQL로 지정 (부트스트랩 경로)
  insert into public.staff_members (user_id, display_name, role) values (o, 'O', 'owner');

  -- owner: 직원 등록 (이메일 대소문자 무시)
  perform pg_temp.as_user(o);
  perform public.erp_add_staff('ERP-T-MGR@test.dev', 'manager', 'M');
  perform public.erp_add_staff('erp-t-staff@test.dev', 'staff', 'S');
  perform pg_temp.expect_error($q$select public.erp_add_staff('nobody@test.dev', 'staff')$q$, 'user_not_found');
  perform pg_temp.expect_error($q$select public.erp_add_staff('erp-t-x@test.dev', 'boss')$q$, 'invalid_input');
  -- 마지막 owner는 내리거나 끌 수 없다
  perform pg_temp.expect_error(format('select public.erp_update_staff(%L, %L)', o, 'manager'), 'last_owner');
  perform pg_temp.expect_error(format('select public.erp_update_staff(%L, null, false)', o), 'last_owner');

  -- manager: 직원 목록은 보지만 등록은 못 함. 작업 기록은 보인다
  perform pg_temp.as_user(m);
  perform pg_temp.expect_error($q$select public.erp_add_staff('erp-t-x@test.dev', 'staff')$q$, 'forbidden');
  select count(*) into n from public.erp_staff_list() where email like 'erp-t-%';
  assert n = 3, format('manager staff_list: expected 3, got %s', n);
  assert exists (
    select 1 from public.audit_log
    where entity = 'staff_members' and action = 'insert' and actor = o and actor_kind = 'staff'
  ), 'audit row for owner adding staff';

  -- staff: 동료는 보지만 직원 목록 함수·작업 기록은 못 봄
  perform pg_temp.as_user(s);
  perform pg_temp.expect_error('select * from public.erp_staff_list()', 'forbidden');
  select count(*) into n from public.staff_members where user_id in (o, m, s);
  assert n = 3, format('staff sees colleagues: expected 3, got %s', n);
  select count(*) into n from public.audit_log;
  assert n = 0, format('staff must not read audit_log, got %s rows', n);
  r := public.erp_me();
  assert r->>'role' = 'staff' and r->>'email' = 'erp-t-staff@test.dev', format('erp_me for staff: %s', r);

  -- 가입만 한 계정: 아무 권한 없음
  perform pg_temp.as_user(x);
  assert public.erp_me() is null, 'non-staff erp_me must be null';
  perform pg_temp.expect_error('select * from public.erp_staff_list()', 'not_staff');
  select count(*) into n from public.staff_members;
  assert n = 0, format('non-staff must not read staff_members, got %s', n);

  -- 비활성화하면 더 이상 직원이 아니다
  perform pg_temp.as_user(o);
  perform public.erp_update_staff(s, null, false);
  perform pg_temp.as_user(s);
  assert public.erp_me() is null, 'deactivated staff must not be staff';

  perform pg_temp.as_admin();
end $$;
