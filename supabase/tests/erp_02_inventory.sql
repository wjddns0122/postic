-- Task 2: 상품·SKU·재고 이력
do $$
declare
  m uuid; s uuid;
  p public.products;
  st public.stock;
  n int;
  v_max int;
begin
  perform pg_temp.as_admin();
  m := pg_temp.mk_user('erp-t-mgr@test.dev');
  s := pg_temp.mk_user('erp-t-staff@test.dev');
  insert into public.staff_members (user_id, role) values (m, 'manager'), (s, 'staff');

  -- 백필: 사이즈마다 SKU, 처음 재고는 opening 이력, products.sizes는 재고와 같다
  select count(*) into n from public.skus where product_id = 'A7-32F1';
  assert n = (select count(*) from jsonb_object_keys((select sizes from public.products where id = 'A7-32F1'))),
    format('one sku per size, got %s', n);
  assert (select sizes from public.products where id = 'A7-32F1') = (
    select jsonb_object_agg(k.size, greatest(st2.on_hand, 0))
    from public.skus k join public.stock st2 on st2.sku_id = k.id
    where k.product_id = 'A7-32F1' and k.active
  ), 'products.sizes mirrors stock';
  assert exists (select 1 from public.inventory_movements where sku_id = 'A7-32F1/M' and reason = 'opening'),
    'opening movement for A7-32F1/M';

  -- manager: 새 상품은 hidden + 기본 행거/존
  perform pg_temp.as_user(m);
  p := public.erp_save_product('{"name":"테스트 셔츠","price":10000}');
  assert p.status = 'hidden' and p.hanger = 'HG-01' and p.zone = 'A-01', format('defaults: %s', row_to_json(p));
  assert p.id ~ '^[A-Z0-9]{2}-[A-Z0-9]{4}$', format('id format: %s', p.id);
  perform pg_temp.expect_error($q$select public.erp_save_product('{"name":"","price":1}')$q$, 'invalid_input');
  perform pg_temp.expect_error($q$select public.erp_save_product('{"name":"x","price":-1}')$q$, 'invalid_input');
  perform pg_temp.expect_error($q$select public.erp_save_product('{"id":"ZZ-NOPE","name":"x","price":1}')$q$, 'not_found');
  p := public.erp_save_product(jsonb_build_object('id', p.id, 'price', 12000));
  assert p.name = '테스트 셔츠' and p.price = 12000, 'partial update keeps other fields';

  -- 손님(anon): 숨긴 상품은 안 보이고, 판매 중인 기존 상품은 그대로
  perform pg_temp.as_anon();
  assert not exists (select 1 from public.products where id = p.id), 'hidden product invisible to anon';
  select count(*) into n from public.products where id in ('A7-32F1', 'B2-19C7', 'C4-77A0');
  assert n = 3, format('live products visible to anon, got %s', n);

  -- SKU·입고·원가
  perform pg_temp.as_user(m);
  perform public.erp_save_sku(p.id, 'M', 7000);
  st := public.erp_receive_stock(p.id || '/M', 5);
  assert st.on_hand = 5, 'receive 5';
  assert (select sizes ->> 'M' from public.products where id = p.id) = '5', 'sizes synced after receive';
  assert (select cost from public.sku_costs where sku_id = p.id || '/M') = 7000, 'cost saved, manager reads it';

  -- staff: 입고는 되지만 조정·원가는 안 됨
  perform pg_temp.as_user(s);
  perform pg_temp.expect_error(format('select public.erp_adjust_stock(%L, 1)', p.id || '/M'), 'forbidden');
  select count(*) into n from public.sku_costs;
  assert n = 0, format('staff must not read sku_costs, got %s', n);
  select count(*) into n from public.stock where sku_id = p.id || '/M';
  assert n = 1, 'staff reads stock';
  perform pg_temp.expect_error(format('select public.erp_receive_stock(%L, 0)', p.id || '/M'), 'invalid_input');
  perform pg_temp.expect_error($q$select public.erp_receive_stock('nope/M', 1)$q$, 'not_found');
  st := public.erp_receive_stock(p.id || '/M', 1);
  assert st.on_hand = 6, 'staff receive';

  -- manager: 실사 조정
  perform pg_temp.as_user(m);
  st := public.erp_adjust_stock(p.id || '/M', 2, 'loss', '분실');
  assert st.on_hand = 2, 'adjust to counted';
  assert exists (
    select 1 from public.inventory_movements
    where sku_id = p.id || '/M' and delta = -4 and reason = 'loss' and actor = m
  ), 'loss movement with actor';
  st := public.erp_adjust_stock(p.id || '/M', 2);
  select count(*) into n from public.inventory_movements where sku_id = p.id || '/M';
  assert n = 3, format('no movement when count unchanged, got %s', n);
  perform pg_temp.expect_error(format('select public.erp_adjust_stock(%L, -1)', p.id || '/M'), 'invalid_input');
  perform pg_temp.expect_error(format('select public.erp_adjust_stock(%L, 1, %L)', p.id || '/M', 'sale'), 'invalid_input');

  -- 음수 재고는 손님에게 0으로 보인다
  perform pg_temp.as_admin();
  insert into public.inventory_movements (sku_id, delta, reason) values (p.id || '/M', -5, 'adjust');
  assert (select on_hand from public.stock where sku_id = p.id || '/M') = -3, 'stock can go negative';
  assert (select sizes ->> 'M' from public.products where id = p.id) = '0', 'negative stock shows 0';

  -- SKU 추가·비활성화가 sizes에 반영
  perform pg_temp.as_user(m);
  perform public.erp_save_sku(p.id, 'L');
  assert (select sizes ? 'L' from public.products where id = p.id), 'new sku appears in sizes';
  perform public.erp_save_sku(p.id, 'L', null, null, null, null, false);
  assert not (select sizes ? 'L' from public.products where id = p.id), 'inactive sku removed from sizes';

  -- 태그 연결: major/minor 자동 배정, 중복 차단, 해제
  p := public.erp_link_tag(p.id, '78:9f:38:00:00:01');
  select max(minor) into v_max from public.products where major = 1 and id <> p.id;
  assert p.mac = '789F38000001' and p.major = 1 and p.minor = v_max + 1, format('auto tag %s/%s', p.major, p.minor);
  perform pg_temp.expect_error(format('select public.erp_link_tag(%L, %L)', p.id, '789F380FF5AF'), 'tag_in_use');
  perform pg_temp.expect_error(format('select public.erp_link_tag(%L, %L)', p.id, 'zz'), 'invalid_input');
  perform pg_temp.expect_error(format('select public.erp_link_tag(%L, %L, 1, 101)', p.id, '789F38000002'), 'tag_in_use');
  p := public.erp_link_tag(p.id, null);
  assert p.mac is null, 'unlink';

  -- MAC이 있으면 major/minor 필수
  perform pg_temp.as_admin();
  perform pg_temp.expect_error(
    format('update public.products set mac = %L, major = null where id = %L', 'AAAAAAAAAAAA', p.id),
    'products_tag_complete'
  );

  -- 작업 기록: 상품 생성은 남고, sizes 동기화만 바뀐 경우는 안 남는다. 내부 오류 없음
  assert exists (
    select 1 from public.audit_log
    where entity = 'products' and entity_id = p.id and action = 'insert' and actor = m
  ), 'audit product insert';
  assert not exists (
    select 1 from public.audit_log
    where entity = 'products' and action = 'update' and at >= now()
      and (after - 'sizes' - 'updated_at') = (before - 'sizes' - 'updated_at')
  ), 'sizes-only updates are not audited';
  assert not exists (select 1 from public.audit_log where action = 'error' and at >= now()), 'no internal error rows';
end $$;
