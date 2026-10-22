# 0106 · The overview reads four grains with a like-for-like compare, and follows its canvas

Status: accepted
Source: project owner's decisions, 20/10/2026; API shipped in `a6f3528` (Fly
v162, no migration)

## Context

The overview `/` read only months and quarters. The owner asked for week and
year as well, and gave a design canvas for the screen
(https://claude.ai/artifact/SZySKwDachkFnbBrNDrRQz, version cde6).

## Decision

### 1 · Four grains, one period module

`GET /sales/performance/:period` accepts an ISO week `2026-W43`, a month
`2026-10`, a quarter `2026-Q4` or a year `2026`. All period math lives once in
`packages/contracts/src/sales/sales-period.ts`, used by both API and web.

### 2 · Buckets for the hero chart

The response carries `buckets`: a week splits into days, a month into calendar
weeks (Monday-start, cut at the month edges), a quarter and a year into months.

### 3 · Like-for-like compare

- Deltas compare with `compare`: the previous period cut to as many days as
  the current one has run by `asOf` (20 days into Q4 compares with 1–20 July).
- `asOf` is the Vietnam day read from the database clock.
- A finished period compares with the whole previous one.
- `previous` stays the WHOLE previous period and `months` stays filled so older
  web builds keep working; `months` is to be removed later.

### 4 · Week-only figures

`reached` (first contacts and opportunities reached inside the period) is
computed for week reads only, because its CTE is the costly part. The week view
shows an activity chart in place of the lead funnel.

### 5 · The screen follows its canvas, not Aurora's eyes-only laws

The overview (`apps/web/src/pages/home*.tsx`) follows the canvas above. For THIS
screen only, the owner waived the Aurora laws that only humans and reviewers
enforce (laws 12–13 style and glass-surface conventions in
`docs/design-system/laws.md`). The machine-enforced gates still apply: colours
from tokens only, the 8-step spacing scale, icons through `<Icon>`, no box
borders. Reviewers must not pull this screen back to the standard Aurora look;
any other screen is unaffected.

### 5a · Amendment 22/10/2026 — quieter motion and theme-native surfaces

Source: project owner, 22/10/2026. This departs from the canvas; do not
"restore" the canvas look.

- The shared look and motion recipes start from
  `apps/web/src/pages/home-look.ts`; the card-shell consts in `home-tiles` and
  `home-funnel` build on it. The canvas is no longer the source for motion,
  gradients or the hero's colour.
- Motion: cards enter at the system beat (`--motion-duration`). Data marks grow
  on entry and slide on a period change, with a short, fixed-span stagger. Data
  marks deliberately run longer than the UI beat (`--motion-duration`, the F-09
  band) because they carry a value; owner decision 22/10. Layers drawn over
  marks fade in once the marks have mostly grown. Cards and other non-clickable
  containers do not move on hover. Reduced motion is honoured.
- Surfaces: one opaque 135° wash per card, from tokens only, so each theme
  (Aurora, Đá mịn, Sứ — ADR 0108) paints it in its own palette. No glows, blurs
  or tinted shadows; elevation is `--shadow-card` (ADR 0108 §4).
- The hero follows the active theme instead of being dark in every theme
  (inside the forced-dark card Sứ also lost its own font and radius).
- Layout (owner confirmed 22/10 after seeing the screenshots): the funnel (or the week's activity chart) and the reasons tile each
  take a full-width row below the first row, the reasons groups side by side.
  The reasons tile had set row two's height and left a large empty band inside
  the funnel (measured in screenshots). The period picker's selected grain uses
  the theme's own primary-strong instead of the brand navy (the picker is shared
  with the workstream book, which changes with it).
- The funnel tile no longer carries the "Từ cơ hội tới hợp đồng" cell: its
  figure repeated the step-3→4 connector, and its caption read like the
  win-rate tile's different number.
- §5's waiver of the eyes-only look laws (law 5 radius included) and its
  machine-enforced gates are unchanged, except that law 13 (contrast) is taken
  back out of the waiver for this screen: contrast holds in all three themes.
  Reviewers judge the screen against `home-look.ts`.

### 6 · Rejected

- **Comparing with the whole previous period**: punishes a running period.
- **Keeping a month/quarter-only picker**: the owner asked for week and year.

## Not built (no backend yet)

- Quick actions Báo giá / Ghi cuộc gọi / Lịch hẹn / Email / Xuất Excel (only
  "Thêm lead" and "Tạo cơ hội" exist).
- Per-row call/mail/remind on the list.
- A "due today" tab.
- A shortcut to fill missing opportunity values (needs an opportunity-book
  filter for blank value).
- "Show n leads" buttons on the funnel steps (needs cohort filters).
- A server guard against a future `signedAt`.

## Consequences

- Older web builds keep reading `previous` and `months` until `months` is
  removed.
- The week read is the costliest of the four because of `reached`.
