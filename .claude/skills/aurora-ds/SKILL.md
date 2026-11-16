---
name: aurora-ds
description: pv-crm design-system cheat sheet — the one lookup before writing or reviewing UI: token → class, glass surfaces, spacing, the sixteen laws with who enforces each, three themes, three devices. Use when building, changing or reviewing any screen or component in apps/web or packages/ui, and when picking a colour, radius, spacing or status look.
---

# Aurora — build UI the laws accept

Lookup, not a spec. The laws are `docs/design-system/laws.md`; the real token
names are `docs/design-system/tokens.md`; the values live in exactly one file,
`packages/tokens/globals.css`. This sheet writes **no hex**: a colour is a class,
and a class that is not below means a token is missing — **ask, don't invent**
(`pnpm tokens:check` refuses a `var(--x)` that does not exist).

## 1 · Token → class

Tailwind 4 reads the tokens through `@theme`; every name below is `bg-`, `text-`
or `ring-` plus the token.

| Role                                     | Class                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------- |
| Screen background                        | `bg-background`                                                       |
| Panel (card, table, popover)             | `bg-card` — through `.glass-a` / `.glass-b`                           |
| Nested surface, table head, hover row    | `bg-muted`                                                            |
| Control ground (input, secondary button) | `bg-input`                                                            |
| Text · secondary · third level           | `text-foreground` · `text-muted-foreground` · `text-glass-foreground` |
| Brand background (AI, primary, active)   | `bg-primary` · pressed ramp `bg-primary-strong`                       |
| Brand text · brand tint                  | `text-accent-foreground` · `bg-accent`                                |
| Success · warning · danger               | `bg-success` · `bg-warning` · `bg-destructive`                        |
| Text **inside** a tinted block           | `text-on-tint-*` (law 1 — never a new tint)                           |
| Focus ring                               | `ring-ring`                                                           |

Border and radius: no border on boxes (`--border` is transparent; edges come from
shadow). Radius by role — card `rounded-lg`, control `rounded-md`, tag
`rounded-sm`; `rounded-full` only for status dots, avatars and the assistant
button. Type: one family for text and numbers, `font-mono` for object codes,
`tabular-nums` on every number, sentence case, no uppercase, no tracking.
Spacing: the eight steps 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 (Tailwind `1 2 3 4 5 6 8 12`).

## 2 · Surfaces

| Surface                         | Use                                                                |
| ------------------------------- | ------------------------------------------------------------------ |
| `.glass-a` / `<GlassCard>`      | cards, KPI, hero cell, main panel                                  |
| `.glass-b`                      | tables, long lists, side rail — `DataTable` paints none of its own |
| `.glass-overlay`                | what floats above content: nav dropdown, `Drawer`                  |
| `.glass-ai` / `.glass-ai-panel` | the AI block, always with its `Căn cứ:` line                       |

The screen background is one layer — `<AuroraField>` on the outermost frame
(law 12). A screen inside a frame that already paints it paints nothing.

## 3 · Three themes, three devices

**Themes**: Aurora (dark, default), Đá mịn (`data-theme="stone"`), Sứ
(`data-theme="porcelain"`) — same token names, different values; Sứ also moves
radius and font. Check contrast in all three. Variants: `stone:` and `porcelain:`.

**Devices** (frames in `docs/design-system/devices.md`): desktop is the office,
deep logic · tablet is the field, kiosk — no sidebar, **every target ≥ 48px**
(`pointer-coarse:h-12`, the convention across `@pv/ui`) · mobile is the pocket,
bottom nav and a safe area. A screen states which device it is for.

## 4 · The sixteen laws, one line each

**Machine-gated** — a violation fails `pnpm check`; do not eyeball them.

| Law | Rule                                           | Gate                                       |
| --- | ---------------------------------------------- | ------------------------------------------ |
| 1   | colour only from tokens                        | `aurora/no-raw-hex` · `pnpm tokens:check`  |
| 4   | borderless                                     | `aurora/no-box-border`                     |
| 7   | spacing on the eight steps                     | `aurora/spacing-scale`                     |
| 8   | tables and long lists on `.glass-b`            | the styling layer                          |
| 9   | AI waits for a button, `Căn cứ:` always        | `AiActionProps.basis` · `E3.proposeFromAi` |
| 10  | every screen has a ContextRail                 | `RailObject.onOpen` · `E1.story()`         |
| 11  | icons only through `<Icon>`                    | `aurora/icon-through-gate`                 |
| 15  | no AI slop: no emoji, no ▲▼, no stray gradient | `aurora/no-ai-slop`                        |

**Eyes-only** — CI is blind, you look (`screen-inspector` measures them in a
browser, `aurora-reviewer` reads them from code):

| Law | Rule                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------ |
| 12  | background is the one glow layer, nothing else                                                         |
| 13  | text contrast ≥ 4.5:1 on `.glass-a` and `.glass-b`, in all three themes; tablet targets ≥ 48px         |
| 16  | object status is a text pill (`Badge`), never a bare dot; `StatusDot` marks timelines and legends only |

**Human-read, no gate** — `aurora-reviewer` and your own eye: 2 · 3 (blue and
slate are never text on dark; brand blue is background-only — brand text is
`text-accent-foreground`) · 5 radius · 6 type · 14 product names (PV One;
branches keep English names; never abbreviate HR, DMS, BI, OEE).

On-screen text has its own file, `docs/design-system/ui-copy.md`; `i18n-add`
carries the string into three languages.

## 5 · Done when

```bash
pnpm check:fast        # format · types · lint — the machine-gated laws
pnpm tokens:check      # after touching a token or a var(--…)
```

Then say which eyes-only laws you looked at and which you did not — "chưa soát
luật 13" is a valid line, silence is not. A screen new to `@pv/ui` also gets one
line on the kit page (`packages/ui/CLAUDE.md`).
