# POSTIC 프로토타입

BP106 비콘 → Minew G1 → Supabase(`g1-ingest` 함수) → React 웹(실시간)

> **처음 왔다면 [docs/기획서.md](docs/기획서.md)부터.** 무엇을 왜 만드는지, 지금까지 된 것, 다음 할 일, 같이 일하는 규칙이 있다.
>
> ```bash
> npm install && cp .env.example .env   # .env 값은 팀 안에서 직접 받기
> npm run dev
> ```

- 손님 화면: `/` (폰)
- 직원 대시보드: `/admin` (노트북/태블릿) — 태그 N/N 온라인, RSSI 임계값, 시뮬레이터, 주문 상태, G1 원본 데이터
- Supabase 프로젝트: `postic-prototype` (hnnsiqgiibqgiyskdxyj, 서울)

## 실행

```bash
npm install
npm run dev        # http://localhost:5173 , 같은 Wi-Fi 폰은 http://<노트북IP>:5173
```

## 배포 (Vercel)

```bash
npx vercel --prod  # 처음엔 로그인 → 프로젝트 생성 질문에 엔터. .env 값이 빌드에 들어감
```

## 서버 코드 (Supabase)

서버 쪽 코드도 전부 이 레포에 있다. Supabase 프로젝트를 새로 만들어도 아래로 똑같이 재현 가능.

- `supabase/migrations/20261027060000_init_postic.sql` — 테이블, 권한, Realtime 설정, 시드 상품
- `supabase/functions/g1-ingest/index.ts` — G1 수신 함수

```bash
supabase link --project-ref hnnsiqgiibqgiyskdxyj
supabase db push                                          # 새 프로젝트일 때만
supabase functions deploy g1-ingest --no-verify-jwt
```

새 프로젝트로 옮기면 `.env`의 URL/키와 `relay.mjs`의 TARGET만 바꾸면 된다.

### 상품 사진

실물 3벌 (`supabase/migrations/20261113110000_real_garments.sql`):

| 태그 | 옷 | 비콘 MAC |
|---|---|---|
| A7-32F1 | COMME ÇA DU MODE MEN 3버튼 테일러드 자켓 (블랙) | 78:9F:38:0F:F5:AF |
| B2-19C7 | Drake's 셀비지 코듀로이 초어 자켓 (브라운) | 78:9F:38:0F:F5:C2 |
| C4-77A0 | POLYTERU 후디드 파카 (베이지) | 78:9F:38:0F:F5:CC |

- `<상품ID>.jpg` / `-back.jpg`: 앞·뒤 스튜디오 컷 (`image_url`, `back_image_url`). 상품 화면에서 탭하거나 좌우로 끌면 앞↔뒤로 돌아간다.
- `<상품ID>-cut.png`: 배경을 뺀 컷아웃. 행거 화면이 같은 은색 고리를 그려 봉에 건다 (없으면 썸네일로 대체).
- 만드는 법 (맥에서, 설치 필요 없음):
  ```bash
  swift scripts/cutout.swift 원본.jpg /tmp/cut.png          # 배경 제거 (macOS Vision)
  swift scripts/compose.swift /tmp/cut.png 0 public/products/<ID>-cut.png public/products/<ID>.jpg
  ```
  `compose.swift`의 두 번째 값은 위에서 잘라낼 px(사진 속 옷걸이 고리 제거용).

### 3D 스캔 (아이폰 17 Pro → 상품 화면 3D·AR)

`products.model_url`(GLB)이 있으면 상품 화면 사진 위에 "3D로 돌려보기" 버튼이 생긴다. 누를 때만 3D 엔진과 모델을 받는다(동시 접속 때 전원이 자동으로 받지 않게). 3D가 뜨면 "내 공간에 놓아보기"로 아이폰 AR Quick Look(`model_usdz_url` USDZ, 없으면 GLB 자동 변환)·안드로이드 Scene Viewer로 연다.

1. **촬영**: Scaniverse(무료, 기기 안 처리) → Mesh 모드. 옷을 옷걸이에 걸어 방 가운데(벽에서 떨어진 곳)에 매달고, 30~60cm 거리에서 눈높이·위·아래로 천천히 2바퀴. 밝고 고른 조명, 직사광선 피하기. 검은 블레이저는 빛이 부족하면 구멍이 잘 나서 조명을 더 밝게.
2. **처리**: Detail 품질로 처리 → 자르기로 바닥·주변 제거 → 공유에서 **GLB와 USDZ** 둘 다 내보내 AirDrop으로 맥에 저장.
3. **변환**: `scripts/prep-models.sh A7-32F1 ~/Downloads/blazer.glb ~/Downloads/blazer.usdz` (상품 ID: 테일러드 자켓 A7-32F1, 초어 자켓 B2-19C7, 파카 C4-77A0). 수십 MB 스캔을 몇 MB로 줄여 `public/products/`에 넣는다.
4. **미리보기**: `npm run dev` 후 스크립트가 알려주는 `http://localhost:5174/p/<ID>?model3d=...` (개발 모드에서만 동작, DB 안 건드림).
5. **반영**: 스크립트가 출력한 SQL을 Supabase에서 실행 → `vercel --prod` 배포.

## 1. BP106 (설정 불필요 — MAC으로 인식)

실물 BP106 3개는 Eddystone(TLM/URL)만 송출 중이라 iBeacon 설정 없이 **MAC 주소로 상품에 매핑**한다 (`products.mac`).
G1은 패킷 종류와 상관없이 MAC을 보내므로 전원만 켜져 있으면 된다.

| 상품 | 태그 ID | 비콘 MAC | Major/Minor (내부 키) |
|---|---|---|---|
| COMME ÇA DU MODE MEN 테일러드 자켓 | A7-32F1 | 78:9F:38:0F:F5:AF | 1 / 101 |
| Drake's 코듀로이 초어 자켓 | B2-19C7 | 78:9F:38:0F:F5:C2 | 1 / 102 |
| POLYTERU 후디드 파카 | C4-77A0 | 78:9F:38:0F:F5:CC | 1 / 103 |

- 비콘 뒷면 스티커에 상품명을 적어두면 시연할 때 헷갈리지 않는다.
- 비콘 추가/교체: Supabase `products`에 행 추가하고 `mac` 칸에 MAC(콜론 없이 대문자) 입력.
- iBeacon으로 바꾸고 싶으면(선택): FeasyBeacon 앱 Setting → PIN `000000` → `ADD Beacon+` → iBeacon, UUID `504F5354494300000000000000000001`, Major/Minor 위 표대로 → Save.
- 아이폰 FeasyBeacon 앱 목록에는 iBeacon이 안 보일 수 있다 (iOS 제한). Eddystone만 보여도 정상.

## 백업: 노트북을 게이트로 쓰기 (G1 없이)

맥 블루투스로 BP106을 듣고 G1과 같은 형식으로 서버에 올린다. 웹/대시보드는 그대로.

```bash
cd scanner
uv venv .venv && uv pip install --python .venv/bin/python bleak   # 처음 한 번
.venv/bin/python scanner.py
```

- 처음 실행 시 맥 블루투스 권한 허용 필요 (시스템 설정 → 개인정보 보호 및 보안 → Bluetooth)
- macOS는 MAC을 숨겨서 Feasycom 정보 프레임(0xFFF0) 안의 MAC으로 상품을 찾는다
- 감지가 띄엄띄엄이면 FeasyBeacon 앱에서 비콘 송출 간격을 1300ms → 200~300ms로 줄이면 훨씬 안정적

## 2. G1 설정 (웹 UI, g1-e-grapes 펌웨어)

우리 G1: MAC `AC:23:3F:C2:6F:84`, 펌웨어 g1-e-grapes (WiFi v3.8.1 / BLE v3.3.3). 2026-10-27 아래 설정으로 3/3 인식 확인.

1. 전원 ON → Wi-Fi `GW-AC233FC26F84` 접속 → `https://192.168.99.1` (계정 admin. 공장 기본값은 빈 비밀번호지만 지금은 바꿔둠, 정운에게 문의)
2. Network → Wireless → Available Access Point에서 **폰 핫스팟(2.4GHz)** 선택 → Key → Save profile
   - "Network checking(failover)"는 연결 확인용 주소일 뿐 업로드 URL이 아니다 (여기 넣으면 HEAD만 온다)
   - G1이 공유기 역할도 해서, 노트북을 `GW-…`에 붙여도 핫스팟 경유로 인터넷이 된다
3. Bluetooth → **Generic**
   - Protocol: **HTTP**, Upload Interval: **1 Second**
   - Data format: **JSON-PREPARSED** (기본값 MCV3-CONNECT는 바이너리라 못 읽음)
   - Preparsed type list: **iBeacon, eddystone URL, eddystone TLM 체크** ("upload preparsed type only"가 켜져 있어서 이게 꺼지면 우리 비콘이 안 올라감)
   - Apply
4. Bluetooth → **HTTP**: `https://` + `hnnsiqgiibqgiyskdxyj.supabase.co/functions/v1/g1-ingest?key=postic`, Authentication none → Apply
5. `/admin` 에서 "게이트 수신 횟수"가 올라가고 태그가 초록불이면 성공 (게이트 이름 `G1-6F84`)

G1이 보내는 형식: `{"gw":"ac233fc26f84","adv":[{"type":"ib"|"tlm"|"url","mac":"789f380ff5af","rssi":-15,...}]}`

**수신 횟수는 오르는데 태그가 안 뜨면** → `/admin` 아래 "마지막 게이트 원본 데이터" 확인. 필드명이 다르면 알려줘 (파서가 `ibeaconUuid/Major/Minor` 와 `rawData` 둘 다 읽음).
UUID를 다르게 넣었으면 URL 끝에 `&any=1` 붙이면 모든 iBeacon 받음.

**수신 횟수가 0이면 (G1이 HTTPS 못 보냄)** → 노트북 중계:

```bash
node relay.mjs     # G1 URL을 http://<노트북IP>:8080/g1 로 변경 (노트북도 같은 핫스팟)
```

## 3. 시연 순서

1. `/admin` 노트북 화면: 태그 3/3 온라인
2. 심사위원 폰으로 `/` → 인식 행거 → "앞에 걸린 옷" → 상품 → 구매하기 → 목 결제 → 픽업 번호
3. 노트북에서 주문 "→ 픽업 대기" 클릭 → 폰 화면 즉시 바뀜
4. 비콘 하나 전원 끄기(길게 누름) → 10초 안에 목록에서 사라짐 → 다시 켜면 돌아옴
   - 교실이 좁아 거리로 안 사라지면 `/admin` RSSI 임계값 슬라이더를 올려서 "범위 밖" 기준 조정

장비가 안 되면 `/admin` 시뮬레이터 켜기 (화면에 "시뮬레이션" 배지 표시됨).

## 4. 여러 사람이 동시에 쓸 때 (기기 토큰 · 직원 PIN · 트래픽)

- **기기 토큰**: 폰마다 처음 접속할 때 랜덤 토큰이 생겨 브라우저에 저장된다(홈 맨 아래 "이 기기 토큰 · XXXX-XXXX"). 주문에 `device_id`로 저장되고, "내 진행 상황"·"내 픽업 번호"는 그 기기 주문만 보여준다.
- **주문 생성**은 `place_order` 함수로만: 금액은 서버가 상품가로 정하고, 기기당 10분에 5건까지.
- **직원 대시보드(`/admin`)** 는 직원 PIN을 넣어야 열리고, 주문 상태·인식 기준 변경도 PIN을 확인하는 함수로만 된다. PIN은 `postic/.env`의 `STAFF_PIN`(빌드에 안 들어감). 바꾸려면 SQL:
  `update private.staff set pin_hash = extensions.crypt('새PIN', extensions.gen_salt('bf')) where id = 1;`
- **실시간 구조** (무료 플랜 한도 대응): 태그 상태 2초, 주문·설정 6초마다 조회. 내 주문 변경은 Broadcast `device:<토큰>` 채널로 바로 온다(직원은 `staff:orders`). Postgres Changes는 Nano DB에서 구독자가 수십 명만 돼도 타임아웃이 나서 쓰지 않는다.
- **적용 순서**: 마이그레이션 `20261113090000`·`20261113090050` 적용 → 새 웹 배포 → `20261113090100_lock_writes.sql` 적용(직접 쓰기 차단, Postgres Changes 발행 끔). 배포 전에 3단계를 적용하면 옛 화면의 주문·실시간이 멈춘다.

### 트래픽 테스트

```bash
node scripts/loadtest.mjs 120 60 0.3   # 가상 기기 120대, 60초, 30%가 주문
```

2026-11-13 결과 (실제 Supabase, 무료 플랜):
- 120대: 실시간 채널 120/120, 태그 조회 p95 53ms, 주문 생성 p95 84ms, 직원 변경 → 손님 도착 29/29건 p95 185ms
- 180대: 실시간 채널 180/180, 조회 실패 0, 직원 변경 → 손님 도착 68/68건 p95 141ms
- 무료 플랜 실시간 동시 연결 한도는 200 (탭 하나 = 연결 하나)

테스트 주문 정리:
`delete from orders where device_id like 'loadtest-%';` 후 `select setval('pickup_seq', coalesce((select max(substring(pickup_code from 3)::int) from orders), 40));`

## 주의

시연용이라 보안 최소: 주문 내용은 누구나 읽을 수 있고(개인정보 없음), 수신 키는 `postic` 고정. 시연 끝나면 Supabase에서 프로젝트 일시정지 권장.
