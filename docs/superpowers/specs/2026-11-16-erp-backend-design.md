# POSTIC ERP 백엔드 설계

- 2026-11-16 · 상태: 승인 → 실DB 적용 완료 (사용법: [docs/erp-api.md](../../erp-api.md))
- 범위: 직원 계정·권한, 상품·재고, 주문·매출, 매장 데이터 분석 (1차)
- 화면 디자인·프론트는 팀원(친구) 담당. 이 문서는 그 아래의 데이터·권한·서버 함수만 다룬다.

## 1. 왜

지금 `/admin`은 시연용 직원 화면이다.
- 공용 PIN 하나라서 누가 뭘 했는지 안 남는다.
- 재고는 `products.sizes`에 숫자만 있어서, 팔려도 줄지 않고 입고 기록도 없다.
- 매장 데이터(관심·피팅·구매)는 화면에 보여주기만 하고 쌓이지 않는다.

이 화면을 매장 운영용 ERP로 키운다. POSTIC의 핵심 주장인 "POS가 못 남기는 데이터"를 실제로 쌓고 보여줄 수 있어야 한다.

## 2. 목표 · 하지 않는 것 · 실패 조건

**목표**
1. 직원마다 개인 계정(이메일 로그인)과 역할(owner / manager / staff). 모든 변경에 누가 했는지 기록.
2. 상품을 사이즈별 재고 단위(SKU)로 관리. 입고·판매·반품·조정이 이력으로 남고, 재고 수량은 이력에서 계산된다.
3. 구매 주문이 들어오면 재고가 자동으로 빠진다. 취소·환불하면 돌아온다. 일별·상품별 매출 집계.
4. 상품별 관심 데이터: 상품 조회 수(손님 앱), 피팅 요청, 구매, 그리고 태그 기준 "행거에 있던 시간 / 자리를 비운 횟수".
5. 친구가 이 문서와 `docs/erp-api.md`, 생성된 타입만 보고 화면을 만들 수 있다.

**하지 않는 것 (1차)**
- 여러 매장, 실제 결제(PG), 손님 회원, 외부 POS·ERP 연동, 이메일·알림
- 새 화면 구현 (친구 담당)
- 기존 PIN 방식 폐기 (새 ERP 화면이 나온 뒤에)

**실패로 치는 것 (기능이 돼도 실패)**
- 적용하는 순간 지금 사이트(손님 화면, `/admin`, G1 수신)가 하나라도 깨진다.
- 원가·직원 정보·이력이 로그인 안 한 사람(anon)에게 보인다.
- 금액이나 재고를 클라이언트가 보낸 값으로 믿는다.

## 3. 제약

- 실서비스 DB `postic-prototype`(Supabase 무료, Nano)에 바로 적용한다 (사용자 결정). 개발용 프로젝트는 없다.
- 지금 배포된 웹은 그대로 둔다 (Vercel 재배포 없음). 그래서 모든 변경은 **기존 테이블·컬럼·함수의 동작을 바꾸지 않는 추가**여야 한다.
- 지금 웹이 아는 주문 상태는 `preparing / ready / done` 세 개뿐이다. 다른 값을 넣으면 손님 화면 라벨과 진행 표시가 깨진다.
- G1 수신 함수 `g1-ingest`는 1초마다 `tag_presence`와 `gateway_raw`를 갱신한다. 여기에 붙는 트리거가 실패하면 수신 전체가 멈춘다. `g1-ingest` 자체는 고치지 않는다.
- PostgREST는 `public` 스키마만 노출한다.

## 4. 만드는 방식 (Approaches)

| 방식 | 내용 | 장단점 |
|---|---|---|
| **A. public 스키마에 추가 + RLS + 서버 함수 (선택)** | 새 테이블은 `public`에 만들고 RLS로 직원만 읽게 한다. 쓰기는 모두 `erp_*` 함수(security definer)로만 한다. | 지금 구조와 같은 패턴. supabase-js로 바로 호출. 설정 변경 없음. 이름이 섞이니 `erp_` 접두사로 구분한다. |
| B. 별도 `erp` 스키마를 API에 노출 | 이름공간이 깔끔하다. | 프로젝트 API 설정을 바꿔야 하고, 모든 호출에 `.schema('erp')`가 필요하다. 2인 팀에 이득이 적다. |
| C. 별도 API 서버 (Node 등) | 로직을 마음대로 짠다. | 배포할 서버가 하나 더 생기고 인증을 다시 엮어야 한다. |
| D. 스키마를 새로 짜고 웹도 같이 바꿈 | 가장 깔끔하다. | 지금 사이트가 깨진다. 실패 조건에 걸린다. |

사용자가 방법을 맡겼으므로 A로 간다.

## 5. 설계

### 5-1. 직원 계정·권한

- 로그인: Supabase Auth 이메일+비밀번호. 계정은 본인이 가입하거나 대시보드에서 만든다. 비밀번호는 각자 입력한다.
- `staff_members`
  - 컬럼: `user_id`(PK, auth.users), `display_name`, `role`(owner|manager|staff), `active`, `created_at`
  - `staff_members`에 행이 있고 `active`인 계정만 직원이다. 가입만 한 계정은 아무 권한도 없다.
- 권한 확인 함수: `erp_internal.erp_role()`이 내 역할을 돌려주고, `erp_internal.erp_has_role(min)`이 등급을 비교한다 (owner 3 > manager 2 > staff 1). RLS 정책과 `erp_*` 함수가 모두 이걸 쓴다.
  - `erp_internal`은 API에 노출되지 않는 새 스키마다. RLS 정책이 이 함수를 부르려면 anon에게도 스키마 사용 권한이 필요하다. 그래서 PIN 해시가 있는 기존 `private` 스키마와 분리했다.
- 계정 만들기
  - Supabase 기본 메일 발송은 프로젝트 팀원 주소로만 간다. 그래서 직원이 스스로 가입하면 확인 메일이 안 갈 수 있다.
  - 1차에서는 owner가 Supabase 대시보드(Authentication → Add user, 자동 확인)에서 계정을 만들고, 비밀번호는 본인이 정한다. 그 다음 `erp_add_staff`로 직원 등록.
  - 초대 메일 함수는 나중에 만든다.
- 공개 가입 문제: 가입이 열려 있으면 아무나 계정은 만들 수 있다. 그래도 `staff_members`에 없으면 아무 권한이 없다. 대시보드에서 공개 가입을 끄는 걸 권장한다 (프로젝트 설정이라 사용자가 결정).
- 첫 owner는 SQL로 지정한다: 사용자가 계정을 만든 뒤 그 계정을 owner로 넣는다. 이메일 같은 개인정보는 레포에 넣지 않는다.

| 할 수 있는 일 | staff | manager | owner |
|---|---|---|---|
| 상품·재고·주문·태그 보기 | O | O | O |
| 주문 상태 진행(준비 완료·수령 완료), 입고 등록 | O | O | O |
| 주문 취소·환불, 재고 조정, 상품·SKU 등록/수정, 태그 연결, 인식 설정 | | O | O |
| 매출·분석·원가·작업 기록 보기 | | O | O |
| 직원 추가·역할 변경·비활성화 | | | O |

- 기존 PIN 함수(`staff_check`, `staff_set_order_status`, `staff_update_settings`)는 그대로 둔다. 지금 `/admin`이 계속 동작해야 하기 때문이다. 이 함수로 바뀐 것도 작업 기록에 `actor_kind = 'pin'`으로 남긴다.

### 5-2. 작업 기록 `audit_log`

- 컬럼: `id`, `at`, `actor`(uuid, null 가능), `actor_kind`(staff|pin|system), `action`, `entity`, `entity_id`, `before`, `after`(jsonb)
- 기록 방식: `products`, `skus`, `staff_members`, `settings` 변경과 `orders`의 상태 변경을 트리거로 기록한다.
- 손님 주문 생성은 기록하지 않는다. `orders` 자체가 기록이고, 넣으면 로그가 넘친다.
- 보기: manager 이상.

### 5-3. 상품·재고

- `products`(기존)에 추가하는 컬럼
  - `status`: active|hidden|archived, 기본 active
  - `category`: 분류 (null 가능)
  - `updated_at`
- `products.major/minor`의 NOT NULL을 푼다. 태그가 없는 상품도 등록할 수 있어야 하기 때문이다. 기존 행은 영향 없다.
- 태그 연결 규칙
  - `erp_link_tag`는 MAC을 받는다. major/minor를 안 주면 서버가 정한다: major = 행거 번호(`HG-01` → 1), minor = 그 major에서 비어 있는 다음 번호.
  - `g1-ingest`는 MAC으로 찾은 상품의 major/minor로 태그 키를 만든다. 그래서 MAC이 있는 상품은 major/minor가 반드시 있어야 하고, 이걸 제약으로 건다: `mac is null or (major is not null and minor is not null)`. 태그 키가 `0-0`으로 겹치는 일을 막는다.
- `hanger`/`zone`은 NOT NULL 그대로 두고, `erp_save_product`에서 안 주면 `HG-01`/`A-01`로 넣는다.
- 손님에게 보이는 상품을 바꾼다: `products` 읽기 정책을 `status = 'active' 또는 직원`으로 바꾼다. 지금 상품 3개는 모두 active라 손님 화면은 그대로다. ERP에서 새로 만든 상품은 기본 `hidden`이라, 준비가 끝나기 전에는 손님에게 안 보인다.
- `skus`
  - 컬럼: `id`(text, `<상품ID>/<사이즈>`), `product_id`, `size`, `barcode`(unique, null 가능), `reorder_point`(기본 1), `sort`, `active`
  - unique(product_id, size). 읽기는 staff 이상.
- `sku_costs`
  - 컬럼: `sku_id`(PK), `cost`(원가), `updated_at`
  - 원가를 따로 둬서 manager 이상만 읽게 한다. staff는 재고는 보되 원가는 못 본다.
- `inventory_movements`
  - 컬럼: `id`, `sku_id`, `delta`(0이 아닌 정수), `reason`(opening|receive|sale|return|adjust|loss), `order_id`, `note`, `actor`, `created_at`
  - 수정·삭제하지 않고 쌓기만 한다.
- `stock`
  - 컬럼: `sku_id`(PK), `on_hand`, `updated_at`
  - 이력이 들어올 때 트리거로 더한다. 읽기를 빠르게 하려는 캐시다. 진실은 이력이다.
- `products.sizes` 동기화: `stock`이 바뀌면 트리거가 그 상품의 `sizes`를 `{사이즈: max(on_hand, 0)}`로 다시 쓴다. 지금 손님 화면과 `place_order`는 계속 `sizes`를 보므로 실재고가 그대로 보인다.
- 처음 적용할 때: 지금 `products.sizes`의 사이즈마다 SKU를 만들고, 그 수량으로 `opening` 이력을 넣는다. 적용 직후 화면 숫자는 지금과 같다.

### 5-4. 주문·매출

- `orders`(기존)에 추가하는 컬럼
  - `sku_id`: 주문이 들어올 때 트리거가 상품+사이즈로 채운다
  - `outcome`: completed|cancelled|refunded, null 가능
  - `closed_at`, `handled_by`(uuid), `updated_at`
- 상태값은 그대로 `preparing / ready / done`만 쓴다.
  - 취소·환불은 `status = 'done'` + `outcome = 'cancelled' | 'refunded'`로 표현한다.
  - 지금 손님 화면은 취소된 주문을 "완료"로 보여준다. 새 손님 화면이 `outcome`을 읽기 전까지의 과도기 한계다.
- 재고 연동은 트리거로 한다.
  - 구매 주문이 생기면 해당 SKU에 `sale -1`.
  - 취소·환불하면 `return +1`. 한 주문에 한 번만.
  - 피팅은 재고를 안 건드린다.
- 품절 차단: `settings.block_oversell`(기본 false).
  - 켜면 재고 0인 SKU의 구매 주문을 `out_of_stock`으로 막는다.
  - 기본을 끄는 이유: 지금 손님 화면이 이 오류를 모르고, 사이트 동작을 그대로 두기로 했다. 꺼져 있으면 재고가 음수가 될 수 있고, ERP가 "재고 부족"으로 표시한다.
- 판매 중이 아닌 상품: `hidden`/`archived` 상품의 주문은 트리거가 `invalid_product`로 막는다.
  - `place_order`가 이미 쓰는 오류라서 지금 손님 화면도 일반 실패 문구로 처리한다.
  - 새 정책으로 손님에게 안 보이는 상품이라, 막히는 건 캐시된 화면이나 직접 만든 호출뿐이다.
- 핫패스 안전
  - 주문·태그 트리거의 부가 작업(재고 차감, 분 단위 기록, 작업 기록)은 예외를 잡아 `audit_log`에 `action = 'error'`로 남기고, 주문이나 수신은 성공시킨다.
  - 일부러 막는 건 두 가지뿐이다: `block_oversell`이 켜졌을 때의 `out_of_stock`, 판매 중이 아닌 상품의 `invalid_product`.
- 매출 집계: 날짜는 Asia/Seoul 기준이고 구매(`type = 'purchase'`)만 센다.
  - 매출: 주문이 생긴 날(`created_at`)에 잡는다. 목 결제 흐름에서는 결제 승인 뒤에 주문이 생기기 때문이다.
  - 취소(건네기 전 취소): 그 주문을 매출에서 아예 뺀다.
  - 환불(건넨 뒤 환불): 원래 날 매출은 두고, 환불한 날(`closed_at`)에 환불액으로 뺀다. 순매출 = 매출 − 환불.

### 5-5. 매장 데이터 분석

태그가 실제로 재는 건 "옷이 게이트 범위 안에 있었는지, 신호가 얼마나 셌는지"다. 손님의 관심을 직접 재는 게 아니다. 그래서 두 가지를 따로 쌓고, 보고서에서 같이 보여준다.

- **분 단위 원자료** (세션을 저장하지 않고, 다시 계산할 수 있는 원자료를 남긴다)
  - `tag_minutes`
    - 컬럼: `tag_key`, `minute`(분 단위로 자른 시각), `product_id`, `gateway`, `samples`, `rssi_sum`, `rssi_max`, `rssi_min`
    - PK: (tag_key, minute)
    - `tag_presence`가 갱신될 때마다 트리거가 그 분의 행에 더한다. 시뮬레이터 데이터(`simulated`)는 넣지 않는다.
  - `gateway_minutes`
    - 컬럼: `gateway`, `minute`, `posts`
    - G1이 보낼 때마다 `log_raw`가 `gateway_raw`를 갱신하는데, 거기에 트리거를 붙여 센다. 게이트가 꺼져 있던 시간(영업 외, 장애)을 "옷이 자리를 비운 시간"과 구분하는 데 쓴다.
  - 양: 태그 3개 기준 하루 약 4,300행. 무료 DB 용량에 문제없다. 1초 원자료(하루 26만 행)는 남기지 않는다.
- **자리 비움 계산** (보고서 함수에서 매번 계산하므로 기준을 바꿔 다시 볼 수 있다)
  - 게이트가 살아 있던 분 중에, 그 태그가 안 잡혔거나 평균 신호가 `rssi_threshold`보다 약했던 분을 "자리 비움"으로 본다. 집어 들고 거울·피팅룸에 갔거나 다른 데로 옮겨진 시간이다.
  - 게이트 하나가 매장 전체를 들으면 피팅룸에 있어도 잡힌다. 그래서 신호 세기 기준이 핵심이고, 보고서 함수에 `p_rssi_threshold`를 따로 줄 수 있게 한다 (안 주면 `settings` 값).
  - 연속된 자리 비움 분은 한 번으로 센다 ("자리 비움 횟수").
- **손님 행동** `customer_events`
  - 컬럼: `id`, `device_id`, `type`(view_home|view_hanger|view_product), `product_id`, `created_at`
  - 넣는 방법: 손님 앱이 `track_event(...)` 함수로 넣는다 (anon 허용, 기기당 1분 60건 제한).
  - 지금 배포된 손님 화면은 아직 이 함수를 부르지 않는다. 새 손님 화면에서 한 줄씩 붙이면 쌓이기 시작한다.
- 보고서 함수 (manager 이상)
  - `erp_product_funnel(from, to)`: 상품별 조회, 피팅 요청, 구매, 조회→구매 %, 피팅→구매 %
  - `erp_tag_activity(from, to, rssi_threshold?)`: 상품별 게이트 가동 분, 감지된 분, 자리 비움 분·횟수, 평균 신호, 마지막 감지
  - 퍼널 비율은 1차에서 단순 건수 비율로 한다. 같은 기기의 조회 → 구매를 잇는 기기별 전환은 나중에 한다 (데이터는 `device_id`로 이미 이어짐).

### 5-6. 서버 함수 목록 (친구가 쓸 API)

**읽기**: 아래 테이블과 뷰는 직원 로그인 상태에서 supabase-js `select`로 읽는다 (RLS).
- 테이블: `staff_members`, `skus`, `stock`, `inventory_movements` (staff 이상) · `sku_costs`, `audit_log`, `customer_events`, `tag_minutes`, `gateway_minutes` (manager 이상)
- 뷰: `erp_stock_view` (상품명·사이즈·재고·발주점·부족 여부, `security_invoker`)
- 기존 `products`, `orders`, `tag_presence`, `settings`는 지금처럼 읽는다.

**쓰기·집계**: 모두 `supabase.rpc('erp_…')`로 호출한다. 실패하면 오류 코드 문자열을 돌려준다.

| 함수 | 최소 역할 | 하는 일 |
|---|---|---|
| `erp_me()` | 로그인 | 내 계정·역할 (직원이 아니면 null) |
| `erp_staff_list()` | manager | 직원 목록 + 이메일 |
| `erp_add_staff(email, role, name)` | owner | 가입된 계정을 직원으로 등록 |
| `erp_update_staff(user_id, role?, active?, name?)` | owner | 역할·활성 변경 (마지막 owner는 못 내림) |
| `erp_save_product(product jsonb)` | manager | 상품 생성·수정 (id 없으면 새 ID 생성, 기본 hidden) |
| `erp_save_sku(product_id, size, cost?, barcode?, reorder_point?, sort?, active?)` | manager | SKU 생성·수정 |
| `erp_link_tag(product_id, mac, major?, minor?)` | manager | 비콘 연결·해제 (mac null = 해제) |
| `erp_receive_stock(sku_id, qty, note?)` | staff | 입고 |
| `erp_adjust_stock(sku_id, counted, reason, note?)` | manager | 실사 결과로 맞추기 (adjust / loss) |
| `erp_order_action(order_id, action, note?)` | staff / manager | ready·complete는 staff, cancel·refund는 manager |
| `erp_update_settings(rssi?, online?, block_oversell?)` | manager | 인식·품절 설정 |
| `erp_dashboard()` | staff | 오늘 주문 수, 처리 대기, 재고 부족, 태그 온라인 수. 매출 칸은 manager 이상에게만 값이 있다 (staff는 null) |
| `erp_sales_daily(from, to)` | manager | 일별 주문 수, 판매 수량, 매출, 환불, 순매출 |
| `erp_sales_by_product(from, to)` | manager | 상품별 수량, 매출 |
| `erp_product_funnel(from, to)` | manager | 5-5 |
| `erp_tag_activity(from, to)` | manager | 5-5 |
| `track_event(device, type, product?)` | anon | 손님 행동 기록 |

오류 코드: `not_staff`, `forbidden`, `not_found`, `invalid_input`, `user_not_found`, `last_owner`, `tag_in_use`, `out_of_stock`, `rate_limited`

### 5-7. 보안 기본값

- 새 테이블: RLS를 켠다. anon·authenticated의 insert/update/delete 권한을 회수한다. 읽기 정책은 `erp_has_role(...)`.
- 새 함수: `security definer` + `set search_path = ''`. anon의 실행 권한을 회수한다 (`track_event`만 예외).
- 뷰: `security_invoker = true`로 만든다. 뷰를 통해 RLS가 우회되지 않게.
- 기존 공개 데이터는 그대로다 (주문·상품은 누구나 읽음). 새로 추가하는 `orders.handled_by`는 직원 uuid라서 anon에게 보이게 된다. 1차에서는 허용한다.

## 6. 적용·검증

- 마이그레이션 파일 5개를 `supabase/migrations/20261116…_erp_*.sql`로 둔다 (권한, 재고, 주문, 분석, 정책).
- 순서
  1. 각 파일을 실DB에서 `begin … rollback`으로 먼저 실행해서 오류가 없는지 본다.
  2. 문제 없으면 실제로 적용한다.
- 검증
  - `supabase/tests/erp_smoke.sql`: 트랜잭션 안에서 가짜 계정 2개(owner, staff)로 역할별 허용·거부, 재고 흐름(입고 → 주문 → 취소), 집계를 확인하고 롤백한다. 테스트 주문 때문에 픽업 번호가 몇 개 건너뛸 수 있다 (시퀀스는 롤백되지 않음).
  - 적용 후 실사이트: 상품 화면 재고 숫자가 그대로인지, 주문(`place_order`)이 되는지, G1 수신·태그 감지가 정상인지를 `scripts/watch.mjs`와 SQL로 확인한다.
- 친구용 산출물
  - `docs/erp-api.md`: 역할표, 읽을 테이블, 함수 입력·출력·오류, supabase-js 예시, 첫 owner 지정법
  - `src/types/database.ts`: Supabase가 생성한 타입

## 7. 빌더 재량

- 컬럼 세부 타입, 인덱스, 함수 내부 구현, 새 상품 ID 형식(기존 `A7-32F1` 모양 유지 권장)
- 보고서 함수의 반환 컬럼 이름 (문서에 적기만 하면 됨)

## 8. 내가 정한 것 (확인 바람)

- 실DB에 추가만 하는 방식 (A안)
- 이메일+비밀번호 로그인, 역할 3단계와 위 권한표
- 취소·환불을 새 상태값 대신 `outcome` 컬럼으로 (지금 화면 보호)
- 품절 차단 기본 꺼짐
- 새 상품 기본 `hidden`, 손님 상품 읽기 정책에 `status` 조건 추가
- 원가는 별도 테이블 `sku_costs`, manager 이상만
- 태그 데이터는 분 단위 원자료(`tag_minutes`, `gateway_minutes`)로 쌓고, 자리 비움은 보고서에서 신호 기준을 바꿔가며 계산
- 태그 연결 시 major/minor 자동 배정, MAC 있는 상품은 major/minor 필수
- 판매 중이 아닌 상품 주문은 `invalid_product`로 차단
- 매출은 주문일 기준, 취소는 제외, 환불은 환불일에 차감, 퍼널은 건수 비율
- 직원 계정은 owner가 대시보드에서 만듦, 공개 가입 끄기 권장
- staff는 대시보드에서 매출을 못 봄
- 여러 매장은 1차에서 뺌
