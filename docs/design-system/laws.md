# Pebble Aurora — the fifteen hard laws

Source: `docs/luat-thiet-ke.md` §1, ratified 10/08; laws 1, 2, 3, 6, 12 and 15
carry the values of the Pebble Aurora design system, adopted 17/09/2026, which
flattened the glass surfaces and replaced the palette and the type. The shape
of the laws is untouched — every "only"/"never"/"single exception" still reads
as it did. See `docs/design-system/index.md` for the old-section →
new-file map.

> **Two old numbering schemes.** `project/CLAUDE.md` and `AGENTS.md §1` numbered
> these fifteen laws differently (borderless was law 4 in the first, §1.1 in the
> second). This file keeps **`project/CLAUDE.md`'s numbering** as the standard,
> because 36 citations in code use it. Two spots that once cited `AGENTS §1.11`
> and `§1.13` have been switched to the standard numbers.

Every quote below (`'...'`) is a literal display string or product name — kept
in Vietnamese because it is content, not an identifier. Do not translate it.

---

Breaking one of these is a PR reject.

1. **Color** only comes from the Pebble Aurora table plus the Pebble Vina
   brand palette, both in `packages/tokens/globals.css`. `#5AD49A` is the one
   permitted derived semantic color (the brand palette has no green). Text
   placed **inside an already-tinted block** uses the `--on-tint-*` token
   group — do not invent a new tint.
2. **Pebble Blue `#133A8A` and Slate Gray `#5E6B80` are never text color** on a
   dark background — background, rule lines, glow only. Secondary text uses
   `#A3AEC8`, the third reading level `#8491B0`.
3. **Brand blue `#3D6DF5` is background-only** — for AI, primary buttons,
   active state, countable on every screen. Brand text is always `#A9C1FF`.
4. **Borderless.** `--border: transparent`. Edges read by shadow + 1px inset
   sheen. **Single exception**: the high-contrast variant for outdoor kiosk
   tablets, 2px border.
5. **Corner radius**: card 6 · control 4 · tag 3 · `rounded-full` reserved for
   status dots and the floating AI Assistant button only (FAB, 60px, bottom
   right corner).
6. **Type**: Be Vietnam Pro carries text, headings and numbers alike · JetBrains
   Mono carries code and object codes. Numbers are always `tabular-nums`. Labels
   are sentence case — no uppercase, no letter-spacing, because Vietnamese
   diacritics stop reading. VN currency convention: comma for decimal, period
   for thousands.
7. **Spacing** — 8 steps only: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48.
8. **Tables and long lists** always sit on `.glass-b`, never `.glass-a`.
9. **AI never acts on its own.** Every AI block carries a `'Căn cứ: …'` line
   and waits for a confirm button. There is a `'Chưa tạo gì cả'` empty state
   directly under the button.
10. **ContextRail is mandatory on every screen** — a row of mono-code chips
    linking the objects of one story
    (`HĐ-2607 → SO-0891 → WO-1180 → PO-0455 → L-2608-042`). Azure chip = the
    object of the story currently open, dim-white chip = related object.
11. **Icons**: Hugeicons Stroke Rounded, stroke 1.75, size 16 in buttons / 20
    in nav. Every glyph goes through the `Icon` gateway of `@pv/ui`; no filled
    icons, no emoji.
12. **Screen background** is exactly 1 layer: the aurora glow — three points
    (`--aurora-1/2/3`) across the top 420px, masked downwards, opacity .55 —
    over `--background`. Gradient is light, never pattern: no grid, no grain,
    no second layer. Placed on the outermost frame of the screen,
    `pointer-events: none`.
13. **Text contrast ≥ 4.5:1** on both `.glass-a` and `.glass-b`. Tablet buttons
    ≥ 48px. Mobile keeps a 34px safe-area.
14. **Display names**: the central product is called **PV One** on every
    screen. Branches keep their English names (Sales · Supply · Factory ·
    Finance) because those are product names; capabilities inside a branch are
    always in Vietnamese — Nhân sự · Tài liệu & quy trình · Công việc · Báo
    cáo · Hiệu suất thiết bị. Do not abbreviate HR, DMS, BI, OEE in the UI.
15. **No AI slop**: the AI Assistant icon is `orbit` (never `sparkles`, never
    `bot`). Number deltas use the Hugeicons `trending-up/down/minus` icons, never
    ▲▼▬. No emoji, no decorative gradient outside the background glow, the AI
    block and the primary button ramp, no
    rounded-card-with-left-border-accent.

---

## Machine-enforced vs. eyes-only

Machine-enforced — a violation fails CI, do not eyeball what the machine
already gates:

| Law                              | Gated by                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------- |
| 1 · color from tokens only       | `aurora/no-raw-hex` + `pnpm tokens:check`                                       |
| 4 · borderless                   | `aurora/no-box-border`                                                          |
| 7 · 8-step spacing               | `aurora/spacing-scale`                                                          |
| 8 · tables on `.glass-b`         | styling layer — `DataTable` does not paint its own glass                        |
| 9 · AI always waits for a button | styling layer (`AiActionProps.basis`) **and** engine layer (`E3.proposeFromAi`) |
| 10 · ContextRail                 | styling layer (`RailObject.onOpen`) + `E1.story()` builds the chain             |
| 11 · icons through `<Icon>`      | `aurora/icon-through-gate`                                                      |
| 15 · no AI slop                  | `aurora/no-ai-slop`                                                             |
| comments in English              | `aurora/comments-in-english`                                                    |

Eyes-only — CI does **not** know these, a human must look:

- **Law 12** — background is the glow and nothing else, no second layer
- **Law 13** — contrast ≥ 4.5:1 on both `.glass-a` and `.glass-b`, in Aurora
  **and** in Đá mịn; tablet buttons ≥ 48px
- **Mail templates** — no compiler renders them and no test runs them, so any
  change in `packages/mail-templates` must be checked with
  `pnpm mail:preview`. Law 13 applies there like everywhere else, and email has
  no tokens so hex must be measured by hand.
