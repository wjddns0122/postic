create table products (
  id text primary key,
  name text not null,
  brand text not null default 'POSTIC STUDIO',
  price int not null,
  color text,
  material text,
  emoji text not null default '👕',
  image_url text,
  sizes jsonb not null default '{}'::jsonb,
  major int not null,
  minor int not null,
  hanger text not null,
  zone text not null,
  sort int not null default 0,
  unique (major, minor)
);

create table tag_presence (
  key text primary key,
  major int not null,
  minor int not null,
  rssi int,
  last_seen timestamptz not null default now(),
  gateway text,
  simulated boolean not null default false
);

create sequence pickup_seq start 41;

create table orders (
  id uuid primary key default gen_random_uuid(),
  product_id text references products(id),
  size text,
  type text not null default 'purchase',
  status text not null default 'preparing',
  pickup_code text not null default ('B-' || nextval('pickup_seq')),
  amount int not null default 0,
  pay_method text,
  created_at timestamptz not null default now()
);

create table settings (
  id int primary key default 1,
  rssi_threshold int not null default -100,
  online_seconds int not null default 10
);
insert into settings default values;

create table gateway_raw (
  id int primary key default 1,
  received_at timestamptz,
  body text,
  count bigint not null default 0
);
insert into gateway_raw (id) values (1);

create or replace function log_raw(p_body text) returns void
language sql security definer set search_path = public as $$
  update gateway_raw set received_at = now(), body = left(p_body, 8000), count = count + 1 where id = 1;
$$;

alter table products enable row level security;
alter table tag_presence enable row level security;
alter table orders enable row level security;
alter table settings enable row level security;
alter table gateway_raw enable row level security;

create policy "read products" on products for select using (true);
create policy "read presence" on tag_presence for select using (true);
create policy "read orders" on orders for select using (true);
create policy "insert orders" on orders for insert with check (true);
create policy "update orders" on orders for update using (true);
create policy "read settings" on settings for select using (true);
create policy "update settings" on settings for update using (true);
create policy "read raw" on gateway_raw for select using (true);

-- Realtime(WebSocket)으로 변경을 내보낼 테이블
alter publication supabase_realtime add table tag_presence, orders, settings, gateway_raw;

insert into products (id, name, price, color, material, emoji, sizes, major, minor, hanger, zone, sort) values
('A7-32F1', '오버핏 블레이저', 129000, '블랙', '울 62% · 폴리 38%', '🧥', '{"S":2,"M":4,"L":1,"XL":0}', 1, 101, 'HG-01', 'A-01', 1),
('B2-19C7', '램스울 크루넥 니트', 89000, '베이지', '램스울 100%', '🧶', '{"S":3,"M":5,"L":2,"XL":1}', 1, 102, 'HG-01', 'A-01', 2),
('C4-77A0', '코튼 옥스퍼드 셔츠', 59000, '화이트', '면 100%', '👔', '{"S":1,"M":6,"L":3,"XL":2}', 1, 103, 'HG-01', 'A-01', 3),
('D1-08B2', '플리츠 롱스커트', 79000, '버건디', '폴리 100%', '👗', '{"S":2,"M":2,"L":1,"XL":0}', 2, 201, 'HG-02', 'A-02', 4),
('E5-41D9', '와이드 데님 팬츠', 69000, '인디고', '면 98% · 스판 2%', '👖', '{"S":4,"M":3,"L":2,"XL":1}', 2, 202, 'HG-02', 'A-02', 5),
('F3-92E4', '울 블렌드 코트', 199000, '카멜', '울 70% · 나일론 30%', '🧥', '{"S":1,"M":2,"L":2,"XL":0}', 2, 203, 'HG-02', 'A-02', 6);
