-- ERP 4/4: 매장 데이터 분석
-- 태그는 "옷이 게이트 범위 안에 있었는지·신호가 얼마나 셌는지"를 잰다. 손님 관심은 customer_events로 따로 쌓는다.
-- 세션을 저장하지 않고 분 단위 원자료를 남겨, 자리 비움을 신호 기준을 바꿔가며 다시 계산할 수 있게 한다.
-- 양: 태그 3개 기준 하루 약 4,300행. g1-ingest는 고치지 않는다 (트리거로만 붙음, 실패해도 수신은 성공).

create table public.tag_minutes (
  tag_key text not null,
  minute timestamptz not null,
  product_id text references public.products (id) on delete set null,
  gateway text,
  samples int not null default 0,
  rssi_sum bigint not null default 0,
  rssi_max int,
  rssi_min int,
  primary key (tag_key, minute)
);
create index tag_minutes_minute on public.tag_minutes (minute);

create table public.gateway_minutes (
  gateway text not null,
  minute timestamptz not null,
  posts int not null default 0,
  primary key (gateway, minute)
);
create index gateway_minutes_minute on public.gateway_minutes (minute);

create table public.customer_events (
  id bigint generated always as identity primary key,
  device_id text not null,
  type text not null check (type in ('view_home', 'view_hanger', 'view_product')),
  product_id text references public.products (id) on delete set null,
  created_at timestamptz not null default now()
);
create index customer_events_device on public.customer_events (device_id, created_at desc);
create index customer_events_product on public.customer_events (product_id, created_at);

-- tag_presence 갱신 → 그 분의 행에 더하기 (시뮬레이터·last_seen 그대로인 갱신은 제외)
create or replace function erp_internal.presence_minute() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_product text;
begin
  if new.simulated then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.last_seen is not distinct from old.last_seen then
    return null;
  end if;
  begin
    select p.id into v_product from public.products p where p.major = new.major and p.minor = new.minor;
    insert into public.tag_minutes as t (tag_key, minute, product_id, gateway, samples, rssi_sum, rssi_max, rssi_min)
    values (new.key, date_trunc('minute', new.last_seen), v_product, new.gateway, 1, coalesce(new.rssi, 0), new.rssi, new.rssi)
    on conflict (tag_key, minute) do update set
      samples = t.samples + 1,
      rssi_sum = t.rssi_sum + excluded.rssi_sum,
      rssi_max = greatest(t.rssi_max, excluded.rssi_max),
      rssi_min = least(t.rssi_min, excluded.rssi_min),
      gateway = coalesce(excluded.gateway, t.gateway),
      product_id = coalesce(t.product_id, excluded.product_id);
  exception when others then
    perform erp_internal.log_error('presence_minute', sqlerrm);
  end;
  return null;
end $$;

-- G1 업로드(log_raw가 gateway_raw.count를 올림) → 게이트·분 단위 횟수. 게이트 이름은 body.gw 끝 4자리
create or replace function erp_internal.gateway_minute() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_gw text;
begin
  begin
    v_gw := 'G1-' || upper(right(nullif(new.body::jsonb ->> 'gw', ''), 4));
  exception when others then
    v_gw := null;
  end;
  begin
    insert into public.gateway_minutes as g (gateway, minute, posts)
    values (coalesce(v_gw, 'GW-01'), date_trunc('minute', now()), 1)
    on conflict (gateway, minute) do update set posts = g.posts + 1;
  exception when others then
    perform erp_internal.log_error('gateway_minute', sqlerrm);
  end;
  return null;
end $$;

create trigger erp_presence_minute after insert or update on public.tag_presence
for each row execute function erp_internal.presence_minute();
create trigger erp_gateway_minute after update on public.gateway_raw
for each row when (new.count is distinct from old.count)
execute function erp_internal.gateway_minute();

-- 손님 행동 기록 (손님 앱에서 호출, anon 허용). 기기당 1분 60건까지
create or replace function public.track_event(p_device text, p_type text, p_product text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_device is null or length(p_device) not between 8 and 64
     or p_type is null or p_type not in ('view_home', 'view_hanger', 'view_product') then
    raise exception 'invalid_input';
  end if;
  if p_product is not null and not exists (select 1 from public.products where id = p_product) then
    raise exception 'invalid_input';
  end if;
  if (select count(*) from public.customer_events e
      where e.device_id = p_device and e.created_at > now() - interval '1 minute') >= 60 then
    raise exception 'rate_limited';
  end if;
  insert into public.customer_events (device_id, type, product_id) values (p_device, p_type, p_product);
end $$;

-- 상품별 퍼널: 조회 → 피팅 요청 → 구매(취소 제외). 비율은 단순 건수 비율
create or replace function public.erp_product_funnel(p_from date, p_to date)
returns table (
  product_id text, name text, views int, fitting_requests int, purchases int,
  view_to_purchase numeric, fitting_to_purchase numeric
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_start timestamptz := p_from::timestamp at time zone 'Asia/Seoul';
  v_end timestamptz := (p_to + 1)::timestamp at time zone 'Asia/Seoul';
begin
  perform erp_internal.require_role('manager');
  perform erp_internal.check_range(p_from, p_to);
  return query
  with v as (
    select e.product_id as pid, count(*)::int as n
    from public.customer_events e
    where e.type = 'view_product' and e.product_id is not null
      and e.created_at >= v_start and e.created_at < v_end
    group by 1
  ), f as (
    select o.product_id as pid, count(*)::int as n
    from public.orders o
    where o.type = 'fitting' and o.created_at >= v_start and o.created_at < v_end
    group by 1
  ), b as (
    select o.product_id as pid, count(*)::int as n
    from public.orders o
    where o.type = 'purchase' and o.outcome is distinct from 'cancelled'
      and o.created_at >= v_start and o.created_at < v_end
    group by 1
  )
  select p.id, p.name, coalesce(v.n, 0), coalesce(f.n, 0), coalesce(b.n, 0),
         round(100.0 * coalesce(b.n, 0) / nullif(coalesce(v.n, 0), 0), 1),
         round(100.0 * coalesce(b.n, 0) / nullif(coalesce(f.n, 0), 0), 1)
  from public.products p
  left join v on v.pid = p.id
  left join f on f.pid = p.id
  left join b on b.pid = p.id
  where p.status = 'active' or v.pid is not null or f.pid is not null or b.pid is not null
  order by p.sort, p.id;
end $$;

-- 상품별 태그 활동: 게이트가 살아 있던 분 중 감지된 분 / 자리 비움 분·횟수
--   감지 = 그 분 평균 신호 ≥ 기준 (기준 안 주면 settings.rssi_threshold)
--   자리 비움 횟수 = 연속된 자리 비움 분의 묶음 수
create or replace function public.erp_tag_activity(p_from date, p_to date, p_rssi_threshold int default null)
returns table (
  product_id text, name text, gateway_minutes int, seen_minutes int, away_minutes int, away_count int,
  avg_rssi numeric, last_seen timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_start timestamptz := p_from::timestamp at time zone 'Asia/Seoul';
  v_end timestamptz := (p_to + 1)::timestamp at time zone 'Asia/Seoul';
  v_th int;
begin
  perform erp_internal.require_role('manager');
  perform erp_internal.check_range(p_from, p_to);
  v_th := coalesce(p_rssi_threshold, (select st.rssi_threshold from public.settings st where st.id = 1), -100);
  return query
  with gm as (
    select distinct g.minute from public.gateway_minutes g where g.minute >= v_start and g.minute < v_end
  ), tags as (
    select p.id as pid, p.name as pname, p.sort as psort, p.major || '-' || p.minor as tkey
    from public.products p
    where p.major is not null and p.minor is not null
  ), seen as (
    select t.pid, tm.minute
    from tags t
    join public.tag_minutes tm on tm.tag_key = t.tkey
    where tm.minute >= v_start and tm.minute < v_end
      and tm.samples > 0 and tm.rssi_sum::numeric / tm.samples >= v_th
  ), grid as (
    select t.pid, gm.minute, (s.minute is not null) as is_seen
    from tags t
    cross join gm
    left join seen s on s.pid = t.pid and s.minute = gm.minute
  ), runs as (
    select g.pid, g.is_seen,
           g.minute - (row_number() over (partition by g.pid, g.is_seen order by g.minute)) * interval '1 minute' as grp
    from grid g
  ), counts as (
    select r.pid,
           count(*) filter (where r.is_seen)::int as seen_n,
           count(*) filter (where not r.is_seen)::int as away_n,
           count(distinct r.grp) filter (where not r.is_seen)::int as away_runs
    from runs r
    group by r.pid
  ), stats as (
    select t.pid,
           round(sum(tm.rssi_sum)::numeric / nullif(sum(tm.samples), 0), 1) as avg_rssi,
           max(tm.minute) as last_min
    from tags t
    join public.tag_minutes tm on tm.tag_key = t.tkey
    where tm.minute >= v_start and tm.minute < v_end
    group by t.pid
  )
  select t.pid, t.pname, (select count(*)::int from gm),
         coalesce(c.seen_n, 0), coalesce(c.away_n, 0), coalesce(c.away_runs, 0),
         st.avg_rssi, st.last_min
  from tags t
  left join counts c on c.pid = t.pid
  left join stats st on st.pid = t.pid
  order by t.psort, t.pid;
end $$;

-- 권한: 분석 데이터는 manager 이상만 읽는다
alter table public.tag_minutes enable row level security;
alter table public.gateway_minutes enable row level security;
alter table public.customer_events enable row level security;
revoke all on table public.tag_minutes, public.gateway_minutes, public.customer_events from anon, authenticated;
grant select on table public.tag_minutes, public.gateway_minutes, public.customer_events to authenticated;
create policy "erp manager read tag_minutes" on public.tag_minutes
  for select to authenticated using ((select erp_internal.erp_has_role('manager')));
create policy "erp manager read gateway_minutes" on public.gateway_minutes
  for select to authenticated using ((select erp_internal.erp_has_role('manager')));
create policy "erp manager read customer_events" on public.customer_events
  for select to authenticated using ((select erp_internal.erp_has_role('manager')));

revoke all on function erp_internal.presence_minute(), erp_internal.gateway_minute() from public, anon, authenticated;

revoke all on function public.track_event(text, text, text) from public;
grant execute on function public.track_event(text, text, text) to anon, authenticated;
revoke all on function public.erp_product_funnel(date, date), public.erp_tag_activity(date, date, int) from public, anon;
grant execute on function public.erp_product_funnel(date, date), public.erp_tag_activity(date, date, int) to authenticated;
