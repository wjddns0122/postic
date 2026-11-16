-- Task 3: 주문 처리·재고 연동·매출
do $$
declare
  m uuid; s uuid;
  o1 public.orders; f public.orders; o2 public.orders; o3 public.orders; u public.orders; r public.orders;
  st public.settings;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  s0 record; s1 record; bp record;
  d jsonb;
  n int;
begin
  perform pg_temp.as_admin();
  m := pg_temp.mk_user('erp-t-mgr@test.dev');
  s := pg_temp.mk_user('erp-t-staff@test.dev');
  insert into public.staff_members (user_id, role) values (m, 'manager'), (s, 'staff');
  insert into public.products (id, name, price, hanger, zone, sizes, status)
  values ('ZT-TEST', '테스트 자켓', 15000, 'HG-09', 'Z-09', '{}', 'active');
  insert into public.skus (id, product_id, size) values ('ZT-TEST/M', 'ZT-TEST', 'M');

  perform pg_temp.as_user(m);
  perform public.erp_receive_stock('ZT-TEST/M', 2);
  select * into s0 from public.erp_sales_daily(v_today, v_today);

  -- 구매하면 재고 -1, 피팅은 그대로
  perform pg_temp.as_anon();
  o1 := public.place_order('dev-test-0001', 'ZT-TEST', 'M', 'purchase', '카드');
  f := public.place_order('dev-test-0001', 'ZT-TEST', 'M', 'fitting');
  perform pg_temp.as_admin();
  assert o1.sku_id = 'ZT-TEST/M', format('sku_id set on insert: %s', o1.sku_id);
  assert (select on_hand from public.stock where sku_id = 'ZT-TEST/M') = 1, 'purchase takes 1, fitting none';
  assert exists (select 1 from public.inventory_movements where order_id = o1.id and reason = 'sale' and delta = -1), 'sale movement';
  assert (select sizes ->> 'M' from public.products where id = 'ZT-TEST') = '1', 'customer sizes follow stock';

  -- staff: 준비 완료는 되고, 취소는 안 됨
  perform pg_temp.as_user(s);
  r := public.erp_order_action(o1.id, 'ready');
  assert r.status = 'ready' and r.handled_by = s, 'staff ready';
  perform pg_temp.expect_error(format('select public.erp_order_action(%L, %L)', o1.id, 'cancel'), 'forbidden');
  perform pg_temp.expect_error(format('select public.erp_order_action(%L, %L)', o1.id, 'bogus'), 'invalid_input');
  perform pg_temp.expect_error(format('select public.erp_order_action(%L, %L)', gen_random_uuid(), 'ready'), 'not_found');

  -- manager: 취소하면 재고가 한 번만 돌아온다
  perform pg_temp.as_user(m);
  r := public.erp_order_action(o1.id, 'cancel', '고객 변심');
  assert r.status = 'done' and r.outcome = 'cancelled' and r.closed_at is not null,
    format('cancel: %s', row_to_json(r));
  -- 취소 사유는 직원만 본다 (orders는 손님에게 공개·방송되므로 거기에 두지 않는다)
  assert exists (select 1 from public.order_notes where order_id = o1.id and action = 'cancel' and note = '고객 변심' and actor = m),
    'cancel note kept for staff';
  perform pg_temp.as_anon();
  assert not exists (select 1 from public.orders o where to_jsonb(o)::text like '%고객 변심%'), 'cancel note not public';
  perform pg_temp.expect_error('select count(*) from public.order_notes', 'permission denied');
  perform pg_temp.as_user(m);
  perform pg_temp.expect_error(format('select public.erp_order_action(%L, %L)', o1.id, 'cancel'), 'invalid_input');
  perform pg_temp.expect_error(format('select public.erp_order_action(%L, %L)', o1.id, 'refund'), 'invalid_input');
  perform pg_temp.expect_error(format('select public.erp_order_action(%L, %L)', f.id, 'refund'), 'invalid_input');
  perform pg_temp.as_admin();
  assert (select on_hand from public.stock where sku_id = 'ZT-TEST/M') = 2, 'cancel returns stock';
  select count(*) into n from public.inventory_movements where order_id = o1.id and reason = 'return';
  assert n = 1, format('exactly one return movement, got %s', n);

  -- 수령 완료 → 환불
  perform pg_temp.as_anon();
  o2 := public.place_order('dev-test-0001', 'ZT-TEST', 'M', 'purchase', '카드');
  perform pg_temp.as_user(s);
  r := public.erp_order_action(o2.id, 'complete');
  assert r.status = 'done' and r.outcome = 'completed', 'complete';
  perform pg_temp.expect_error(format('select public.erp_order_action(%L, %L)', o2.id, 'ready'), 'invalid_input');
  perform pg_temp.as_user(m);
  r := public.erp_order_action(o2.id, 'refund');
  assert r.outcome = 'refunded' and r.status = 'done', 'refund';
  perform pg_temp.expect_error(format('select public.erp_order_action(%L, %L)', o2.id, 'refund'), 'invalid_input');
  perform pg_temp.as_admin();
  assert (select on_hand from public.stock where sku_id = 'ZT-TEST/M') = 2, 'refund returns stock';

  -- 기존 PIN 경로도 동작하고 pin으로 기록된다
  update private.staff set pin_hash = extensions.crypt('9999', extensions.gen_salt('bf')) where id = 1;
  perform pg_temp.as_anon();
  o3 := public.place_order('dev-test-0002', 'ZT-TEST', 'M', 'purchase', '카드');
  r := public.staff_set_order_status('9999', o3.id, 'done');
  assert r.outcome = 'completed' and r.closed_at is not null, 'legacy done sets outcome completed';
  perform pg_temp.as_admin();
  assert exists (
    select 1 from public.audit_log
    where entity = 'orders' and entity_id = o3.id::text and actor_kind = 'pin' and after ->> 'status' = 'done'
  ), 'PIN change audited as pin';
  assert exists (
    select 1 from public.audit_log
    where entity = 'orders' and entity_id = o1.id::text and actor = m and actor_kind = 'staff' and after ->> 'outcome' = 'cancelled'
  ), 'ERP change audited with staff actor';
  assert not exists (select 1 from public.audit_log where entity = 'orders' and action = 'insert' and at >= now()),
    'customer order inserts are not audited';

  -- 판매 중이 아닌 상품은 주문 불가
  update public.products set status = 'hidden' where id = 'ZT-TEST';
  perform pg_temp.as_anon();
  perform pg_temp.expect_error($q$select public.place_order('dev-test-0002', 'ZT-TEST', 'M', 'purchase', '카드')$q$, 'invalid_product');
  perform pg_temp.as_admin();
  update public.products set status = 'active' where id = 'ZT-TEST';

  -- 품절 차단: 켜면 구매만 막고 피팅은 된다. 끄면 음수 재고 허용, 손님에겐 0
  perform pg_temp.as_user(m);
  perform public.erp_adjust_stock('ZT-TEST/M', 0);
  st := public.erp_update_settings(null, null, true);
  assert st.block_oversell, 'block on';
  perform pg_temp.as_anon();
  perform pg_temp.expect_error($q$select public.place_order('dev-test-0002', 'ZT-TEST', 'M', 'purchase', '카드')$q$, 'out_of_stock');
  perform public.place_order('dev-test-0002', 'ZT-TEST', 'M', 'fitting');
  perform pg_temp.as_user(m);
  st := public.erp_update_settings(-200, 100, false);
  assert st.rssi_threshold = -100 and st.online_seconds = 60 and not st.block_oversell, format('clamps: %s', row_to_json(st));
  perform pg_temp.as_user(s);
  perform pg_temp.expect_error('select public.erp_update_settings(-70)', 'forbidden');
  perform pg_temp.as_anon();
  perform public.place_order('dev-test-0002', 'ZT-TEST', 'M', 'purchase', '카드');
  perform pg_temp.as_admin();
  assert (select on_hand from public.stock where sku_id = 'ZT-TEST/M') = -1, 'oversell allowed when block off';
  assert (select sizes ->> 'M' from public.products where id = 'ZT-TEST') = '0', 'customer sees 0';

  -- SKU가 없는 판매 중 상품: 주문은 성공, 재고 이력 없음, 오류 기록 없음
  insert into public.products (id, name, price, hanger, zone, sizes, status)
  values ('ZU-TEST', '테스트 U', 1000, 'HG-09', 'Z-09', '{"M":1}', 'active');
  perform pg_temp.as_anon();
  u := public.place_order('dev-test-0002', 'ZU-TEST', 'M', 'purchase', '카드');
  perform pg_temp.as_admin();
  assert u.sku_id is null, 'no sku → null';
  assert not exists (select 1 from public.inventory_movements where order_id = u.id), 'no movement without sku';
  assert not exists (select 1 from public.audit_log where action = 'error' and at >= now()), 'no internal error rows';

  -- 재고 차감이 실패해도 주문은 성공하고, 오류만 기록된다 (일부러 실패를 주입)
  perform pg_temp.as_admin();
  update public.products set status = 'active' where id = 'ZT-TEST';
  alter table public.inventory_movements add constraint erp_test_fail check (delta > 1000) not valid;
  perform pg_temp.as_anon();
  u := public.place_order('dev-test-0003', 'ZT-TEST', 'M', 'purchase', '카드');
  perform pg_temp.as_admin();
  assert u.id is not null and not exists (select 1 from public.inventory_movements where order_id = u.id), 'order kept, no movement';
  assert exists (select 1 from public.audit_log where action = 'error' and entity = 'order_after_insert' and at >= now()),
    'injected failure logged';
  alter table public.inventory_movements drop constraint erp_test_fail;
  delete from public.audit_log where action = 'error' and at >= now();

  -- 매출: 취소 제외, 환불은 환불일에 차감 (테스트 전 기준값과의 차이로 확인)
  -- 테스트 구매: o1 취소(제외), o2 환불, o3 완료, 품절 무시 구매 1건, 실패 주입 구매 1건 = ZT-TEST 4건 60,000 + ZU-TEST 1,000
  perform pg_temp.as_user(m);
  select * into s1 from public.erp_sales_daily(v_today, v_today);
  assert s1.day = v_today, 'one row for today';
  assert s1.orders - s0.orders = 5 and s1.units - s0.units = 5, format('orders/units delta %s/%s', s1.orders - s0.orders, s1.units - s0.units);
  assert s1.revenue - s0.revenue = 61000, format('revenue delta %s', s1.revenue - s0.revenue);
  assert s1.refunds - s0.refunds = 15000, format('refunds delta %s', s1.refunds - s0.refunds);
  assert s1.net - s0.net = 46000, format('net delta %s', s1.net - s0.net);
  select * into bp from public.erp_sales_by_product(v_today, v_today) where product_id = 'ZT-TEST';
  assert bp.units = 4 and bp.revenue = 60000 and bp.refunds = 15000 and bp.net = 45000, format('by product %s', row_to_json(bp));
  select count(*) into n from public.erp_sales_daily(v_today - 6, v_today);
  assert n = 7, format('one row per day incl. empty days, got %s', n);
  perform pg_temp.expect_error(format('select * from public.erp_sales_daily(%L, %L)', v_today, v_today - 1), 'invalid_input');
  perform pg_temp.expect_error(format('select * from public.erp_sales_daily(%L, %L)', v_today - 400, v_today), 'invalid_input');

  -- 대시보드: staff는 매출 칸이 비어 있다
  d := public.erp_dashboard();
  assert (d ->> 'revenue_today')::bigint = s1.revenue, format('manager dashboard revenue %s', d);
  perform pg_temp.as_user(s);
  d := public.erp_dashboard();
  assert d ? 'revenue_today' and d ->> 'revenue_today' is null, format('staff revenue hidden: %s', d);
  assert (d ->> 'orders_today')::int >= 5, format('orders_today %s', d);
  perform pg_temp.expect_error(format('select * from public.erp_sales_daily(%L, %L)', v_today, v_today), 'forbidden');

  perform pg_temp.as_admin();
end $$;
