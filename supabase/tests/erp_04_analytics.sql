-- Task 4: 분 단위 태그·게이트 기록, 손님 행동, 분석 함수
-- 합성 태그 데이터는 실데이터가 없는 날(2026-01-05)에 넣는다 (오늘은 실제 G1 기록이 섞이므로)
do $$
declare
  m uuid; s uuid;
  r record;
  n int;
  i int;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  perform pg_temp.as_admin();
  m := pg_temp.mk_user('erp-t-mgr@test.dev');
  s := pg_temp.mk_user('erp-t-staff@test.dev');
  insert into public.staff_members (user_id, role) values (m, 'manager'), (s, 'staff');
  insert into public.products (id, name, price, hanger, zone, sizes, status, major, minor)
  values ('ZT-TEST', '테스트 자켓', 15000, 'HG-09', 'Z-09', '{"M":5}', 'active', 9, 901);

  -- tag_presence가 갱신될 때마다 그 분의 행에 더한다
  insert into public.tag_presence (key, major, minor, rssi, last_seen, gateway, simulated)
  values ('9-901', 9, 901, -50, '2026-01-05 10:00:05+09', 'G1-TEST', false);
  update public.tag_presence set last_seen = '2026-01-05 10:00:40+09', rssi = -60 where key = '9-901';
  update public.tag_presence set last_seen = '2026-01-05 10:01:10+09', rssi = -55 where key = '9-901';
  select * into r from public.tag_minutes where tag_key = '9-901' and minute = '2026-01-05 10:00:00+09';
  assert r.samples = 2 and r.rssi_sum = -110 and r.rssi_max = -50 and r.rssi_min = -60
     and r.product_id = 'ZT-TEST' and r.gateway = 'G1-TEST', format('minute 10:00: %s', row_to_json(r));
  assert (select samples from public.tag_minutes where tag_key = '9-901' and minute = '2026-01-05 10:01:00+09') = 1, 'minute 10:01';
  -- last_seen이 그대로면 세지 않는다
  update public.tag_presence set rssi = -40 where key = '9-901';
  assert (select samples from public.tag_minutes where tag_key = '9-901' and minute = '2026-01-05 10:01:00+09') = 1,
    'unchanged last_seen not counted';

  -- g1-ingest가 실제로 쓰는 경로: upsert(충돌 시 update)와 log_raw()
  for i in 1 .. 2 loop
    insert into public.tag_presence (key, major, minor, rssi, last_seen, gateway, simulated)
    values ('9-903', 9, 903, -45, '2026-01-05 09:00:00+09'::timestamptz + i * interval '10 seconds', 'G1-TEST', false)
    on conflict (key) do update set rssi = excluded.rssi, last_seen = excluded.last_seen, gateway = excluded.gateway;
  end loop;
  assert (select samples from public.tag_minutes where tag_key = '9-903' and minute = '2026-01-05 09:00:00+09') = 2,
    'insert + upsert-update paths both counted';
  perform public.log_raw('{"gw":"ac233fc2beef","adv":[]}');
  assert (select posts from public.gateway_minutes where gateway = 'G1-BEEF' and minute = date_trunc('minute', now())) = 1,
    'log_raw path counted';

  -- 상품에 연결 안 된 태그도 수신은 성공, 시뮬레이터 데이터는 기록 안 함
  insert into public.tag_presence (key, major, minor, rssi, last_seen, gateway, simulated)
  values ('9-999', 9, 999, -50, '2026-01-05 10:02:00+09', 'G1-TEST', false);
  assert exists (select 1 from public.tag_minutes where tag_key = '9-999' and product_id is null), 'unknown tag recorded';
  insert into public.tag_presence (key, major, minor, rssi, last_seen, gateway, simulated)
  values ('9-902', 9, 902, -50, '2026-01-05 10:02:00+09', 'SIM', true);
  assert not exists (select 1 from public.tag_minutes where tag_key = '9-902'), 'simulated ignored';

  -- G1 업로드는 gateway_raw 갱신마다 게이트·분 단위로 센다. 깨진 본문이어도 수신은 성공
  update public.gateway_raw set body = '{"gw":"ac233fc2abcd"}', count = count + 1 where id = 1;
  assert (select posts from public.gateway_minutes where gateway = 'G1-ABCD' and minute = date_trunc('minute', now())) = 1,
    'gateway minute from body.gw';
  update public.gateway_raw set body = 'not json', count = count + 1 where id = 1;
  assert (select posts from public.gateway_minutes where gateway = 'GW-01' and minute = date_trunc('minute', now())) >= 1,
    'fallback gateway name';
  assert not exists (select 1 from public.audit_log where action = 'error' and at >= now()), 'no internal error rows';

  -- 자리 비움: 게이트가 살아 있던 10:00~10:04 중 태그가 안 잡혔거나 약했던 분
  insert into public.gateway_minutes (gateway, minute, posts)
  select 'G1-TEST', g, 60
  from generate_series('2026-01-05 10:00:00+09'::timestamptz, '2026-01-05 10:04:00+09', interval '1 minute') g;
  update public.tag_presence set last_seen = '2026-01-05 10:04:20+09', rssi = -50 where key = '9-901';

  perform pg_temp.as_user(m);
  select * into r from public.erp_tag_activity('2026-01-05', '2026-01-05', -100) where product_id = 'ZT-TEST';
  assert r.gateway_minutes = 5 and r.seen_minutes = 3 and r.away_minutes = 2 and r.away_count = 1,
    format('threshold -100: %s', row_to_json(r));
  select * into r from public.erp_tag_activity('2026-01-05', '2026-01-05', -52) where product_id = 'ZT-TEST';
  assert r.seen_minutes = 1 and r.away_minutes = 4 and r.away_count = 1, format('threshold -52: %s', row_to_json(r));
  assert r.last_seen = '2026-01-05 10:04:00+09', format('last_seen %s', r.last_seen);

  -- 손님 행동 기록 (anon)
  perform pg_temp.as_anon();
  perform public.track_event('dev-test-0001', 'view_product', 'ZT-TEST');
  perform pg_temp.expect_error($q$select public.track_event('short', 'view_product')$q$, 'invalid_input');
  perform pg_temp.expect_error($q$select public.track_event('dev-test-0001', 'view_cart')$q$, 'invalid_input');
  perform pg_temp.expect_error($q$select public.track_event('dev-test-0001', 'view_product', 'NOPE-XX')$q$, 'invalid_input');
  for i in 1 .. 59 loop
    perform public.track_event('dev-test-0001', 'view_home');
  end loop;
  perform pg_temp.expect_error($q$select public.track_event('dev-test-0001', 'view_home')$q$, 'rate_limited');
  perform pg_temp.expect_error('select count(*) from public.customer_events', 'permission denied');

  -- 퍼널: 조회 1, 피팅 1, 구매 1
  perform public.place_order('dev-test-0002', 'ZT-TEST', 'M', 'fitting');
  perform public.place_order('dev-test-0002', 'ZT-TEST', 'M', 'purchase', '카드');
  perform pg_temp.as_user(m);
  select * into r from public.erp_product_funnel(v_today, v_today) where product_id = 'ZT-TEST';
  assert r.views = 1 and r.fitting_requests = 1 and r.purchases = 1
     and r.view_to_purchase = 100.0 and r.fitting_to_purchase = 100.0, format('funnel %s', row_to_json(r));
  assert not exists (
    select 1 from public.erp_product_funnel(v_today, v_today) where views = 0 and view_to_purchase is not null
  ), 'no ratio when no views';

  -- staff는 분석 데이터·함수 접근 불가
  perform pg_temp.as_user(s);
  select count(*) into n from public.tag_minutes;
  assert n = 0, format('staff must not read tag_minutes, got %s', n);
  perform pg_temp.expect_error($q$select * from public.erp_tag_activity('2026-01-05', '2026-01-05')$q$, 'forbidden');
  perform pg_temp.expect_error(format('select * from public.erp_product_funnel(%L, %L)', v_today, v_today), 'forbidden');

  perform pg_temp.as_admin();
end $$;
