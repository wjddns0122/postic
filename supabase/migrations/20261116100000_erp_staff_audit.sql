-- ERP 1/4: 직원 계정·역할·작업 기록
-- 추가만 한다. 기존 PIN 함수(staff_check, staff_set_order_status, staff_update_settings)는 그대로 동작한다.
-- 첫 owner 지정 (계정을 만든 뒤 SQL로 한 번):
--   insert into public.staff_members (user_id, display_name, role)
--   select id, '<이름>', 'owner' from auth.users where email = '<이메일>';

-- API에 노출되지 않는 내부 스키마. RLS 정책이 권한 확인 함수를 부르므로 anon·authenticated에 사용 권한만 준다.
-- (PIN 해시가 있는 private 스키마와 분리)
create schema if not exists erp_internal;
grant usage on schema erp_internal to anon, authenticated;

create table public.staff_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  role text not null check (role in ('owner', 'manager', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_kind text not null check (actor_kind in ('staff', 'pin', 'system')),
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb
);
create index audit_log_entity on public.audit_log (entity, entity_id, at desc);
create index audit_log_at on public.audit_log (at desc);

-- 역할 등급: owner 3 > manager 2 > staff 1
create or replace function erp_internal.rank(p_role text) returns int
language sql immutable set search_path = '' as $$
  select case p_role when 'owner' then 3 when 'manager' then 2 when 'staff' then 1 else 0 end
$$;

-- 내 역할 (활성 직원이 아니면 null)
create or replace function erp_internal.erp_role() returns text
language sql stable security definer set search_path = '' as $$
  select s.role from public.staff_members s where s.user_id = auth.uid() and s.active
$$;

create or replace function erp_internal.erp_has_role(p_min text) returns boolean
language sql stable security definer set search_path = '' as $$
  select erp_internal.rank(erp_internal.erp_role()) >= greatest(erp_internal.rank(p_min), 1)
$$;

-- 서버 함수 첫 줄에서 호출: 직원이 아니면 not_staff, 등급이 낮으면 forbidden
create or replace function erp_internal.require_role(p_min text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role text := erp_internal.erp_role();
begin
  if v_role is null then
    raise exception 'not_staff';
  end if;
  if erp_internal.rank(v_role) < erp_internal.rank(p_min) then
    raise exception 'forbidden';
  end if;
  return auth.uid();
end $$;

-- 부가 작업 실패 기록. 기록 자체가 실패해도 본 작업을 막지 않는다
create or replace function erp_internal.log_error(p_where text, p_detail text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor, actor_kind, action, entity, after)
  values (auth.uid(), 'system', 'error', left(p_where, 200), jsonb_build_object('detail', left(p_detail, 2000)));
exception when others then
  null;
end $$;

-- 범용 작업 기록 트리거
--   tg_argv[0] = 기본키 컬럼, tg_argv[1..] = 비교에서 뺄 컬럼 (예: 자동 동기화되는 sizes)
--   actor_kind: 로그인 직원이면 staff, 아니면 orders·settings는 PIN 함수 경로라 pin, 나머지는 system(SQL·마이그레이션)
create or replace function erp_internal.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_cmp_old jsonb := v_old;
  v_cmp_new jsonb := v_new;
  v_uid uuid := auth.uid();
  i int;
begin
  for i in 1 .. tg_nargs - 1 loop
    v_cmp_old := v_cmp_old - tg_argv[i];
    v_cmp_new := v_cmp_new - tg_argv[i];
  end loop;
  if tg_op = 'UPDATE' and v_cmp_old = v_cmp_new then
    return null;
  end if;
  insert into public.audit_log (actor, actor_kind, action, entity, entity_id, before, after)
  values (
    v_uid,
    case when v_uid is not null then 'staff' when tg_table_name in ('orders', 'settings') then 'pin' else 'system' end,
    lower(tg_op),
    tg_table_name,
    coalesce(v_new, v_old) ->> tg_argv[0],
    v_old,
    v_new
  );
  return null;
exception when others then
  perform erp_internal.log_error('audit_row:' || tg_table_name, sqlerrm);
  return null;
end $$;

create trigger audit_staff_members
after insert or update or delete on public.staff_members
for each row execute function erp_internal.audit_row('user_id');

create trigger audit_settings
after update on public.settings
for each row execute function erp_internal.audit_row('id');

-- 내 계정 (직원이 아니면 null)
create or replace function public.erp_me() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('user_id', s.user_id, 'email', u.email, 'display_name', s.display_name, 'role', s.role)
  from public.staff_members s
  join auth.users u on u.id = s.user_id
  where s.user_id = auth.uid() and s.active
$$;

create or replace function public.erp_staff_list()
returns table (user_id uuid, email text, display_name text, role text, active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform erp_internal.require_role('manager');
  return query
    select s.user_id, u.email::text, s.display_name, s.role, s.active, s.created_at
    from public.staff_members s
    join auth.users u on u.id = s.user_id
    order by erp_internal.rank(s.role) desc, s.created_at;
end $$;

-- 가입된 계정을 직원으로 등록 (이미 있으면 역할 변경·재활성화)
create or replace function public.erp_add_staff(p_email text, p_role text, p_name text default null)
returns public.staff_members
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_row public.staff_members;
begin
  perform erp_internal.require_role('owner');
  if p_role is null or p_role not in ('owner', 'manager', 'staff') then
    raise exception 'invalid_input';
  end if;
  select u.id into v_uid from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_uid is null then
    raise exception 'user_not_found';
  end if;
  insert into public.staff_members as sm (user_id, display_name, role, active)
  values (v_uid, coalesce(p_name, ''), p_role, true)
  on conflict (user_id) do update
    set role = excluded.role, active = true, display_name = coalesce(p_name, sm.display_name)
  returning * into v_row;
  if not exists (select 1 from public.staff_members where role = 'owner' and active) then
    raise exception 'last_owner';
  end if;
  return v_row;
end $$;

create or replace function public.erp_update_staff(
  p_user uuid,
  p_role text default null,
  p_active boolean default null,
  p_name text default null
) returns public.staff_members
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.staff_members;
begin
  perform erp_internal.require_role('owner');
  if p_role is not null and p_role not in ('owner', 'manager', 'staff') then
    raise exception 'invalid_input';
  end if;
  update public.staff_members sm
  set role = coalesce(p_role, sm.role),
      active = coalesce(p_active, sm.active),
      display_name = coalesce(p_name, sm.display_name)
  where sm.user_id = p_user
  returning * into v_row;
  if not found then
    raise exception 'not_found';
  end if;
  if not exists (select 1 from public.staff_members where role = 'owner' and active) then
    raise exception 'last_owner';
  end if;
  return v_row;
end $$;

-- 권한: 새 테이블은 직원만 읽고, 쓰기는 서버 함수로만
alter table public.staff_members enable row level security;
alter table public.audit_log enable row level security;
revoke all on table public.staff_members, public.audit_log from anon, authenticated;
grant select on table public.staff_members, public.audit_log to authenticated;
create policy "erp staff read staff_members" on public.staff_members
  for select to authenticated using ((select erp_internal.erp_has_role('staff')));
create policy "erp manager read audit_log" on public.audit_log
  for select to authenticated using ((select erp_internal.erp_has_role('manager')));

revoke all on all functions in schema erp_internal from public, anon, authenticated;
grant execute on function erp_internal.erp_has_role(text) to anon, authenticated;

revoke all on function public.erp_me(), public.erp_staff_list(), public.erp_add_staff(text, text, text),
  public.erp_update_staff(uuid, text, boolean, text) from public, anon;
grant execute on function public.erp_me(), public.erp_staff_list(), public.erp_add_staff(text, text, text),
  public.erp_update_staff(uuid, text, boolean, text) to authenticated;
