-- ERP 3/4: 주문 처리·재고 연동·매출
-- 주문 상태값은 그대로 preparing/ready/done만 쓴다 (지금 손님 화면 보호). 취소·환불은 outcome 컬럼에 기록한다.
-- 매출 기준: 날짜는 Asia/Seoul, 구매만, 주문일에 매출, 취소는 제외, 환불은 환불일에 차감.

alter table public.orders
  add column sku_id text references public.skus (id),
  add column outcome text check (outcome in ('completed', 'cancelled', 'refunded')),
  add column closed_at timestamptz,
  add column close_note text,
  add column handled_by uuid,
  add column updated_at timestamptz;
create index if not exists orders_created_at on public.orders (created_at);

-- 켜면 재고 0인 SKU의 구매 주문을 막는다. 지금 손님 화면이 이 오류를 몰라 기본은 끔
alter table public.settings add column block_oversell boolean not null default false;

-- 주문 생성 전: 판매 중인 상품인지, SKU 연결, (켜져 있으면) 품절 차단
create or replace function erp_internal.order_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_on int;
begin
  if (select p.status from public.products p where p.id = new.product_id) is distinct from 'active' then
    raise exception 'invalid_product';
  end if;
  new.sku_id := (select k.id from public.skus k where k.product_id = new.product_id and k.size = new.size);
  if new.type = 'purchase' and new.sku_id is not null
     and coalesce((select st.block_oversell from public.settings st where st.id = 1), false) then
    select s.on_hand into v_on from public.stock s where s.sku_id = new.sku_id for update;
    if coalesce(v_on, 0) <= 0 then
      raise exception 'out_of_stock';
    end if;
  end if;
  return new;
end $$;

-- 주문 생성 후: 구매면 재고 -1. 실패해도 주문은 성공시키고 기록만 남긴다
create or replace function erp_internal.order_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.type = 'purchase' and new.sku_id is not null then
    begin
      insert into public.inventory_movements (sku_id, delta, reason, order_id)
      values (new.sku_id, -1, 'sale', new.id);
    exception when others then
      perform erp_internal.log_error('order_after_insert', sqlerrm);
    end;
  end if;
  return null;
end $$;

-- 상태 변경: 수정 시각, 그리고 기존 PIN 경로로 done이 되면 outcome = completed
create or replace function erp_internal.order_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status = 'done' and old.status is distinct from 'done' and new.outcome is null then
    new.outcome := 'completed';
    new.closed_at := coalesce(new.closed_at, now());
  end if;
  return new;
end $$;

create trigger erp_order_before_insert before insert on public.orders
for each row execute function erp_internal.order_before_insert();
create trigger erp_order_after_insert after insert on public.orders
for each row execute function erp_internal.order_after_insert();
create trigger erp_order_before_update before update on public.orders
for each row execute function erp_internal.order_before_update();
-- 손님 주문 생성은 기록하지 않는다 (orders 자체가 기록). 상태·결과가 바뀔 때만
create trigger audit_orders after update on public.orders
for each row when (old.status is distinct from new.status or old.outcome is distinct from new.outcome)
execute function erp_internal.audit_row('id');

-- 판매 이력이 있는 주문만, 한 번만 재고를 돌려준다
create or replace function erp_internal.return_stock(p_order uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_sku text;
begin
  select m.sku_id into v_sku from public.inventory_movements m where m.order_id = p_order and m.reason = 'sale';
  if found then
    insert into public.inventory_movements (sku_id, delta, reason, order_id, note, actor)
    values (v_sku, 1, 'return', p_order, left(p_note, 500), auth.uid())
    on conflict do nothing;
  end if;
end $$;

-- 날짜 범위: from ≤ to, 최대 366일
create or replace function erp_internal.check_range(p_from date, p_to date) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid_input';
  end if;
end $$;

-- 주문 처리
--   ready    (staff)   preparing → ready
--   complete (staff)   preparing/ready → done, completed
--   cancel   (manager) 건네기 전(done 아님) → done, cancelled, 재고 복귀
--   refund   (manager) 수령 완료된 구매 → refunded, 재고 복귀
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
    set status = 'done', outcome = 'cancelled', closed_at = now(), close_note = left(p_note, 500), handled_by = v_uid
    where id = p_order returning * into v_o;
    perform erp_internal.return_stock(p_order, p_note);
  else -- refund
    if v_o.type <> 'purchase' or v_o.status <> 'done' or coalesce(v_o.outcome, 'completed') <> 'completed' then
      raise exception 'invalid_input';
    end if;
    update public.orders
    set outcome = 'refunded', closed_at = now(), close_note = left(p_note, 500), handled_by = v_uid
    where id = p_order returning * into v_o;
    perform erp_internal.return_stock(p_order, p_note);
  end if;
  return v_o;
end $$;

-- 인식·품절 설정 (staff_update_settings와 같은 범위 제한)
create or replace function public.erp_update_settings(
  p_rssi int default null,
  p_online int default null,
  p_block_oversell boolean default null
) returns public.settings
language plpgsql security definer set search_path = '' as $$
declare
  v public.settings;
begin
  perform erp_internal.require_role('manager');
  update public.settings set
    rssi_threshold = case when p_rssi is null then rssi_threshold else greatest(-100, least(-30, p_rssi)) end,
    online_seconds = case when p_online is null then online_seconds else greatest(2, least(60, p_online)) end,
    block_oversell = coalesce(p_block_oversell, block_oversell)
  where id = 1
  returning * into v;
  return v;
end $$;

-- 오늘 요약. 매출 칸은 manager 이상에게만 값이 있다
create or replace function public.erp_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_mgr boolean;
  v_from timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  v_rev bigint;
  v_ref bigint;
begin
  perform erp_internal.require_role('staff');
  v_mgr := erp_internal.erp_has_role('manager');
  select coalesce(sum(o.amount), 0) into v_rev
  from public.orders o
  where o.created_at >= v_from and o.type = 'purchase' and o.outcome is distinct from 'cancelled';
  select coalesce(sum(o.amount), 0) into v_ref
  from public.orders o
  where o.type = 'purchase' and o.outcome = 'refunded' and o.closed_at >= v_from;
  return jsonb_build_object(
    'orders_today', (select count(*) from public.orders o where o.created_at >= v_from and o.outcome is distinct from 'cancelled'),
    'pending', (select count(*) from public.orders o where o.status <> 'done'),
    'low_stock', (
      select count(*)
      from public.skus k
      join public.products p on p.id = k.product_id
      left join public.stock s on s.sku_id = k.id
      where k.active and p.status = 'active' and coalesce(s.on_hand, 0) <= k.reorder_point
    ),
    'tags_online', (
      select count(*) from public.tag_presence t
      where not t.simulated
        and t.last_seen > now() - make_interval(secs => (select st.online_seconds from public.settings st where st.id = 1))
    ),
    'revenue_today', case when v_mgr then v_rev end,
    'net_today', case when v_mgr then v_rev - v_ref end
  );
end $$;

create or replace function public.erp_sales_daily(p_from date, p_to date)
returns table (day date, orders int, units int, revenue bigint, refunds bigint, net bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_start timestamptz := p_from::timestamp at time zone 'Asia/Seoul';
  v_end timestamptz := (p_to + 1)::timestamp at time zone 'Asia/Seoul';
begin
  perform erp_internal.require_role('manager');
  perform erp_internal.check_range(p_from, p_to);
  return query
  with days as (
    select g::date as d from generate_series(p_from, p_to, interval '1 day') g
  ), sales as (
    select (o.created_at at time zone 'Asia/Seoul')::date as d, count(*)::int as n, sum(o.amount)::bigint as amt
    from public.orders o
    where o.type = 'purchase' and o.outcome is distinct from 'cancelled'
      and o.created_at >= v_start and o.created_at < v_end
    group by 1
  ), refs as (
    select (o.closed_at at time zone 'Asia/Seoul')::date as d, sum(o.amount)::bigint as amt
    from public.orders o
    where o.type = 'purchase' and o.outcome = 'refunded'
      and o.closed_at >= v_start and o.closed_at < v_end
    group by 1
  )
  select days.d, coalesce(sales.n, 0), coalesce(sales.n, 0), coalesce(sales.amt, 0)::bigint,
         coalesce(refs.amt, 0)::bigint, (coalesce(sales.amt, 0) - coalesce(refs.amt, 0))::bigint
  from days
  left join sales on sales.d = days.d
  left join refs on refs.d = days.d
  order by days.d;
end $$;

create or replace function public.erp_sales_by_product(p_from date, p_to date)
returns table (product_id text, name text, units int, revenue bigint, refunds bigint, net bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_start timestamptz := p_from::timestamp at time zone 'Asia/Seoul';
  v_end timestamptz := (p_to + 1)::timestamp at time zone 'Asia/Seoul';
begin
  perform erp_internal.require_role('manager');
  perform erp_internal.check_range(p_from, p_to);
  return query
  with sales as (
    select o.product_id as pid, count(*)::int as n, sum(o.amount)::bigint as amt
    from public.orders o
    where o.type = 'purchase' and o.outcome is distinct from 'cancelled'
      and o.created_at >= v_start and o.created_at < v_end
    group by 1
  ), refs as (
    select o.product_id as pid, sum(o.amount)::bigint as amt
    from public.orders o
    where o.type = 'purchase' and o.outcome = 'refunded'
      and o.closed_at >= v_start and o.closed_at < v_end
    group by 1
  )
  select p.id, p.name, coalesce(sales.n, 0), coalesce(sales.amt, 0)::bigint, coalesce(refs.amt, 0)::bigint,
         (coalesce(sales.amt, 0) - coalesce(refs.amt, 0))::bigint
  from public.products p
  left join sales on sales.pid = p.id
  left join refs on refs.pid = p.id
  where sales.pid is not null or refs.pid is not null
  order by 4 desc;
end $$;

-- 권한
revoke all on function erp_internal.order_before_insert(), erp_internal.order_after_insert(),
  erp_internal.order_before_update(), erp_internal.return_stock(uuid, text), erp_internal.check_range(date, date)
  from public, anon, authenticated;

revoke all on function public.erp_order_action(uuid, text, text), public.erp_update_settings(int, int, boolean),
  public.erp_dashboard(), public.erp_sales_daily(date, date), public.erp_sales_by_product(date, date)
  from public, anon;
grant execute on function public.erp_order_action(uuid, text, text), public.erp_update_settings(int, int, boolean),
  public.erp_dashboard(), public.erp_sales_daily(date, date), public.erp_sales_by_product(date, date)
  to authenticated;
