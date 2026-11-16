-- 2단계 (새 클라이언트 배포 후 적용): 직접 쓰기를 막고, Postgres Changes 발행을 끈다
-- 주문 생성은 place_order, 주문 상태·인식 기준 변경은 직원 PIN RPC로만 가능

drop policy if exists "insert orders" on orders;
drop policy if exists "update orders" on orders;
drop policy if exists "update settings" on settings;
revoke insert, update, delete on orders, settings from anon, authenticated;

-- 새 클라이언트는 Postgres Changes를 쓰지 않는다:
-- 태그 상태 2초·주문/설정 6초 조회, 주문 변경은 Broadcast(orders_broadcast 트리거)로 받는다
alter publication supabase_realtime drop table tag_presence, orders, settings, gateway_raw;
