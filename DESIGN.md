---
# gstack: design-md-format=spec
name: POSTIC
description: Flat, ruled retail floor. White paper, black ink, hairlines, and one blue that appears only when a garment tag is caught.
colors:
  paper: "#FFFFFF"
  ground: "#F5F5F3"
  ink: "#111111"
  on-ink: "#FFFFFF"
  text-muted: "#666666"
  hairline: "#E4E4E0"
  signal: "#1488FF"
  ok: "#22A559"
  caution: "#B7791F"
  critical: "#D92D20"
typography:
  display:
    fontFamily: Pretendard Variable
    fontWeight: 800
    letterSpacing: -0.02em
  body:
    fontFamily: Pretendard Variable
    fontWeight: 400
    fontSize: 0.9375rem
    lineHeight: 1.5
  label:
    fontFamily: Pretendard Variable
    fontWeight: 500
    fontSize: 0.75rem
    letterSpacing: 0.02em
  mono:
    fontFamily: JetBrains Mono
    fontWeight: 500
    fontFeature: tnum
rounded:
  none: 0px
  control: 2px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.control}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    borderColor: "{colors.ink}"
    rounded: "{rounded.control}"
  hang-tag:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.none}"
  hang-tag-caught:
    borderColor: "{colors.signal}"
    textColor: "{colors.signal}"
  ledger-row:
    backgroundColor: "{colors.paper}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.none}"
---

# POSTIC

## Overview

**Creative North Star:** The moment a garment is caught. A hang-tag label on the clothes turns blue the instant the gateway reads it, and nothing else on the screen is allowed to be blue.
**Product context:** BLE tags sewn into clothes, an in-store gateway, a server, and a mobile web app. Customers see what hangs in front of them and request a fitting, pay (demo payment) and pick up. Staff watch tag health and process orders on a laptop or tablet.
**Mode per surface:** Customer app is Persuade then Operate (browse, then one action per screen). Staff dashboard is Operate (dense, legible, calm).
**Reference sites:** display.wconcept.co.kr, www.29cm.co.kr, www.musinsa.com (viewed 2026-10-27). All three use no shadows, corners of 0 to 4px, white ground, black type, and let photography carry color.
**Key characteristics:**
- White paper, black ink, 1px hairlines. No gradients, no shadows, no icon chips.
- Products are 3:4 rectangles. Lists are ruled ledgers, not cards.
- Tag data (ID, MAC, RSSI, pickup number) is set in mono, like an instrument readout.
- Blue means one thing: recognized, caught, selected.

## Colors

**Strategy:** Restrained. Neutrals plus a single accent used rarely.
**Light or dark:** Light. Customers stand in a lit store with a phone in hand; staff read a laptop at a counter. Dark would add nothing here.
`ink` is the primary action and the text. `signal` marks recognition (online tag, caught state, selected size). It is not a decoration color and never fills a large area. `ok`, `caution`, `critical` carry meaning only: healthy dot, simulation or waiting, failure. A simulation badge uses `caution` text on a `ground` fill, never a saturated block. Placeholder product tones are warm and flat; they are stand-ins for photography and are not tokens.

## Typography

Pretendard Variable is the Korean fashion-retail standard (W Concept uses it) and carries display, body and label. Hierarchy comes from weight and size contrast (800 against 400), not from a second face. JetBrains Mono is used only for measured data: tag ID, MAC, RSSI, major/minor, pickup and fitting numbers. Pretendard is SIL OFL 1.1, loaded from `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css`. JetBrains Mono is SIL OFL 1.1, loaded from `https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@100..800&display=swap`. Both verified 2026-10-27.
Scale: 72 (pickup number only), 28, 20, 17, 15, 12. Headings differ from body by more than a weight step.

## Layout

Mobile 390 with 16px gutters, product imagery full-bleed at 3:4. Tablet 768 and desktop 1280 move to two columns with a 1200px content cap. Section gaps are 40px; ledger rows are 56px on customer screens and 44px in the staff table. Staff tables are ruled lists with no card wrapper. On mobile the staff table becomes stacked ledger blocks.

## Elevation & Depth

None. Depth is a hairline or a ground-colour step (paper on ground). The payment sheet sits on a 40% ink scrim with a top hairline, not a shadow.

## Shapes

Radius is 0 everywhere except controls (buttons, inputs) at 2px. Circles are for status dots only. No pill chips, no rounded cards.

## Components

- **Button primary:** solid `ink`, `on-ink` label, 2px radius, 52px tall. Hover and pressed darken to #000 and lighten to #333. Focus-visible: 2px `signal` outline offset 2px. Disabled: `hairline` fill, `text-muted` label. Loading keeps the label and swaps the leading slot for a spinner. There is no gradient button.
- **Button secondary:** paper fill with a 1px `ink` border. Ghost is text only.
- **Hang tag:** a rectangular label with a punched-hole mark, a mono tag ID, and a 1px `hairline` border. When the tag is caught the border and the ID turn `signal` once for 600ms and stay `signal`. Offline tags go `text-muted` with a dotted border.
- **Ledger row:** a full-width row separated by a hairline: thumbnail, name, mono data, state. Offline rows drop to 45% opacity and move to the bottom.
- **Status badge:** one word, tone by intent (`ok`, `caution`, `critical`, neutral), placed beside the item, never clickable.
- **Product placeholder:** flat tone block, crop-mark corners, product name label. It is honest about being a stand-in for a photo.

## Do's and Don'ts

- Do: keep blue for recognition and selection only.
- Do: show tag ID, MAC, RSSI, pickup number in mono.
- Do: separate lists with hairlines and let whitespace do the grouping.
- Do: give empty, offline, loading and error states their own design.
- Don't: use gradients, shadows, blurred panels or decorative circles.
- Don't: put an icon in a coloured square above or before a heading.
- Don't: nest a card in a card, or round anything beyond 2px.
- Don't: draw sparklines or progress rings that stand for no real data.
- Don't: use a pill chip as a label above a headline.

## Motion

- **Approach:** minimal-functional
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(100ms) short(200ms) medium(300ms) long(600ms)
- **The one authored moment:** when a tag is received, its hang-tag border flashes from `ink` to `signal` once (600ms). Nothing else animates for decoration.

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-27 | Initial design system created | /design-consultation after Figma v2 read as a generated UI template (gradient CTA, r24 shadow cards, icon chips, decorative data). Based on W Concept, 29CM and Musinsa screens plus the memorable-thing answer: garments being caught live. |
| 2026-10-27 | Pretendard plus JetBrains Mono | Pretendard is the Korean fashion standard; mono is reserved for measured BLE data. |
| 2026-10-27 | Radius 0 and no shadows | Reference sites use 0 to 4px and no shadows; rounded cards were the strongest template tell. |
