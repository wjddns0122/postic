-- ERP 리뷰 반영
-- 1) products.sizes 캐시: 같은 상품의 다른 사이즈가 동시에 바뀌면 늦게 끝난 쪽이 옛 값으로 덮을 수 있었다 → 상품 행을 먼저 잠근다
-- 2) 자리 비움 횟수: 게이트가 잠깐 끊긴 분 때문에 이어진 자리 비움이 두 번으로 세어졌다 → 게이트가 살아 있던 분의 순서로 묶는다
-- 3) 취소·환불 사유: orders는 손님에게 공개·방송되므로 사유를 직원 전용 order_notes로 옮긴다 (orders.close_note 삭제, 이 브랜치에서 추가한 컬럼)

-- 1
create or replace function erp_internal.refresh_sizes(p_product text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_sizes jsonb;
begin
  perform 1 from public.products where id = p_product for update;
  select coalesce(jsonb_object_agg(k.size, greatest(coalesce(s.on_hand, 0), 0)), '{}'::jsonb)
  into v_sizes
  from public.skus k
  left join public.stock s on s.sku_id = k.id
  where k.product_id = p_product and k.active;
  update public.products set sizes = v_sizes where id = p_product and sizes is distinct from v_sizes;
end $$;

-- 2
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
    -- 게이트가 살아 있던 분만 이어 붙인 순번으로 묶는다 (시계 시간이 아니라)
    select g.pid, g.is_seen,
           row_number() over (partition by g.pid order by g.minute)
             - row_number() over (partition by g.pid, g.is_seen order by g.minute) as grp
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

-- 3
create table public.order_notes (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  action text not null,
  note text not null,
  actor uuid,
  created_at timestamptz not null default now()
);
create index order_notes_order on public.order_notes (order_id, created_at);
alter table public.order_notes enable row level security;
revoke all on table public.order_notes from anon, authenticated;
grant select on table public.order_notes to authenticated;
create policy "erp staff read order_notes" on public.order_notes
  for select to authenticated using ((select erp_internal.erp_has_role('staff')));

insert into public.order_notes (order_id, action, note, actor, created_at)
select o.id, coalesce(o.outcome, 'note'), o.close_note, o.handled_by, coalesce(o.closed_at, now())
from public.orders o
where o.close_note is not null;

create or replace function public.erp_order_action(p_order uuid, p_action text, p_note text default null)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_o public.orders;
begin
  v_uid := erp_internal.require_role(case when p_action in ('cancel', 'refund') then 'manager' else 'staff' end);
  if p_action is null or p_action not in ('ready', 'complete', 'cancel', 'refund') then
    raise exception 'invalid_input';
  end if;
  select * into v_o from public.orders where id = p_order for update;
  if not found then
    raise exception 'not_found';
  end if;

  if p_action = 'ready' then
    if v_o.status <> 'preparing' then
      raise exception 'invalid_input';
    end if;
    update public.orders set status = 'ready', handled_by = v_uid where id = p_order returning * into v_o;
  elsif p_action = 'complete' then
    if v_o.status not in ('preparing', 'ready') then
      raise exception 'invalid_input';
    end if;
    update public.orders
    set status = 'done', outcome = 'completed', closed_at = now(), handled_by = v_uid
    where id = p_order returning * into v_o;
  elsif p_action = 'cancel' then
    if v_o.status = 'done' or v_o.outcome is not null then
      raise exception 'invalid_input';
    end if;
    update public.orders
    set status = 'done', outcome = 'cancelled', closed_at = now(), handled_by = v_uid
    where id = p_order returning * into v_o;
    perform erp_internal.return_stock(p_order, p_note);
  else -- refund
    if v_o.type <> 'purchase' or v_o.status <> 'done' or coalesce(v_o.outcome, 'completed') <> 'completed' then
      raise exception 'invalid_input';
    end if;
    update public.orders
    set outcome = 'refunded', closed_at = now(), handled_by = v_uid
    where id = p_order returning * into v_o;
    perform erp_internal.return_stock(p_order, p_note);
  end if;

  if nullif(trim(p_note), '') is not null then
    insert into public.order_notes (order_id, action, note, actor)
    values (p_order, p_action, left(trim(p_note), 500), v_uid);
  end if;
  return v_o;
end $$;

alter table public.orders drop column close_note;
