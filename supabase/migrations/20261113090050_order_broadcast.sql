-- 주문 변경을 Broadcast로 보낸다 (Postgres Changes 대신)
-- 무료(Nano) DB는 Postgres Changes 구독 관리 커넥션이 2개라 접속자가 늘면 타임아웃으로 일부가 이벤트를 못 받는다.
-- Broadcast는 DB 연결 하나로 보내고, 손님은 자기 기기 채널만 받으므로 메시지 수가 접속자 수에 비례하지 않는다.
--   device:<device_id>  그 기기의 주문 변경 (손님)
--   staff:orders        모든 주문 변경 (직원 대시보드)
create or replace function public.orders_broadcast() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb := to_jsonb(new);
begin
  if new.device_id is not null then
    perform realtime.send(v, 'order', 'device:' || new.device_id, false);
  end if;
  perform realtime.send(v, 'order', 'staff:orders', false);
  return null;
end;
$$;

drop trigger if exists orders_broadcast on public.orders;
create trigger orders_broadcast
after insert or update on public.orders
for each row execute function public.orders_broadcast();
