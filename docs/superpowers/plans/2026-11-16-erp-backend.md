# POSTIC ERP Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add staff accounts/roles, SKU inventory, order/sales, and store analytics to the live Supabase project as purely additive migrations, without breaking the deployed site.

**Architecture:** New tables live in `public` with RLS (staff-only reads) and all writes go through `security definer` RPCs named `erp_*`. Helper functions live in a new non-exposed schema `erp_internal`. Triggers bridge the new model to the legacy one (`products.sizes`, `orders.status`). Hot-path triggers on `tag_presence`, `gateway_raw` and `orders` never raise except for the two intended blocks.

**Tech Stack:** Postgres 17 on Supabase (Nano, free plan), PL/pgSQL, Supabase Auth, supabase-js types. Migrations are applied through the Supabase MCP (`execute_sql`, `apply_migration`, `generate_typescript_types`, `get_advisors`). Project ref is `hnnsiqgiibqgiyskdxyj`.

**Spec:** `docs/superpowers/specs/2026-11-16-erp-backend-design.md`

## Global Constraints

- Additive only. Do not drop, rename or change the behavior of existing tables, columns or functions (`place_order`, `staff_check`, `staff_set_order_status`, `staff_update_settings`, `log_raw`, `orders_broadcast`). The two permitted exceptions are both in the spec:
  - the `products` read policy gains a `status` condition
  - `products.major/minor` drop NOT NULL
- `orders.status` stays within `preparing | ready | done`. Cancel and refund are stored in `outcome`.
- Every new function is `security definer` with `set search_path = ''` and schema-qualified names. `execute` is revoked from `public` and `anon`, then granted to `authenticated`. `track_event` is the only exception: it is granted to `anon` too.
- Every new `public` table has RLS enabled and `insert, update, delete` revoked from `anon, authenticated`. Views use `security_invoker = true`.
- Error codes are raised as exact message strings: `not_staff`, `forbidden`, `not_found`, `invalid_input`, `user_not_found`, `last_owner`, `tag_in_use`, `out_of_stock`, `rate_limited`, `invalid_product`.
- Role rank: `owner` 3 > `manager` 2 > `staff` 1.
- Days are `Asia/Seoul`. Date-range RPCs reject `to < from` or spans over 366 days with `invalid_input`.
- Hot-path triggers (`tag_presence`, `gateway_raw`, the orders AFTER INSERT) wrap their work in `exception when others` and call `erp_internal.log_error(where text, detail text)`.
- No personal data (emails, PINs) in repo files.
- Migration files go in `supabase/migrations/`. Test files go in `supabase/tests/`.

## How tests run (all tasks)

- There is no psql access. Tests run through MCP `execute_sql` as a single string:
  - dry run before applying: `begin; <migration file>; <supabase/tests/_helpers.sql>; <test file>; rollback;`
  - after applying: `begin; <_helpers.sql>; <test file>; rollback;`
- A test file is a sequence of `do $$ … $$;` blocks. Any failed assertion raises an exception, so a test **passes when execute_sql returns without error**.
- Test orders consume `pickup_seq` values (sequences are not rolled back). That is accepted.

`supabase/tests/_helpers.sql` (Task 1) defines `pg_temp` helpers:
- `pg_temp.mk_user(p_email text) returns uuid`: inserts a row into `auth.users` (id, email, aud `'authenticated'`, role `'authenticated'`).
- `pg_temp.as_user(p_uid uuid)`: sets `role` to `authenticated` and `request.jwt.claims` to `{"sub":uid,"role":"authenticated"}`, both via `set_config(..., true)`.
- `pg_temp.as_anon()`: sets role `anon` and clears the claims.
- `pg_temp.as_admin()`: sets role `postgres` and clears the claims.
- `pg_temp.expect_error(p_sql text, p_code text)`: runs `execute p_sql`. Raises `'expected error %'` if nothing failed, and raises if `sqlerrm` does not contain `p_code`.

## Review Focus

1. **Hot-path trigger hits bad data.** Examples: a tag key with no product, a non-JSON `gateway_raw.body`, an order whose size has no SKU. Ingest and order insert must still succeed, and an `audit_log` row with `action='error'` must appear. Owner: Tasks 3 and 4.
2. **Legacy PIN path still works and is attributed.** `staff_set_order_status(pin, id, 'done')` sets `outcome='completed'` and audits with `actor_kind='pin'`. Owner: Task 3.
3. **Double cancel/refund must not return stock twice.** Owner: Task 3, enforced by a unique index on `(order_id, reason)`.
4. **Negative stock shows as 0 to customers.** `products.sizes` uses `greatest(on_hand, 0)`. Owner: Task 2.
5. **Non-staff and anon cannot read new tables or call `erp_*`.** Owner: Task 5.

---

### Task 1: Staff accounts, roles, audit log

**Files:**
- Create: `supabase/migrations/20261116100000_erp_staff_audit.sql`
- Create: `supabase/tests/_helpers.sql`
- Test: `supabase/tests/erp_01_staff.sql`

**Interfaces:**
- Produces:
  - Schema `erp_internal`, with `usage` granted to `anon, authenticated`.
  - Table `public.staff_members(user_id uuid pk → auth.users on delete cascade, display_name text not null default '', role text check in (owner, manager, staff), active boolean default true, created_at timestamptz)`.
  - Table `public.audit_log(id bigint identity pk, at timestamptz default now(), actor uuid, actor_kind text check in (staff, pin, system), action text, entity text, entity_id text, before jsonb, after jsonb)`.
  - `erp_internal.erp_role() returns text`: role of `auth.uid()` if active, else null. `stable`, granted to `anon, authenticated`.
  - `erp_internal.erp_has_role(p_min text) returns boolean`, granted to `anon, authenticated`.
  - `erp_internal.require_role(p_min text) returns uuid`: raises `not_staff` when there is no role and `forbidden` when the role ranks lower. Returns `auth.uid()`.
  - `erp_internal.log_error(p_where text, p_detail text) returns void`.
  - Trigger function `erp_internal.audit_row()`:
    - `TG_ARGV[0]` = primary-key column name; `TG_ARGV[1..]` = keys to ignore.
    - It skips an UPDATE whose old and new rows are equal after removing the ignored keys.
    - `actor_kind`: `staff` if `auth.uid()` is set; else `pin` when `TG_TABLE_NAME` is `orders` or `settings`; else `system`.
    - `action` = `lower(TG_OP)`.
  - RPCs:
    - `public.erp_me() returns jsonb`: `{user_id, email, display_name, role}`, or null.
    - `public.erp_staff_list() returns table(user_id uuid, email text, display_name text, role text, active boolean, created_at timestamptz)`: manager+.
    - `public.erp_add_staff(p_email text, p_role text, p_name text default null) returns public.staff_members`: owner. Upserts by user found by `lower(email)`.
    - `public.erp_update_staff(p_user uuid, p_role text default null, p_active boolean default null, p_name text default null) returns public.staff_members`: owner.
  - Audit triggers: `staff_members` (insert/update/delete) and `settings` (update).
  - RLS: `staff_members` select staff+; `audit_log` select manager+.

- [ ] **Step 1: Write `_helpers.sql` and the failing test `erp_01_staff.sql`.** Assertions:
  ```sql
  -- setup as admin: o := mk_user('o@t.dev'); m := mk_user('m@t.dev'); s := mk_user('s@t.dev'); x := mk_user('x@t.dev');
  -- insert staff_members (o,'owner') as admin (bootstrap path)
  -- as_user(o): erp_add_staff('M@T.dev','manager','M') ok (email case-insensitive); erp_add_staff('s@t.dev','staff','S') ok
  -- as_user(o): expect_error(erp_add_staff('nobody@t.dev','staff'), 'user_not_found')
  -- as_user(o): expect_error(erp_update_staff(o, 'manager'), 'last_owner'); expect_error(erp_update_staff(o, null, false), 'last_owner')
  -- as_user(m): expect_error(erp_add_staff('x@t.dev','staff'), 'forbidden'); (select count(*) from erp_staff_list()) = 3
  -- as_user(s): expect_error(erp_staff_list(), 'forbidden'); (select count(*) from staff_members) = 3; (select count(*) from audit_log) = 0
  -- as_user(x): erp_me() is null; expect_error(erp_staff_list(), 'not_staff'); (select count(*) from staff_members) = 0
  -- as_user(m): exists audit_log where entity='staff_members' and action='insert' and actor = o and actor_kind='staff'
  -- as_user(o): erp_update_staff(s, null, false) → as_user(s): erp_me() is null  (deactivated)
  ```
- [ ] **Step 2: Run the test alone (without the migration). Expected: FAIL** with `relation "staff_members" does not exist`.
- [ ] **Step 3: Write the migration** with the Interfaces above. Revoke `execute` on the four RPCs from `public, anon` and grant to `authenticated`.
- [ ] **Step 4: Dry run (migration + helpers + test, rolled back). Expected: success.**
- [ ] **Step 5: Apply** via `apply_migration(name: 'erp_staff_audit', query: <file>)`. Re-run helpers + test. **Expected: success.**
- [ ] **Step 6: Commit** `feat(erp): staff roles and audit log`.

### Task 2: Catalog and inventory

**Files:**
- Create: `supabase/migrations/20261116100100_erp_inventory.sql`
- Test: `supabase/tests/erp_02_inventory.sql`

**Interfaces:**
- Consumes: `erp_internal.require_role`, `erp_internal.audit_row`, `erp_internal.erp_has_role` (Task 1).
- Produces:
  - `products` changes:
    - new columns: `status text not null default 'active' check in (active, hidden, archived)`, `category text`, `updated_at timestamptz not null default now()`
    - `major/minor` drop NOT NULL
    - new constraint `products_tag_complete check (mac is null or (major is not null and minor is not null))`
    - read policy recreated as `using (status = 'active' or erp_internal.erp_has_role('staff'))`
    - audit trigger `audit_row('id','sizes','updated_at')`
  - `public.skus`
    - columns: `id text pk ('<product>/<size>')`, `product_id text not null → products on delete cascade`, `size text not null`, `barcode text unique`, `reorder_point int not null default 1 check >= 0`, `sort int not null default 0`, `active boolean not null default true`, `created_at`
    - `unique(product_id, size)`
    - audit trigger `audit_row('id')`
  - `public.sku_costs(sku_id text pk → skus on delete cascade, cost int not null check >= 0, updated_at)`: manager+ select.
  - `public.inventory_movements`
    - columns: `id bigint identity pk`, `sku_id text not null → skus`, `delta int not null check <> 0`, `reason text check in (opening, receive, sale, return, adjust, loss)`, `order_id uuid → orders`, `note text`, `actor uuid`, `created_at`
    - unique partial index on `(order_id, reason) where order_id is not null`
  - `public.stock(sku_id text pk → skus on delete cascade, on_hand int not null default 0, updated_at)`
  - Triggers:
    - a new SKU gets a `stock` row with 0
    - inserting a movement upserts `stock.on_hand += delta`
    - a `stock` change or a SKU `active`/insert change calls `erp_internal.refresh_sizes(p_product text)`, which sets `products.sizes = jsonb_object_agg(size, greatest(on_hand,0))` over the active SKUs
  - View `public.erp_stock_view` (security_invoker): `sku_id, product_id, product_name, size, on_hand, reorder_point, low (on_hand <= reorder_point), active, sort`
  - RLS select staff+ on `skus`, `stock`, `inventory_movements`; manager+ on `sku_costs`.
  - Backfill:
    - For every product and every key in `sizes`, insert a SKU. Sort order: XS 0, S 1, M 2, L 3, XL 4, XXL 5, anything else 9.
    - Insert an `opening` movement for each qty > 0, with `note 'ERP 도입 시점 재고'`.
  - RPCs:
    - `public.erp_save_product(p jsonb) returns public.products`: manager+.
      - Accepted keys: id, name, brand, price, color, material, category, image_url, back_image_url, hanger, zone, sort, status, emoji.
      - A missing id means create, with id format `[A-Z0-9]{2}-[A-Z0-9]{4}` (unique).
      - Defaults on create: status `hidden`, hanger `HG-01`, zone `A-01`.
      - `invalid_input` for an empty name or a negative price. `not_found` for an unknown id on update. Keys not present are left unchanged.
    - `public.erp_save_sku(p_product text, p_size text, p_cost int default null, p_barcode text default null, p_reorder_point int default null, p_sort int default null, p_active boolean default null) returns public.skus`: manager+. Upserts on `(product, size)`; a non-null `p_cost` upserts `sku_costs`.
    - `public.erp_link_tag(p_product text, p_mac text, p_major int default null, p_minor int default null) returns public.products`: manager+.
      - MAC is normalized to 12 uppercase hex characters, otherwise `invalid_input`. A null `p_mac` unlinks (`mac` = null).
      - Auto major = the digits of `hanger` (`HG-01` → 1). Auto minor = `coalesce(max(minor) where major = v_major, v_major*100) + 1`.
      - A unique violation on mac or (major, minor) raises `tag_in_use`.
    - `public.erp_receive_stock(p_sku text, p_qty int, p_note text default null) returns public.stock`: staff+. qty must be 1..10000, otherwise `invalid_input`. Unknown SKU raises `not_found`.
    - `public.erp_adjust_stock(p_sku text, p_counted int, p_reason text default 'adjust', p_note text default null) returns public.stock`: manager+. `p_reason in (adjust, loss)`, `p_counted >= 0`. A delta of 0 inserts nothing.

- [ ] **Step 1: Snapshot before the change** (`execute_sql`): `select id, sizes from products order by id`. Save the output in the task notes. Task 6 compares against it.
- [ ] **Step 2: Write the failing test `erp_02_inventory.sql`.** Setup: owner `o`, manager `m`, staff `s` via helpers + direct `staff_members` insert as admin. Assertions:
  ```sql
  -- backfill: (select sizes from products where id='A7-32F1') = <snapshot value>; count(*) from skus where product_id='A7-32F1' = jsonb count of its sizes keys
  -- as_user(m): p := erp_save_product('{"name":"테스트 셔츠","price":10000}') → p.status='hidden', p.hanger='HG-01', p.id ~ '^[A-Z0-9]{2}-[A-Z0-9]{4}$'
  -- as_anon(): not exists(select 1 from products where id = p.id)          -- hidden invisible to customers
  -- as_anon(): (select count(*) from products where status='active') = 3   -- live products still visible
  -- as_user(m): erp_save_sku(p.id,'M',7000) ; erp_receive_stock(p.id||'/M', 5) → on_hand 5; products.sizes->>'M' = '5'
  -- as_user(s): expect_error(erp_adjust_stock(p.id||'/M', 1), 'forbidden'); expect_error(select * from sku_costs → 0 rows check: count = 0)
  -- as_user(m): erp_adjust_stock(p.id||'/M', 2, 'loss') → on_hand 2; movement delta = -3 reason 'loss'
  -- as_admin(): insert movement (sku, -5, 'adjust') → on_hand -3; products.sizes->>'M' = '0'   -- Review Focus 4
  -- as_user(s): expect_error(erp_receive_stock(p.id||'/M', 0), 'invalid_input'); expect_error(erp_receive_stock('nope/M', 1), 'not_found')
  -- as_user(m): erp_link_tag(p.id,'78:9f:38:00:00:01') → mac='789F38000001', major=1, minor=(max minor in major 1)+1
  -- as_user(m): expect_error(erp_link_tag(p.id,'789F380FF5AF'), 'tag_in_use')   -- A7-32F1's beacon
  -- as_user(m): expect_error(erp_link_tag(p.id,'zz'), 'invalid_input')
  -- as_admin(): expect_error(update products set mac='AAAAAAAAAAAA', major=null where id=p.id, 'products_tag_complete')
  -- as_user(m): exists audit_log where entity='products' and entity_id=p.id and action='insert'
  -- as_user(m): not exists audit_log where entity='products' and action='update' and (after - 'sizes' - 'updated_at') = (before - 'sizes' - 'updated_at')  -- sync noise skipped
  ```
- [ ] **Step 3: Run the test alone. Expected: FAIL** (`erp_save_product` does not exist).
- [ ] **Step 4: Write the migration.**
- [ ] **Step 5: Dry run. Expected: success.**
- [ ] **Step 6: Apply** (`erp_inventory`), then re-run the test. **Expected: success.** Then run `select id, sizes from products order by id`. **Expected:** identical to the Step 1 snapshot.
- [ ] **Step 7: Commit** `feat(erp): SKU inventory with movement ledger`.

### Task 3: Orders and sales

**Files:**
- Create: `supabase/migrations/20261116100200_erp_orders.sql`
- Test: `supabase/tests/erp_03_orders.sql`

**Interfaces:**
- Consumes: Tasks 1 and 2 (`skus`, `stock`, `inventory_movements`, `require_role`, `audit_row`, `log_error`).
- Produces:
  - `orders` new columns: `sku_id text → skus`, `outcome text check in (completed, cancelled, refunded)`, `closed_at timestamptz`, `close_note text`, `handled_by uuid`, `updated_at timestamptz`.
  - `settings` new column: `block_oversell boolean not null default false`.
  - `erp_internal.order_before_insert()`, a BEFORE INSERT trigger:
    - raises `invalid_product` if the product status is not `active`
    - sets `sku_id` by (product_id, size)
    - if `type='purchase'` and `block_oversell`, it locks the stock row (`for update`) and raises `out_of_stock` when `on_hand <= 0`
  - `erp_internal.order_after_insert()`, an AFTER INSERT trigger: a purchase with a `sku_id` inserts movement `(sku_id, -1, 'sale', order_id)`. It is exception-safe.
  - `erp_internal.order_before_update()`: sets `updated_at = now()`. When status changes to `done` and `outcome` is null, it sets `outcome='completed'` and `closed_at=now()`.
  - Audit trigger on `orders` AFTER UPDATE, only when status or outcome changed: `audit_row('id')`.
  - `public.erp_order_action(p_order uuid, p_action text, p_note text default null) returns public.orders`. Every action sets `handled_by = auth.uid()`.
    | action | role | allowed from | result |
    |---|---|---|---|
    | `ready` | staff | `preparing` | `ready` |
    | `complete` | staff | `preparing` or `ready` | `done` + `completed` |
    | `cancel` | manager | `outcome is null` | `done` + `cancelled` + `close_note`, plus a `return +1` if a sale movement exists |
    | `refund` | manager | `type='purchase'` and `outcome='completed'` | `refunded` + `closed_at=now()` + `return +1` |

    Anything else raises `invalid_input`. An unknown order raises `not_found`.
  - `public.erp_update_settings(p_rssi int default null, p_online int default null, p_block_oversell boolean default null) returns public.settings`: manager+. Same clamps as `staff_update_settings`.
  - `public.erp_dashboard() returns jsonb`: staff+.
    - keys: `orders_today, pending, low_stock, tags_online, revenue_today, net_today`
    - the revenue keys are null for staff
    - `tags_online` counts non-simulated `tag_presence` rows within `settings.online_seconds`
  - `public.erp_sales_daily(p_from date, p_to date) returns table(day date, orders int, units int, revenue bigint, refunds bigint, net bigint)`: manager+.
    - one row per day, including zero days
    - revenue = purchases created that day where `outcome is distinct from 'cancelled'`
    - refunds = `outcome='refunded'` by `closed_at` day
  - `public.erp_sales_by_product(p_from date, p_to date) returns table(product_id text, name text, units int, revenue bigint, refunds bigint, net bigint)`: manager+.

- [ ] **Step 1: Write the failing test `erp_03_orders.sql`.** Setup: `m` manager, `s` staff, plus a test product `T` created as admin with status `active`, SKU `T/M`, and `erp_receive_stock` 2 run as `m`. Assertions:
  ```sql
  -- as_anon(): o1 := place_order('dev-test-0001','T','M','purchase','카드') → o1.sku_id='T/M'; stock(T/M)=1; movement sale -1 order_id=o1.id
  -- as_anon(): f := place_order('dev-test-0001','T','M','fitting') → stock still 1
  -- as_user(s): erp_order_action(o1,'ready') → status 'ready', handled_by = s
  -- as_user(s): expect_error(erp_order_action(o1,'cancel'), 'forbidden')
  -- as_user(m): erp_order_action(o1,'cancel','고객 변심') → status 'done', outcome 'cancelled'; stock 2
  -- as_user(m): expect_error(erp_order_action(o1,'cancel'), 'invalid_input'); stock still 2              -- Review Focus 3
  -- as_anon(): o2 := place_order(...'purchase'); as_user(s): erp_order_action(o2,'complete') → outcome 'completed'
  -- as_user(m): erp_order_action(o2,'refund') → outcome 'refunded'; stock back; expect_error(erp_order_action(o2,'refund'),'invalid_input')
  -- PIN path: as_admin(): update private.staff set pin_hash = extensions.crypt('9999', extensions.gen_salt('bf'));
  --           as_anon(): o3 := place_order(...); staff_set_order_status('9999', o3.id, 'done') → outcome 'completed', closed_at not null
  --           exists audit_log where entity='orders' and entity_id=o3.id::text and actor_kind='pin'               -- Review Focus 2
  -- hidden product: as_admin(): update products set status='hidden' where id='T'; as_anon(): expect_error(place_order(...'T'...), 'invalid_product')
  -- oversell: status back to active; stock(T/M) set to 0 by erp_adjust_stock as m; erp_update_settings(null,null,true);
  --           as_anon(): expect_error(place_order(...'purchase'), 'out_of_stock'); fitting still succeeds
  -- missing SKU: as_admin(): delete from skus where id='T/M' cascade-safe? → instead insert product U active with sizes '{"M":1}' and no sku row;
  --           as_anon(): place_order(...'U','M','purchase') succeeds, sku_id null, no movement, no error row   -- Review Focus 1 (orders)
  -- as_user(m): erp_sales_daily(today, today): revenue = price(o2)  (o1 cancelled excluded), refunds = price(o2), net = 0
  -- as_user(s): (erp_dashboard()->>'revenue_today') is null; (erp_dashboard()->>'orders_today')::int >= 3
  -- as_user(m): expect_error(erp_sales_daily(today, today - 1), 'invalid_input')
  ```
- [ ] **Step 2: Run alone. Expected: FAIL.**
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Dry run. Expected: success.**
- [ ] **Step 5: Apply** (`erp_orders`), then re-run. **Expected: success.**
- [ ] **Step 6: Commit** `feat(erp): order actions, stock sync and sales reports`.

### Task 4: Store analytics

**Files:**
- Create: `supabase/migrations/20261116100300_erp_analytics.sql`
- Test: `supabase/tests/erp_04_analytics.sql`

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces:
  - `public.tag_minutes(tag_key text, minute timestamptz, product_id text, gateway text, samples int, rssi_sum bigint, rssi_max int, rssi_min int, pk(tag_key, minute))`: manager+ select.
  - `public.gateway_minutes(gateway text, minute timestamptz, posts int, pk(gateway, minute))`: manager+ select.
  - `erp_internal.presence_minute()`, an AFTER INSERT OR UPDATE trigger on `tag_presence`:
    - skips `simulated` rows, and updates where `last_seen` did not change
    - upserts `tag_minutes` at `date_trunc('minute', new.last_seen)`
    - takes `product_id` from products by (major, minor)
    - is exception-safe
  - `erp_internal.gateway_minute()`, an AFTER UPDATE trigger on `gateway_raw` when `count` changed:
    - gateway name = `'G1-' || upper(right(body::jsonb->>'gw', 4))`, falling back to `'GW-01'` when that fails
    - upserts `gateway_minutes` with `posts + 1`
    - is exception-safe
  - `public.customer_events(id bigint identity pk, device_id text not null, type text check in (view_home, view_hanger, view_product), product_id text → products on delete set null, created_at)`: manager+ select. Indexes: `(device_id, created_at desc)` and `(product_id, created_at)`.
  - `public.track_event(p_device text, p_type text, p_product text default null) returns void`: anon + authenticated.
    - device length must be 8..64 and the type must be valid, otherwise `invalid_input`
    - an unknown product raises `invalid_input`
    - more than 60 events per device in the last minute raises `rate_limited`
  - `public.erp_product_funnel(p_from date, p_to date) returns table(product_id text, name text, views int, fitting_requests int, purchases int, view_to_purchase numeric, fitting_to_purchase numeric)`: manager+. Purchases exclude cancelled. Ratios = `round(100.0 * purchases / nullif(x, 0), 1)`.
  - `public.erp_tag_activity(p_from date, p_to date, p_rssi_threshold int default null) returns table(product_id text, name text, gateway_minutes int, seen_minutes int, away_minutes int, away_count int, avg_rssi numeric, last_seen timestamptz)`: manager+.
    - covers products with non-null major/minor
    - the threshold defaults to `settings.rssi_threshold`
    - a minute counts as seen when the tag has a row and `rssi_sum/samples >= threshold`
    - away = gateway minutes minus seen minutes
    - `away_count` = number of maximal runs of consecutive away minutes (gaps-and-islands)

- [ ] **Step 1: Write the failing test `erp_04_analytics.sql`.** Setup: manager `m`. As admin, insert test product `T` (major 9, minor 901, active). Assertions:
  ```sql
  -- as_admin(): insert tag_presence ('9-901',9,901,-50, '2026-11-16 10:00:05+09', 'G1-TEST', false) then update last_seen to 10:00:40 (rssi -60) and 10:01:10 (rssi -55)
  --   → tag_minutes('9-901', 10:00) samples 2, rssi_max -50, rssi_min -60; ('9-901', 10:01) samples 1; product_id 'T'
  -- as_admin(): update tag_presence set rssi=-40 where key='9-901' (last_seen unchanged) → samples unchanged
  -- as_admin(): insert tag_presence ('9-999',9,999,-50, now(), null, false) → succeeds, tag_minutes row with product_id null       -- Review Focus 1
  -- as_admin(): insert tag_presence ('9-902',...,simulated=true) → no tag_minutes row for '9-902'
  -- as_admin(): update gateway_raw set body='{"gw":"ac233fc2abcd"}', count=count+1 where id=1 → gateway_minutes 'G1-ABCD' posts 1
  -- as_admin(): update gateway_raw set body='not json', count=count+1 → succeeds; gateway_minutes 'GW-01' posts 1                   -- Review Focus 1
  -- gateway minutes 10:00..10:04 inserted for 'G1-TEST' as admin; T seen at 10:00, 10:01 (above) and 10:04 (-50)
  --   as_user(m): erp_tag_activity('2026-11-16','2026-11-16', -100) row T: gateway_minutes 5, seen 3, away 2, away_count 1
  --   as_user(m): erp_tag_activity(..., -52): 10:00 avg -55 and 10:01 avg -55 fall below → seen 1, away 4, away_count 1
  -- as_anon(): track_event('dev-test-0001','view_product','T') ok; expect_error(track_event('short','view_product'),'invalid_input');
  --   expect_error(track_event('dev-test-0001','view_cart'),'invalid_input'); 60 more calls → expect_error(…,'rate_limited')
  -- as_anon(): expect_error(select count(*) from customer_events → 0 rows; assert 0)
  -- as_user(m): erp_product_funnel(today,today) row T: views >= 1, view_to_purchase computed, no division error when views = 0 for other products
  ```
- [ ] **Step 2: Run alone. Expected: FAIL.**
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Dry run. Expected: success.**
- [ ] **Step 5: Apply** (`erp_analytics`), then re-run. **Expected: success.** Then check live data, waiting about 70 seconds first:
  - `select count(*) from tag_minutes where minute > now() - interval '3 minutes'` **≥ 3**
  - `gateway_minutes` has a `G1-6F84` row in the current minute
  - no `audit_log` `error` rows
- [ ] **Step 6: Commit** `feat(erp): minute-level tag analytics and customer events`.

### Task 5: Security sweep

**Files:**
- Test: `supabase/tests/erp_05_security.sql`

**Interfaces:**
- Consumes: everything above. Produces nothing new. A failing assertion means fixing the owning task's migration in a new follow-up migration `20261116100400_erp_security_fix.sql`.

- [ ] **Step 1: Write `erp_05_security.sql`.** Assertions:
  ```sql
  -- for each t in (staff_members, audit_log, skus, sku_costs, stock, inventory_movements, tag_minutes, gateway_minutes, customer_events, erp_stock_view):
  --   as_anon(): count(*) = 0 (or permission denied)        as_user(non-staff x): count(*) = 0
  --   as_anon(): expect_error(insert into t default values, 'permission denied') for tables
  -- for each erp_* function: as_anon(): expect_error(call, 'permission denied')   ; as_user(x): expect_error(call, 'not_staff')
  -- as_anon(): track_event works; place_order still works for an active product
  -- as_anon(): expect_error(select erp_internal.require_role('staff'), 'permission denied')
  ```
- [ ] **Step 2: Run** (helpers + test, rolled back). **Expected: success.**
- [ ] **Step 3: Run** `get_advisors(type: 'security')`. **Expected:** no finding names an object created by this plan. The pre-existing `private.staff` RLS advisory is reported to the user, not fixed.
- [ ] **Step 4: Commit** `test(erp): security sweep`.

### Task 6: Live verification and handoff to frontend

**Files:**
- Create: `src/types/database.ts` (generated)
- Create: `docs/erp-api.md`
- Modify: `docs/기획서.md` (status line in 3장, link to erp-api.md in 7장)

- [ ] **Step 1: Live checks.** **Expected:** all three pass.
  - `node scripts/watch.mjs` for about 20 seconds: GW 수신 중, 3 tags 감지됨, no ERROR.
  - `select id, sizes from products order by id` = the Task 2 snapshot, minus any real sales in between, which show up as `sale` movements.
  - `select count(*) from audit_log where action='error'` = 0.
- [ ] **Step 2: Generate the types.** Run `generate_typescript_types` and write the output verbatim to `src/types/database.ts`. Then run `npm run build`. **Expected:** the build passes.
- [ ] **Step 3: Write `docs/erp-api.md`** in Korean. Sections:
  - how to log in (`supabase.auth.signInWithPassword`)
  - the role table, copied from the spec
  - readable tables and views, with columns
  - every RPC: params, return value, the roles that can call it, its error codes, and one supabase-js example
  - first owner bootstrap SQL, with an `<email>` placeholder
  - known transition limits (cancelled shows as 완료 on the legacy customer screen; `track_event` not wired yet)
- [ ] **Step 4: Commit and push** `docs(erp): API guide and generated types`, then `git push`.
