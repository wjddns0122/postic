-- ERP 2/4: 상품·SKU·재고 이력
-- 재고의 진실은 inventory_movements(쌓기만 함). stock은 그 합계 캐시, products.sizes는 지금 손님 화면용 사본.
-- 적용 직후 products.sizes 값은 바뀌지 않는다 (현재 수량을 opening 이력으로 옮김).

-- products: 판매 상태·분류·수정 시각. 태그 없는 상품도 등록할 수 있게 major/minor NOT NULL 해제
alter table public.products
  add column status text not null default 'active' check (status in ('active', 'hidden', 'archived')),
  add column category text,
  add column updated_at timestamptz not null default now();
alter table public.products
  alter column major drop not null,
  alter column minor drop not null;
-- g1-ingest가 MAC으로 찾은 상품의 major/minor로 태그 키를 만들므로, MAC이 있으면 둘 다 있어야 한다
alter table public.products
  add constraint products_tag_complete check (mac is null or (major is not null and minor is not null));

-- 손님에게는 판매 중(active) 상품만 보인다. 직원은 전부
drop policy "read products" on public.products;
create policy "read products" on public.products
  for select using (status = 'active' or (select erp_internal.erp_has_role('staff')));

create table public.skus (
  id text primary key, -- '<상품ID>/<사이즈>'
  product_id text not null references public.products (id) on delete cascade,
  size text not null,
  barcode text unique,
  reorder_point int not null default 1 check (reorder_point >= 0),
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (product_id, size)
);

-- 원가는 따로: manager 이상만 읽는다
create table public.sku_costs (
  sku_id text primary key references public.skus (id) on delete cascade,
  cost int not null check (cost >= 0),
  updated_at timestamptz not null default now()
);

create table public.stock (
  sku_id text primary key references public.skus (id) on delete cascade,
  on_hand int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.inventory_movements (
  id bigint generated always as identity primary key,
  sku_id text not null references public.skus (id),
  delta int not null check (delta <> 0),
  reason text not null check (reason in ('opening', 'receive', 'sale', 'return', 'adjust', 'loss')),
  order_id uuid references public.orders (id) on delete set null,
  note text,
  actor uuid,
  created_at timestamptz not null default now()
);
create index inventory_movements_sku on public.inventory_movements (sku_id, created_at desc);
-- 한 주문에 판매 1번, 반품 1번만 (취소·환불을 두 번 눌러도 재고가 두 번 돌아오지 않게)
create unique index inventory_movements_order_reason
  on public.inventory_movements (order_id, reason) where order_id is not null;

-- 새 SKU는 재고 0으로 시작
create or replace function erp_internal.sku_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.stock (sku_id) values (new.id) on conflict do nothing;
  return null;
end $$;

-- 이력 → 재고 합계
create or replace function erp_internal.apply_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.stock as s (sku_id, on_hand, updated_at)
  values (new.sku_id, new.delta, now())
  on conflict (sku_id) do update set on_hand = s.on_hand + excluded.on_hand, updated_at = now();
  return null;
end $$;

-- products.sizes = 활성 SKU의 {사이즈: max(재고, 0)} (지금 손님 화면과 place_order가 읽는 값)
create or replace function erp_internal.refresh_sizes(p_product text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_sizes jsonb;
begin
  select coalesce(jsonb_object_agg(k.size, greatest(coalesce(s.on_hand, 0), 0)), '{}'::jsonb)
  into v_sizes
  from public.skus k
  left join public.stock s on s.sku_id = k.id
  where k.product_id = p_product and k.active;
  update public.products set sizes = v_sizes where id = p_product and sizes is distinct from v_sizes;
end $$;

create or replace function erp_internal.stock_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform erp_internal.refresh_sizes((select k.product_id from public.skus k where k.id = new.sku_id));
  return null;
end $$;

create or replace function erp_internal.sku_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform erp_internal.refresh_sizes(coalesce(new.product_id, old.product_id));
  return null;
end $$;

create trigger sku_created after insert on public.skus
for each row execute function erp_internal.sku_created();
create trigger sku_changed after update of active, size or delete on public.skus
for each row execute function erp_internal.sku_changed();
create trigger apply_movement after insert on public.inventory_movements
for each row execute function erp_internal.apply_movement();
create trigger stock_changed after insert or update on public.stock
for each row execute function erp_internal.stock_changed();

-- 작업 기록 (sizes·updated_at만 바뀐 자동 동기화는 기록하지 않음)
create trigger audit_products after insert or update or delete on public.products
for each row execute function erp_internal.audit_row('id', 'sizes', 'updated_at');
create trigger audit_skus after insert or update or delete on public.skus
for each row execute function erp_internal.audit_row('id');
create trigger audit_sku_costs after insert or update on public.sku_costs
for each row execute function erp_internal.audit_row('sku_id', 'updated_at');

-- 백필: 지금 sizes의 사이즈마다 SKU, 수량은 opening 이력으로
create temp table _erp_opening on commit drop as
select p.id as product_id, e.key as size, (e.value)::int as qty
from public.products p, jsonb_each(p.sizes) e;

insert into public.skus (id, product_id, size, sort)
select o.product_id || '/' || o.size, o.product_id, o.size,
       coalesce(array_position(array['XS', 'S', 'M', 'L', 'XL', 'XXL'], o.size) - 1, 9)
from _erp_opening o;

insert into public.inventory_movements (sku_id, delta, reason, note)
select o.product_id || '/' || o.size, o.qty, 'opening', 'ERP 도입 시점 재고'
from _erp_opening o
where o.qty <> 0;

create view public.erp_stock_view with (security_invoker = true) as
select k.id as sku_id,
       k.product_id,
       p.name as product_name,
       k.size,
       coalesce(s.on_hand, 0) as on_hand,
       k.reorder_point,
       coalesce(s.on_hand, 0) <= k.reorder_point as low,
       k.active,
       k.sort
from public.skus k
join public.products p on p.id = k.product_id
left join public.stock s on s.sku_id = k.id;

-- 상품 생성·수정 (id 없으면 생성: 기본 hidden, HG-01/A-01). 안 보낸 키는 그대로 둔다
create or replace function public.erp_save_product(p jsonb) returns public.products
language plpgsql security definer set search_path = '' as $$
declare
  v_id text := nullif(trim(p ->> 'id'), '');
  v_price int;
  v_sort int;
  v_row public.products;
begin
  perform erp_internal.require_role('manager');
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'invalid_input';
  end if;
  begin
    v_price := (p ->> 'price')::int;
    v_sort := (p ->> 'sort')::int;
  exception when others then
    raise exception 'invalid_input';
  end;
  if (p ? 'name' and coalesce(trim(p ->> 'name'), '') = '')
     or v_price < 0
     or (p ? 'status' and coalesce(p ->> 'status', '') not in ('active', 'hidden', 'archived')) then
    raise exception 'invalid_input';
  end if;

  if v_id is null then
    if coalesce(trim(p ->> 'name'), '') = '' or v_price is null then
      raise exception 'invalid_input';
    end if;
    loop
      v_id := upper(substr(md5(random()::text), 1, 2)) || '-' || upper(substr(md5(random()::text), 1, 4));
      exit when not exists (select 1 from public.products where id = v_id);
    end loop;
    insert into public.products (
      id, name, brand, price, color, material, category, image_url, back_image_url,
      hanger, zone, sort, status, emoji, sizes, updated_at
    ) values (
      v_id,
      trim(p ->> 'name'),
      coalesce(nullif(trim(p ->> 'brand'), ''), 'POSTIC STUDIO'),
      v_price,
      p ->> 'color',
      p ->> 'material',
      p ->> 'category',
      p ->> 'image_url',
      p ->> 'back_image_url',
      coalesce(nullif(trim(p ->> 'hanger'), ''), 'HG-01'),
      coalesce(nullif(trim(p ->> 'zone'), ''), 'A-01'),
      coalesce(v_sort, (select coalesce(max(sort), 0) + 1 from public.products)),
      coalesce(p ->> 'status', 'hidden'),
      coalesce(nullif(p ->> 'emoji', ''), '👕'),
      '{}'::jsonb,
      now()
    )
    returning * into v_row;
    return v_row;
  end if;

  update public.products t set
    name = coalesce(nullif(trim(p ->> 'name'), ''), t.name),
    brand = coalesce(nullif(trim(p ->> 'brand'), ''), t.brand),
    price = coalesce(v_price, t.price),
    color = case when p ? 'color' then p ->> 'color' else t.color end,
    material = case when p ? 'material' then p ->> 'material' else t.material end,
    category = case when p ? 'category' then p ->> 'category' else t.category end,
    image_url = case when p ? 'image_url' then p ->> 'image_url' else t.image_url end,
    back_image_url = case when p ? 'back_image_url' then p ->> 'back_image_url' else t.back_image_url end,
    hanger = coalesce(nullif(trim(p ->> 'hanger'), ''), t.hanger),
    zone = coalesce(nullif(trim(p ->> 'zone'), ''), t.zone),
    sort = coalesce(v_sort, t.sort),
    status = coalesce(p ->> 'status', t.status),
    emoji = coalesce(nullif(p ->> 'emoji', ''), t.emoji),
    updated_at = now()
  where t.id = v_id
  returning * into v_row;
  if not found then
    raise exception 'not_found';
  end if;
  return v_row;
end $$;

-- SKU 생성·수정 (null인 인자는 그대로 둠). p_cost가 있으면 원가도 저장
create or replace function public.erp_save_sku(
  p_product text,
  p_size text,
  p_cost int default null,
  p_barcode text default null,
  p_reorder_point int default null,
  p_sort int default null,
  p_active boolean default null
) returns public.skus
language plpgsql security definer set search_path = '' as $$
declare
  v_size text := trim(p_size);
  v_row public.skus;
begin
  perform erp_internal.require_role('manager');
  if v_size is null or v_size = '' or length(v_size) > 10
     or p_cost < 0 or p_reorder_point < 0 then
    raise exception 'invalid_input';
  end if;
  if not exists (select 1 from public.products where id = p_product) then
    raise exception 'not_found';
  end if;
  begin
    insert into public.skus as k (id, product_id, size, barcode, reorder_point, sort, active)
    values (
      p_product || '/' || v_size, p_product, v_size, nullif(trim(p_barcode), ''),
      coalesce(p_reorder_point, 1),
      coalesce(p_sort, array_position(array['XS', 'S', 'M', 'L', 'XL', 'XXL'], v_size) - 1, 9),
      coalesce(p_active, true)
    )
    on conflict (product_id, size) do update set
      barcode = coalesce(nullif(trim(p_barcode), ''), k.barcode),
      reorder_point = coalesce(p_reorder_point, k.reorder_point),
      sort = coalesce(p_sort, k.sort),
      active = coalesce(p_active, k.active)
    returning * into v_row;
  exception when unique_violation then
    raise exception 'invalid_input'; -- 다른 SKU가 쓰는 바코드
  end;
  if p_cost is not null then
    insert into public.sku_costs as c (sku_id, cost, updated_at) values (v_row.id, p_cost, now())
    on conflict (sku_id) do update set cost = excluded.cost, updated_at = now();
  end if;
  return v_row;
end $$;

-- 비콘 연결. major/minor를 안 주면: major = 행거 번호(HG-01 → 1), minor = 그 major의 다음 빈 번호
-- p_mac이 null이면 연결 해제
create or replace function public.erp_link_tag(
  p_product text,
  p_mac text,
  p_major int default null,
  p_minor int default null
) returns public.products
language plpgsql security definer set search_path = '' as $$
declare
  v_p public.products;
  v_mac text;
  v_major int;
  v_minor int;
begin
  perform erp_internal.require_role('manager');
  select * into v_p from public.products where id = p_product for update;
  if not found then
    raise exception 'not_found';
  end if;
  if p_mac is null then
    update public.products set mac = null, updated_at = now() where id = p_product returning * into v_p;
    return v_p;
  end if;
  if trim(p_mac) !~ '^[0-9A-Fa-f]{2}([:-]?[0-9A-Fa-f]{2}){5}$' then
    raise exception 'invalid_input';
  end if;
  v_mac := upper(regexp_replace(p_mac, '[^0-9A-Fa-f]', '', 'g'));
  v_major := coalesce(p_major, v_p.major, nullif(regexp_replace(v_p.hanger, '\D', '', 'g'), '')::int, 1);
  v_minor := coalesce(
    p_minor,
    case when v_p.major = v_major then v_p.minor end,
    (select coalesce(max(x.minor), v_major * 100) + 1 from public.products x where x.major = v_major and x.id <> p_product)
  );
  begin
    update public.products
    set mac = v_mac, major = v_major, minor = v_minor, updated_at = now()
    where id = p_product
    returning * into v_p;
  exception when unique_violation then
    raise exception 'tag_in_use';
  end;
  return v_p;
end $$;

-- 입고 (staff 이상)
create or replace function public.erp_receive_stock(p_sku text, p_qty int, p_note text default null)
returns public.stock
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := erp_internal.require_role('staff');
  v_row public.stock;
begin
  if p_qty is null or p_qty < 1 or p_qty > 10000 then
    raise exception 'invalid_input';
  end if;
  if not exists (select 1 from public.skus where id = p_sku) then
    raise exception 'not_found';
  end if;
  insert into public.inventory_movements (sku_id, delta, reason, note, actor)
  values (p_sku, p_qty, 'receive', left(p_note, 500), v_uid);
  select * into v_row from public.stock where sku_id = p_sku;
  return v_row;
end $$;

-- 실사 결과로 맞추기 (manager 이상). 차이가 없으면 이력을 남기지 않는다
create or replace function public.erp_adjust_stock(
  p_sku text,
  p_counted int,
  p_reason text default 'adjust',
  p_note text default null
) returns public.stock
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := erp_internal.require_role('manager');
  v_on int;
  v_row public.stock;
begin
  if p_counted is null or p_counted < 0 or p_reason is null or p_reason not in ('adjust', 'loss') then
    raise exception 'invalid_input';
  end if;
  select on_hand into v_on from public.stock where sku_id = p_sku for update;
  if not found then
    raise exception 'not_found';
  end if;
  if p_counted <> v_on then
    insert into public.inventory_movements (sku_id, delta, reason, note, actor)
    values (p_sku, p_counted - v_on, p_reason, left(p_note, 500), v_uid);
  end if;
  select * into v_row from public.stock where sku_id = p_sku;
  return v_row;
end $$;

-- 권한
alter table public.skus enable row level security;
alter table public.sku_costs enable row level security;
alter table public.stock enable row level security;
alter table public.inventory_movements enable row level security;
revoke all on table public.skus, public.sku_costs, public.stock, public.inventory_movements, public.erp_stock_view
  from anon, authenticated;
grant select on table public.skus, public.sku_costs, public.stock, public.inventory_movements, public.erp_stock_view
  to authenticated;
create policy "erp staff read skus" on public.skus
  for select to authenticated using ((select erp_internal.erp_has_role('staff')));
create policy "erp staff read stock" on public.stock
  for select to authenticated using ((select erp_internal.erp_has_role('staff')));
create policy "erp staff read inventory_movements" on public.inventory_movements
  for select to authenticated using ((select erp_internal.erp_has_role('staff')));
create policy "erp manager read sku_costs" on public.sku_costs
  for select to authenticated using ((select erp_internal.erp_has_role('manager')));

revoke all on function erp_internal.sku_created(), erp_internal.apply_movement(), erp_internal.refresh_sizes(text),
  erp_internal.stock_changed(), erp_internal.sku_changed() from public, anon, authenticated;

revoke all on function public.erp_save_product(jsonb),
  public.erp_save_sku(text, text, int, text, int, int, boolean),
  public.erp_link_tag(text, text, int, int),
  public.erp_receive_stock(text, int, text),
  public.erp_adjust_stock(text, int, text, text) from public, anon;
grant execute on function public.erp_save_product(jsonb),
  public.erp_save_sku(text, text, int, text, int, int, boolean),
  public.erp_link_tag(text, text, int, int),
  public.erp_receive_stock(text, int, text),
  public.erp_adjust_stock(text, int, text, text) to authenticated;
