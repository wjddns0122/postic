# POSTIC ERP API

ERP 화면(직원용)을 만들 때 쓰는 백엔드 목록이다. 서버는 이미 실DB(`postic-prototype`)에 올라가 있다.

- 설계 배경: [superpowers/specs/2026-11-16-erp-backend-design.md](superpowers/specs/2026-11-16-erp-backend-design.md)
- 타입: [`src/types/database.ts`](../src/types/database.ts). Supabase가 생성한 파일이다. 스키마가 바뀌면 `supabase gen types typescript --linked > src/types/database.ts`로 다시 만든다.
- 테스트: `scripts/sqltest.sh supabase/tests/erp_0N_*.sql`. 실DB에서 돌리고 항상 롤백한다.

## 1. 로그인

직원은 Supabase Auth 이메일+비밀번호로 로그인한다. 로그인만으로는 권한이 없다. `staff_members`에 활성 행이 있어야 직원이다.

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types/database'

const supabase = createClient<Database>(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

await supabase.auth.signInWithPassword({ email, password })
const { data: me } = await supabase.rpc('erp_me') // { user_id, email, display_name, role } | null
if (!me) {
  // 직원이 아님 → "권한 없음" 화면
}
```

### 계정 만들기와 첫 owner

1. owner가 Supabase 대시보드 → Authentication → **Add user**에서 계정을 만든다. "Auto Confirm User"를 켜고, 비밀번호는 본인이 정한다.
   - 기본 메일 발송은 팀원 주소로만 가서, 직원이 스스로 가입하면 확인 메일이 안 갈 수 있다.
2. 첫 owner는 SQL로 한 번만 지정한다 (Supabase SQL Editor):
   ```sql
   insert into public.staff_members (user_id, display_name, role)
   select id, '<이름>', 'owner' from auth.users where email = '<이메일>';
   ```
3. 그다음 직원은 owner가 `erp_add_staff`로 등록한다.

## 2. 역할

| 할 수 있는 일 | staff | manager | owner |
|---|---|---|---|
| 상품·재고·주문·태그 보기 | O | O | O |
| 주문 진행(준비 완료·수령 완료), 입고 | O | O | O |
| 주문 취소·환불, 재고 조정, 상품·SKU 등록/수정, 태그 연결, 설정 | | O | O |
| 매출·분석·원가·작업 기록 보기 | | O | O |
| 직원 추가·역할 변경·비활성화 | | | O |

권한이 모자라면 서버가 `forbidden`, 직원이 아니면 `not_staff`를 돌려준다. 화면에서 버튼을 숨기더라도, 실제 판단은 서버가 한다.

## 3. 읽기 (supabase-js `select`)

직원으로 로그인한 상태에서 읽는다. 권한이 없는 행은 오류 없이 0행으로 나온다.

| 테이블·뷰 | 누가 | 주요 컬럼 |
|---|---|---|
| `products` | 누구나(active만) / 직원(전부) | id, name, brand, price, color, material, category, status(active·hidden·archived), image_url, back_image_url, hanger, zone, mac, major, minor, sizes, sort, updated_at |
| `erp_stock_view` | staff | sku_id, product_id, product_name, size, on_hand, reorder_point, low, active, sort |
| `skus` | staff | id(`상품ID/사이즈`), product_id, size, barcode, reorder_point, sort, active |
| `stock` | staff | sku_id, on_hand, updated_at |
| `inventory_movements` | staff | sku_id, delta, reason(opening·receive·sale·return·adjust·loss), order_id, note, actor, created_at |
| `orders` | 누구나 | id, product_id, size, sku_id, type(purchase·fitting), status(preparing·ready·done), outcome(completed·cancelled·refunded), pickup_code, amount, pay_method, device_id, handled_by, closed_at, created_at |
| `order_notes` | staff | order_id, action(cancel·refund·…), note, actor, created_at — 취소·환불 사유 (orders는 손님에게 공개되므로 사유는 여기에만) |
| `staff_members` | staff | user_id, display_name, role, active |
| `settings` | 누구나 | rssi_threshold, online_seconds, block_oversell |
| `tag_presence` | 누구나 | key, rssi, last_seen, gateway, simulated |
| `sku_costs` | manager | sku_id, cost |
| `audit_log` | manager | at, actor, actor_kind(staff·pin·system), action(insert·update·delete·error), entity, entity_id, before, after |
| `tag_minutes` · `gateway_minutes` | manager | 분 단위 원자료. 보통은 `erp_tag_activity`로 본다 |
| `customer_events` | manager | device_id, type, product_id, created_at |

예시:

```ts
const { data: stock } = await supabase.from('erp_stock_view').select('*').eq('active', true).order('product_id').order('sort')
const { data: lowStock } = await supabase.from('erp_stock_view').select('*').eq('low', true)
const { data: history } = await supabase.from('inventory_movements').select('*').eq('sku_id', 'A7-32F1/M').order('created_at', { ascending: false })
```

## 4. 쓰기·집계 (서버 함수 `supabase.rpc`)

테이블에 직접 insert/update는 막혀 있다. 모든 변경은 아래 함수로 한다.

### 직원

| 함수 | 역할 | 입력 → 결과 |
|---|---|---|
| `erp_me()` | 로그인 | → `{ user_id, email, display_name, role }` 또는 null |
| `erp_staff_list()` | manager | → `[{ user_id, email, display_name, role, active, created_at }]` |
| `erp_add_staff(p_email, p_role, p_name?)` | owner | 이미 만든 계정을 직원으로 등록. 다시 부르면 역할 변경 + 재활성화 → staff_members 행 |
| `erp_update_staff(p_user, p_role?, p_active?, p_name?)` | owner | 역할·활성·이름 변경. 마지막 owner는 못 내림(`last_owner`) |

```ts
await supabase.rpc('erp_add_staff', { p_email: 'friend@example.com', p_role: 'manager', p_name: '친구' })
```

### 상품·SKU·태그

| 함수 | 역할 | 설명 |
|---|---|---|
| `erp_save_product(p)` | manager | `p`는 JSON. `id`가 없으면 새로 만든다(ID 자동, 기본 status `hidden`, 행거 `HG-01`). `id`가 있으면 보낸 키만 수정한다. 키: name, brand, price, color, material, category, image_url, back_image_url, hanger, zone, sort, status, emoji |
| `erp_save_sku(p_product, p_size, p_cost?, p_barcode?, p_reorder_point?, p_sort?, p_active?)` | manager | SKU 생성·수정. null인 인자는 그대로 둔다. 새 SKU는 재고 0 |
| `erp_link_tag(p_product, p_mac, p_major?, p_minor?)` | manager | 비콘 연결. MAC은 `78:9F:38:0F:F5:AF`·`789F380FF5AF` 둘 다 된다. major/minor를 안 주면 자동이다(major = 행거 번호). `p_mac: null`이면 해제 |

```ts
const { data: p } = await supabase.rpc('erp_save_product', { p: { name: '울 코트', price: 199000, color: '카멜' } })
await supabase.rpc('erp_save_sku', { p_product: p!.id, p_size: 'M', p_cost: 80000 })
await supabase.rpc('erp_link_tag', { p_product: p!.id, p_mac: '78:9F:38:0F:F5:D1' })
await supabase.rpc('erp_save_product', { p: { id: p!.id, status: 'active' } }) // 준비 끝나면 손님에게 공개
```

### 재고

| 함수 | 역할 | 설명 |
|---|---|---|
| `erp_receive_stock(p_sku, p_qty, p_note?)` | staff | 입고 (1~10000) → stock 행 |
| `erp_adjust_stock(p_sku, p_counted, p_reason?, p_note?)` | manager | 실사한 수량으로 맞춘다. reason은 `adjust`(기본) 또는 `loss`. 차이가 없으면 이력이 안 생긴다 |

재고 숫자는 이력(`inventory_movements`)의 합이다. 구매 주문은 자동으로 `sale -1`, 취소·환불은 자동으로 `return +1`이다. 손님 화면의 사이즈별 숫자(`products.sizes`)도 자동으로 맞춰진다. 음수는 0으로 보인다.

### 주문

`erp_order_action(p_order, p_action, p_note?)` → 바뀐 주문 행

| action | 역할 | 언제 | 결과 |
|---|---|---|---|
| `ready` | staff | preparing | ready (픽업 대기 / 피팅룸 준비 완료) |
| `complete` | staff | preparing·ready | done + outcome `completed` |
| `cancel` | manager | 아직 done이 아님 | done + `cancelled` + 재고 복귀 |
| `refund` | manager | 수령 완료된 구매 | outcome `refunded` + 재고 복귀 |

`p_note`(사유)를 주면 직원만 읽는 `order_notes`에 저장된다. 손님 화면으로는 가지 않는다.

```ts
await supabase.rpc('erp_order_action', { p_order: order.id, p_action: 'cancel', p_note: '고객 변심' })
```

새 주문을 실시간으로 받으려면 지금 `/admin`처럼 Broadcast 채널 `staff:orders`(event `order`)를 구독하고, 몇 초마다 다시 조회한다.

### 설정

`erp_update_settings(p_rssi?, p_online?, p_block_oversell?)` (manager) → settings 행

- `p_rssi`: 인식 신호 기준, -100 ~ -30
- `p_online`: 온라인 유지 시간, 2 ~ 60초
- `p_block_oversell`: true면 재고 0인 SKU의 구매 주문을 막는다 (`out_of_stock`). 지금 손님 화면이 이 오류를 몰라서 기본은 false다.

### 집계·분석

날짜는 `'2026-11-16'` 형식이고 한국 시간 기준이다. 범위는 최대 366일이다.

| 함수 | 역할 | 결과 |
|---|---|---|
| `erp_dashboard()` | staff | `{ orders_today, pending, low_stock, tags_online, revenue_today, net_today }`. 매출 두 칸은 staff에게 null |
| `erp_sales_daily(p_from, p_to)` | manager | 날짜마다 한 행(빈 날 포함): day, orders, units, revenue, refunds, net |
| `erp_sales_by_product(p_from, p_to)` | manager | product_id, name, units, revenue, refunds, net |
| `erp_product_funnel(p_from, p_to)` | manager | product_id, name, views, fitting_requests, purchases, view_to_purchase(%), fitting_to_purchase(%) |
| `erp_tag_activity(p_from, p_to, p_rssi_threshold?)` | manager | product_id, name, gateway_minutes, seen_minutes, away_minutes, away_count, avg_rssi, last_seen |

계산 기준:
- 매출은 주문이 생긴 날에 잡는다. 취소는 빼고, 환불은 환불한 날 뺀다.
- `erp_tag_activity`의 자리 비움은 이렇게 센다:
  - 게이트(G1)가 살아 있던 분 중에, 그 옷 태그가 안 잡혔거나 평균 신호가 기준보다 약했던 분을 "자리 비움"으로 본다.
  - 연속된 자리 비움은 1회로 센다.
  - 신호 기준을 바꿔가며 다시 볼 수 있다.

```ts
const { data: daily } = await supabase.rpc('erp_sales_daily', { p_from: '2026-11-10', p_to: '2026-11-16' })
const { data: away } = await supabase.rpc('erp_tag_activity', { p_from: '2026-11-16', p_to: '2026-11-16', p_rssi_threshold: -70 })
```

### 손님 앱 (anon)

`track_event(p_device, p_type, p_product?)`: 손님 행동을 기록한다. 로그인이 필요 없다.
- type: `view_home`, `view_hanger`, `view_product`
- 기기당 1분 60건까지

```ts
await supabase.rpc('track_event', { p_device: deviceId(), p_type: 'view_product', p_product: p.id })
```

## 5. 오류 코드

`error.message`가 아래 문자열 중 하나다.

| 코드 | 뜻 |
|---|---|
| `not_staff` | 로그인은 했지만 직원이 아님 (또는 비활성) |
| `forbidden` | 역할 등급 부족 |
| `not_found` | 대상 없음 (상품·SKU·주문·직원) |
| `invalid_input` | 입력값이 잘못됨 (빈 이름, 음수, 지금 상태에서 할 수 없는 주문 처리, 날짜 범위 등) |
| `user_not_found` | 그 이메일로 만든 계정이 없음 (먼저 계정 생성) |
| `last_owner` | 마지막 owner를 내리거나 끌 수 없음 |
| `tag_in_use` | 다른 상품이 쓰는 비콘 MAC 또는 major/minor |
| `out_of_stock` | 품절 차단이 켜진 상태에서 재고 0 구매 |
| `invalid_product` | 판매 중(active)이 아닌 상품 주문 |
| `rate_limited` | 너무 자주 호출 (주문: 기기당 10분 5건, track_event: 1분 60건) |

## 6. 과도기에 알아둘 것

- 기존 손님 화면은 `outcome`을 모른다. 그래서 취소된 주문도 "수령 완료"로 보인다. 새 손님 화면에서 `outcome`을 읽으면 해결된다.
- `track_event`는 아직 손님 화면에 붙어 있지 않다. 붙이기 전까지 조회 수와 퍼널은 0이다.
- 기존 `/admin`의 PIN 방식(`staff_set_order_status` 등)은 새 ERP 화면이 나올 때까지 그대로 쓴다. PIN으로 바꾼 것도 `audit_log`에 `actor_kind = 'pin'`으로 남는다.
- 여러 매장, 실결제, 손님 회원은 아직 없다.
