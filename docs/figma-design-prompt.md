You are a senior product designer who builds production-ready Figma files: tokens as variables, components with variants and auto layout, and screens built only from those components. Design the POSTIC prototype UI in Figma using the attached PRD.

<context>
- Read `/Users/nojeong-un/devs/postic-prototype/postic/docs/PRD.md` first. §4 has the user scenarios, §6 lists every screen and its required elements, §8 is the design direction. Reference details: `/Users/nojeong-un/devs/postic-prototype/postic/docs/design-references.md`.
- POSTIC is a smart-retail prototype: BLE tags on clothes → in-store gateway → server → mobile web. A working React + Tailwind version already exists and is being demoed today. This Figma file is its visual redesign, which will later be implemented in React + Tailwind, so every token must map cleanly to CSS values.
- Use the Figma MCP tools available in this session. Load the Figma skills before writing to the canvas: `/figma-use` (required before any `use_figma` call) and `/figma-generate-design`.
- Target file: [FIGMA_FILE_URL]. If no URL is given, create a new design file named `POSTIC Prototype — UI v1`.
</context>

<design_direction>
Customer screens should feel like a premium Korean fashion-retail app; the staff screen should feel like a calm, legible store-ops tool.
- Flow model: Zara Store Mode (check in to a store → see only that store's stock → fitting-room slot with assigned room and wait time → QR/number pickup) and Nike in-store mode (request → staff claims it → "가져오는 중" → ready).
- Visual tone: 29CM — minimal color and lines, product imagery as the hero, bold titles against light meta text, generous whitespace.
- Payment and pickup number: Toss-like clarity — one primary action per screen, the amount and the pickup number are the largest elements, payment in a bottom sheet. Borrow principles only; do not copy Toss components or assets.
- Staff status labels: Shopify Polaris badge rules — one-word adjective labels, tone by intent (success / caution / critical / neutral), placed right next to the item, badges are never clickable (actions are buttons).
- Brand: blue `#1488FF`; accent gradient `#1488FF → #7B5CFF` used sparingly (brand mark underline, primary CTA, one KPI highlight).
- Surfaces: background `#F2F3F6`, white cards radius 24, shadows `0 1 2 rgba(0,0,0,.04)` and `0 8 24 rgba(0,0,0,.06)`.
- Type: Pretendard. If Pretendard is unavailable in Figma, use Inter and report it.
</design_direction>

<deliverables>
Page 1 `Foundations`
- Variable collection `POSTIC`:
  - Colors: brand `#1488FF`, brand-soft `#E3EFFF`, violet `#7B5CFF`, bg `#F2F3F6`, surface `#FFFFFF`, text-primary `#111111`, text-secondary `#6B7280`, text-tertiary `#9CA3AF`, border `#E5E7EB`, ok `#22C55E`, ok-soft `#E7F8EE`, caution `#F59E0B`, caution-soft `#FEF3C7`, critical `#EF4444`.
  - Radius 8 / 12 / 16 / 24. Spacing 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40.
- Text styles: Display 72/900 (pickup number), Title 28/800, Heading 20/700, Section 17/700, Body 15/400, Body-strong 15/600, Meta 12/500.

Page 2 `Components` (variants + auto layout; every layer named)
OnlinePill (online / offline), SimBadge, StatusBadge (preparing / ready / done × purchase / fitting), SignalBars (0–3), Button (primary / secondary / ghost × default / disabled / loading), SizeChip (default / selected / sold-out), ProductThumb (image / placeholder), ProductRow (online / offline-dimmed), HangerCard (recognized / none), InfoRow, PayMethodOption (selected / unselected), BottomSheet, StepProgress (3 steps: 접수 → 준비 중 → 픽업 대기), TopBar (store-mode header), BackBar, KPI Card, TagTableRow (online / offline / simulated), OrderRow (preparing / ready / done).

Page 3 `Customer — 390×844`
- 01 Home: 3 tags recognized, no active order
- 01b Home: active order card, plus "시뮬레이션" badge state
- 02 Hanger HG-01: all 3 online
- 02b Hanger HG-01: 1 product offline, dimmed at the bottom
- 03 Product detail: 오버핏 블레이저
- 03b Payment bottom sheet open
- 03c Payment approving (loading)
- 04 Pickup B-41 — 포장 준비 중
- 04b Pickup B-41 — 픽업 대기, with completion notice
- 04c Fitting request — FR-03, estimated wait

Page 4 `Admin — 1440×900`
- 05 Dashboard: 3/3 online, 2 orders
- 05b Dashboard: 1 tag offline, simulator on, 1 order ready

Prototype links: 01 → 02 → 03 → 03b → 03c → 04 → 04b.
</deliverables>

<sample_data>
Use exactly this data and Korean copy; do not invent other products, prices, or features.
- Store: POSTIC 홍대점 3F · 디스플레이 존 A-01. Hanger HG-01. Gateway G1-6F84. Fitting room FR-03. Pickup desk: 1F 픽업 데스크 · 입구 좌측.
- Products (brand POSTIC STUDIO):
  - 오버핏 블레이저 · 블랙 · 129,000원 · 울 62% · 폴리 38% · S2 M4 L1 XL품절 · 태그 A7-32F1
  - 램스울 크루넥 니트 · 베이지 · 89,000원 · 램스울 100% · S3 M5 L2 XL1 · 태그 B2-19C7
  - 코튼 옥스퍼드 셔츠 · 화이트 · 59,000원 · 면 100% · S1 M6 L3 XL2 · 태그 C4-77A0
- Pickup number B-41, 앞에 2팀 대기 중. Payment methods: POSTIC Pay · 카드 / 카카오페이 / 토스페이.
- Labels: 인식됨 · 3벌, 감지 안 됨, 바로 앞, 근처, 피팅하기, 구매하기, 결제하기, 결제 승인 중…, 픽업 번호, 닫기, 다시 스캔, 내 진행 상황, 인식 행거, 앞에 걸린 옷.
- Payment disclaimer (must appear in 03b): "시연용 가상 결제입니다. 실제 결제는 일어나지 않습니다."
- Admin rows: A7-32F1 1/101 789F380FF5AF −15 dBm 방금 · B2-19C7 1/102 789F380FF5C2 −16 dBm 방금 · C4-77A0 1/103 789F380FF5CC −14 dBm 1초 전. KPIs: 태그 온라인 3/3, 처리 대기 주문, 오늘 주문, 게이트 수신 횟수.
- Product images: no stock photos or external images. Use the ProductThumb placeholder: a rounded rectangle with a soft gradient tinted by the product color (블랙 / 베이지 / 화이트) and a simple garment line icon.
</sample_data>

<constraints>
- Every element in PRD §6 MUST appear on its screen. The "시뮬레이션" badge MUST exist on customer and admin screens.
- Build screens only from Page 2 components and Page 1 variables/styles. No detached instances, no hard-coded colors.
- All frames use auto layout; mobile side padding 16–20, tap targets ≥ 44, sticky bottom CTA on 03 with safe-area space.
- No features beyond the PRD: no login, dark mode, search, new tabs, reviews, or recommendations.
- If a target file is given, add new pages only. NEVER delete or overwrite existing pages or frames.
- Do not publish the library, share the file, or change file permissions.
</constraints>

<process>
1. Foundations → 2. Components → 3. Customer screens → 4. Admin screens → 5. Prototype links.
After each page, take a screenshot of it, fix any overflow, clipped Korean text, or misalignment, then output: `✅ [page] — what was built`.
</process>

<done>
Stop when all 4 pages and the prototype links exist and the screenshots show no clipped text or broken auto layout. Final message: the file link, the list of frame names, any substitutions made (for example the font), and anything you could not verify.
Stop and ask before: deleting anything, working in a file other than the target, or adding a screen or feature not in the PRD.
</done>
