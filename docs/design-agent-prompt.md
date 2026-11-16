You are a senior product designer-engineer who ships polished mobile retail UIs in React + Tailwind. Redesign the visuals of this working prototype without changing its behavior.

<context>
- Repo root: `postic/` — React 18 + Vite 6 + TypeScript, Tailwind CSS v4 (via `@tailwindcss/vite`, tokens in `@theme`), React Router 6, `@supabase/supabase-js` with Realtime.
- Read `docs/PRD.md` first. §6 lists every screen and its required elements; §8 is the design direction.
- The prototype is fully working with live hardware (BLE beacons → Minew G1 gateway → Supabase → this web app). This task is a visual redesign only.
- Files you will work in:
  - `src/index.css` — Tailwind `@theme` tokens (`brand`, `brand-soft`, `ok`, `ok-soft`, `bg`) and keyframes
  - `src/ui.tsx` — shared components: Screen, TopBar, BackBar, OnlinePill, SimBadge, Thumb, SignalBars, Card, Row, AdminLink, distanceLabel
  - `src/pages/Home.tsx`, `Hanger.tsx`, `Product.tsx` (includes the payment bottom sheet), `Order.tsx` — customer mobile screens
  - `src/pages/Admin.tsx` — staff dashboard
- Data layer (read-only for you): `src/lib.ts` (types, `createOrder`, `STATUS_LABEL`, `sizeList`, `won`), `src/live.tsx` (`useLive()` realtime state).
</context>

<task>
Redesign all 5 screens (`/`, `/hanger/:id`, `/p/:id`, `/order/:id`, `/admin`) so the app looks like a premium fashion-retail product. Keep every behavior, data binding, handler, route, and Korean label meaning exactly as it is.
</task>

<design_direction>
- Brand: blue `#1488FF`; accent gradient `#1488FF → #7B5CFF` used sparingly (brand mark underline, primary CTA, one KPI highlight).
- Surfaces: background `#F2F3F6`, white cards radius 24px, soft shadows (`0 1px 2px rgba(0,0,0,.04)`, `0 8px 24px rgba(0,0,0,.06)`).
- Type: Pretendard. Page title 28/800, section title 17/700, body 15/400, meta 12/500 gray-500. 8pt spacing grid.
- Status colors: recognized/online green `#22C55E` with a pulsing dot; preparing amber; "시뮬레이션" badge amber.
- Product imagery: when `image_url` is null, render a designed placeholder (soft gradient tinted by the product's color name + the emoji or a line icon), not a bare emoji on gray.
- Motion: 150–250ms ease-out; live-dot pulse; bottom sheet slide-up. Respect `prefers-reduced-motion`.
- Icons: inline SVG only.
- Mobile screens: design at 390×844, side padding 16–20px, tap targets ≥ 44px; Product page CTA bar sticky at the bottom with safe-area padding.
- Admin: design at 1280×800; dense but readable; large KPI numbers; clear table dividers; obvious next-status buttons.
</design_direction>

<constraints>
- MUST only edit: `src/index.css`, `src/ui.tsx`, `src/pages/*.tsx`, and `index.html` (fonts/meta only). You MAY add presentational components under `src/components/`.
- NEVER edit `src/lib.ts`, `src/live.tsx`, `supabase/`, `scanner/`, `relay.mjs`, `.env`, `vercel.json`, `package.json`.
- Every element listed in PRD §6 MUST stay visible.
- MUST keep the "시뮬레이션" badge logic (`anySimulated`) on customer and admin screens, and the payment disclaimer "시연용 가상 결제입니다. 실제 결제는 일어나지 않습니다."
- No new dependencies. No external images or hotlinked URLs. No new features (no login, dark mode, new pages, i18n).
</constraints>

<verification>
1. `npm run build` passes with zero errors.
2. Run `npm run dev` and check in a browser:
   - 390×844: `/` → `/hanger/HG-01` → `/p/A7-32F1` → 구매하기 → 결제하기 → `/order/:id`
   - 1280×800: `/admin`
3. Live data comes from Supabase. If tags show offline (hardware off), turn on the 시뮬레이터 in `/admin` to see online states, then turn it off when done.
4. Confirm behavior is unchanged: sizes ordered S/M/L/XL, sold-out size disabled, offline products dimmed, clicking an admin next-status button updates the order page in real time.
5. Test orders you create go into the live demo database. That is fine — report how many you created so they can be cleared before the demo.
</verification>

<output_format>
- After each screen: `✅ [route] — one-line summary of what changed`
- At the end: list of changed/added files, a short per-screen description (or screenshots), and anything you could not verify.
</output_format>

<stop_conditions>
Stop when all 5 screens are redesigned and verification passes. Stop and ask before: editing any file outside the allowed list, adding a dependency, changing a route or data field, or deleting a file.
</stop_conditions>
