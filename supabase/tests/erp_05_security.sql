-- Task 5: 보안 점검 — 로그인 안 한 손님(anon)과 직원이 아닌 계정이 ERP 데이터·함수에 닿지 못하는지
do $$
declare
  x uuid;
  t text;
  c text;
  n int;
  tables text[] := array[
    'staff_members', 'audit_log', 'skus', 'sku_costs', 'stock', 'inventory_movements',
    'tag_minutes', 'gateway_minutes', 'customer_events', 'order_notes', 'erp_stock_view'
  ];
  calls text[] := array[
    'select * from public.erp_staff_list()',
    $q$select public.erp_add_staff('a@b.c', 'staff')$q$,
    format('select public.erp_update_staff(%L)', gen_random_uuid()),
    $q$select public.erp_save_product('{"name":"x","price":1}')$q$,
    $q$select public.erp_save_sku('A7-32F1', 'M')$q$,
    $q$select public.erp_link_tag('A7-32F1', null)$q$,
    $q$select public.erp_receive_stock('A7-32F1/M', 1)$q$,
    $q$select public.erp_adjust_stock('A7-32F1/M', 1)$q$,
    format('select public.erp_order_action(%L, %L)', gen_random_uuid(), 'ready'),
    'select public.erp_update_settings(-70)',
    'select public.erp_dashboard()',
    'select * from public.erp_sales_daily(current_date, current_date)',
    'select * from public.erp_sales_by_product(current_date, current_date)',
    'select * from public.erp_product_funnel(current_date, current_date)',
    'select * from public.erp_tag_activity(current_date, current_date)'
  ];
begin
  perform pg_temp.as_admin();
  x := pg_temp.mk_user('erp-t-x@test.dev');

  -- 손님(anon): 새 테이블은 읽기·쓰기 모두 권한 없음, erp_* 함수 실행 불가
  perform pg_temp.as_anon();
  foreach t in array tables loop
    perform pg_temp.expect_error(format('select count(*) from public.%I', t), 'permission denied');
    if t <> 'erp_stock_view' then -- 조인 뷰는 원래 수정 불가
      perform pg_temp.expect_error(format('delete from public.%I', t), 'permission denied');
    end if;
  end loop;
  foreach c in array calls loop
    perform pg_temp.expect_error(c, 'permission denied');
  end loop;
  perform pg_temp.expect_error('select public.erp_me()', 'permission denied');
  perform pg_temp.expect_error($q$select erp_internal.require_role('staff')$q$, 'permission denied');
  perform pg_temp.expect_error($q$select erp_internal.refresh_sizes('A7-32F1')$q$, 'permission denied');
  assert not erp_internal.erp_has_role('staff'), 'anon is not staff';
  -- 손님 기능은 그대로
  perform public.track_event('dev-test-0001', 'view_home');
  select count(*) into n from public.products where id in ('A7-32F1', 'B2-19C7', 'C4-77A0');
  assert n = 3, format('anon sees live products, got %s', n);
  perform public.place_order('dev-test-0003', 'A7-32F1', 'M', 'fitting');

  -- 가입만 한 계정: 읽기는 0행, 쓰기 불가, 함수는 not_staff
  perform pg_temp.as_user(x);
  foreach t in array tables loop
    execute format('select count(*) from public.%I', t) into n;
    assert n = 0, format('%s visible to non-staff: %s rows', t, n);
    if t <> 'erp_stock_view' then
      perform pg_temp.expect_error(format('delete from public.%I', t), 'permission denied');
    end if;
  end loop;
  foreach c in array calls loop
    perform pg_temp.expect_error(c, 'not_staff');
  end loop;
  assert public.erp_me() is null, 'non-staff erp_me is null';

  -- 카탈로그 점검
  perform pg_temp.as_admin();
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname like 'erp\_%' and has_function_privilege('anon', p.oid, 'execute');
  assert n = 0, format('%s erp_* functions executable by anon', n);
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'erp_internal' and p.proname <> 'erp_has_role'
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  assert n = 0, format('%s erp_internal functions callable by clients', n);
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where (ns.nspname = 'erp_internal' or (ns.nspname = 'public' and (p.proname like 'erp\_%' or p.proname = 'track_event')))
    and not exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%');
  assert n = 0, format('%s ERP functions without fixed search_path', n);
  select count(*) into n
  from pg_class cl join pg_namespace ns on ns.oid = cl.relnamespace
  where ns.nspname = 'public' and cl.relkind = 'r' and not cl.relrowsecurity;
  assert n = 0, format('%s public tables without RLS', n);
  select count(*) into n
  from pg_class cl join pg_namespace ns on ns.oid = cl.relnamespace
  where ns.nspname = 'public' and cl.relkind = 'v'
    and not coalesce(cl.reloptions @> array['security_invoker=true'], false);
  assert n = 0, format('%s views without security_invoker', n);
end $$;
