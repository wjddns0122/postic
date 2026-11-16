-- 1단계 (기존 배포본과 호환): 기기 토큰 컬럼, 주문 생성 RPC, 직원 PIN RPC 추가
-- 직원 PIN 값은 이 파일에 넣지 않는다. 설정/변경:
--   update private.staff set pin_hash = extensions.crypt('<PIN>', extensions.gen_salt('bf')) where id = 1;

create extension if not exists pgcrypto with schema extensions;

alter table orders add column if not exists device_id text;
create index if not exists orders_device_created on orders (device_id, created_at desc);

-- API로 노출되지 않는 스키마: 직원 PIN 해시
create schema if not exists private;
create table if not exists private.staff (
  id int primary key default 1 check (id = 1),
  pin_hash text not null
);

-- 손님 주문: 금액은 서버가 상품가로 정하고, 기기당 10분에 5건까지만
create or replace function public.place_order(
  p_device text,
  p_product text,
  p_size text,
  p_type text,
  p_pay_method text default null
) returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_recent int;
  v_order public.orders;
begin
  if p_device is null or length(p_device) not between 8 and 64 then
    raise exception 'invalid_device';
  end if;
  if p_type not in ('purchase', 'fitting') then
    raise exception 'invalid_type';
  end if;
  select * into v_product from public.products where id = p_product;
  if not found then
    raise exception 'invalid_product';
  end if;
  if p_size is null or not (v_product.sizes ? p_size) then
    raise exception 'invalid_size';
  end if;

  select count(*) into v_recent
  from public.orders
  where device_id = p_device and created_at > now() - interval '10 minutes';
  if v_recent >= 5 then
    raise exception 'rate_limited';
  end if;

  insert into public.orders (product_id, size, type, amount, pay_method, device_id)
  values (
    p_product,
    p_size,
    p_type,
    case when p_type = 'purchase' then v_product.price else 0 end,
    case when p_type = 'purchase' then left(p_pay_method, 40) end,
    p_device
  )
  returning * into v_order;
  return v_order;
end;
$$;

create or replace function private.staff_ok(p_pin text) returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.staff
    where p_pin is not null and pin_hash = extensions.crypt(p_pin, pin_hash)
  );
$$;

create or replace function public.staff_check(p_pin text) returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.staff_ok(p_pin);
$$;

create or replace function public.staff_set_order_status(p_pin text, p_order uuid, p_status text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not private.staff_ok(p_pin) then
    raise exception 'invalid_pin';
  end if;
  if p_status not in ('preparing', 'ready', 'done') then
    raise exception 'invalid_status';
  end if;
  update public.orders set status = p_status where id = p_order returning * into v_order;
  return v_order;
end;
$$;

create or replace function public.staff_update_settings(p_pin text, p_rssi int default null, p_online int default null)
returns public.settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.settings;
begin
  if not private.staff_ok(p_pin) then
    raise exception 'invalid_pin';
  end if;
  update public.settings
  -- greatest/least는 NULL을 무시하므로 NULL(변경 안 함)은 따로 거른다
  set rssi_threshold = case when p_rssi is null then rssi_threshold else greatest(-100, least(-30, p_rssi)) end,
      online_seconds = case when p_online is null then online_seconds else greatest(2, least(60, p_online)) end
  where id = 1
  returning * into v_settings;
  return v_settings;
end;
$$;

revoke all on function private.staff_ok(text) from public, anon, authenticated;
grant execute on function public.place_order(text, text, text, text, text) to anon, authenticated;
grant execute on function public.staff_check(text) to anon, authenticated;
grant execute on function public.staff_set_order_status(text, uuid, text) to anon, authenticated;
grant execute on function public.staff_update_settings(text, int, int) to anon, authenticated;
