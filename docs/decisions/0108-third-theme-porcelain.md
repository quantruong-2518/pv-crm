# 0108 · A third theme, Sứ (`porcelain`): light, rounded and soft, built in `@pv/ui` beside Aurora and Đá mịn

Status: accepted
Source: project owner's decision, 21/10/2026

## Context

Two themes exist: Aurora (dark, default) and Đá mịn (`stone`, light, flat and
restrained). The owner approved a third: a light, rounded, soft surface with a
modern Korean-SaaS feel. The spec is a Design System artifact (private):
https://claude.ai/artifact/VKjoJmRr1tGTx9brMJQSes — linked, not copied.

## Decision

### 1 · One more theme id, chosen freely

Theme id `porcelain`, display name "Sứ". Tokens live under
`:root[data-theme='porcelain']` in `packages/tokens/globals.css`, built inside
`@pv/ui` beside the other two. Users pick it in the header theme switch and the
account menu. It is not tied to the language setting.

### 2 · Palette

Sources: Toss TDS greys and blues (grey100, grey700, grey900, blue700, blue800,
blue900); KRDS (Korean government design system) status colours, 60 and 70
steps; `--glass-foreground` and `--channel-meeting` kept from Đá mịn; aurora
glow points `#c9e2ff`, `#c6ece8`, `#d9f1e6`; Wanted Montage for the scrim and
the control rings. Every elevation shadow value was designed in the PV One Sứ
design-system artifact (the link in Context).

| Group             | Tokens                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces and text | `--background` `#f2f4f6` · `--card` and `--popover` `#ffffff` · `--foreground` `#191f28` · `--muted-foreground` `#4e5968` · `--glass-foreground` `#5d6882`                                                                                                                                                                                                                                                                               |
| Brand             | `--primary` `#1b64da` (white on it 5.41:1) · `--primary-strong` `#1957c2` · `--accent` `#e8f3ff` · `--accent-foreground` `#194aa6`                                                                                                                                                                                                                                                                                                       |
| Status            | `--destructive` `#bd2c0f` · `--warning` `#8a5c00` · `--success` `#267337`                                                                                                                                                                                                                                                                                                                                                                |
| Fills and lines   | `--secondary` `#e5e8eb` (Toss grey200) · `--secondary-hover` `#d1d6db` (grey300) · `--muted` `#f9fafb` (grey50) · `--input` `#f2f4f6` (grey100) · `--channel-phone` `#194aa6` (blue900) · `--hc-border` `#4e5968` (grey700) · `--scrim` rgba(23,23,25,.52) (Wanted Montage "dimmer") · `--shadow-control` / `--shadow-control-soft` rgba(112,115,124,.22/.14) (Wanted Montage "line-normal") · `--border` is `transparent` in Sứ (law 4) |
| Text on tints     | `--on-tint-success` `#285d33` · `--on-tint-warning` `#614100` · `--on-tint-destructive` and `--destructive-foreground` `#8a240f`                                                                                                                                                                                                                                                                                                         |

`--glass-foreground` reaches only 3.81:1 on `--secondary-hover`, but nothing
paints that pair; the only user carries `secondary-foreground`, at 11.3:1.

The `--on-tint-*` tokens are one step darker than the status tones because
`@pv/ui` paints tints as `bg-<tone>/20`. KRDS 60-step text on its own 20% tint
measured 4.30–4.39:1 on white, below law 13; the 70-step measures 5.8–7.0:1.

### 3 · Radius, per theme through variables

`--radius-sm` 8px (tags, badges) · `--radius-md` 12px (buttons, inputs) ·
`--radius-lg` 16px (cards, panels) · `--radius-2xl` 24px. EVERY `rounded-2xl`
is 24px in Sứ, including the overview cards on home; modal and drawer opt in
with a `porcelain:` variant. Aurora and Đá mịn keep 3, 4 and 6px. `rounded-full` stays reserved for dots,
avatars and the FAB.

### 4 · Elevation

Ink-tinted (rgba of `#191f28`): a hairline edge ring plus a contact shadow plus
a spread, all `box-shadow`, never borders (law 4 holds).

- `--shadow-panel` (glass-b: tables, lists, forms) is elevation 1.
- `--shadow-card` (glass-a: KPI, bento) is elevation 2, with a 1px inner bottom
  shade (the "bevel").
- `--shadow-pop` and `--shadow-dock` are elevation 3.
- `--shadow-frame` is elevation 4.

### 5 · Gradients

Allowed in porcelain: the existing background glow (law 12 unchanged: three
pastel points, one layer); the existing primary button ramp; the AI wash
(`#e8f3ff` to `#ffffff`, 135° on `.glass-ai`, 150° on `.glass-ai-panel`); NEW,
a sheen on `.glass-a` only: a translucent overlay, 2.5% `--surface-ink` at the
bottom fading to transparent at 40%, painted as `background-image` over
`--card`, so a `bg-*` tint on a glass-a still shows through it. Tables stay
flat on `.glass-b`.

On the overview, a card wash replaces the glass-a sheen — see ADR 0106 §5a.

### 6 · Font

- Porcelain sets text in Inter (Google Fonts, which has a Vietnamese subset),
  with Pretendard as the Hangul fallback. Pretendard's Latin is drawn from
  Inter, so mixed lines match.
- Pretendard is NOT usable as the first face: its Korean build lacks 101
  Vietnamese codepoints.
- Pretendard sits after the Latin face in the sans, display and number stacks
  (not mono) in ALL three themes. It draws what that face lacks, chiefly
  Hangul. It is loaded from jsDelivr only for `ko`, pinned with SRI
  (`integrity` sha384 plus `crossorigin`). The variable dynamic-subset CSS is
  53,513 bytes raw and 13,061 bytes gzipped (measured with curl on 21/10).
- Korean text gets `word-break: keep-all` in every theme.

### 7 · Type remap, porcelain only

- Arbitrary sizes 11px and 11.5px render at 12px; 12.5px at 13px; 13.5px at
  14px.
- ALL `tracking-*` classes resolve to `letter-spacing: 0` in Sứ, through one
  attribute selector, because Vietnamese is never letter-spaced.
- `.uppercase` is NOT neutralised. Uppercase stays where the owner chose it:
  account-card company names (16/10) and screen and book titles.
- This touches the class sites across `packages/ui` and `apps/web` without
  editing them; count them with
  `grep -rhoE "text-\[(11|11\.5|12\.5|13\.5)px\]" packages/ui/src apps/web/src | wc -l`.
  It is done by a remap table in `globals.css`.
- Limits: the 10px and 10.5px sizes are untouched; variant-prefixed forms
  (`md:text-[11px]`) are not remapped.

### 7a · Component fixes

- ChannelTag's warning tone now uses `text-on-tint-warning`, identical in
  Aurora and Đá mịn. Its default tone uses `muted-foreground` in Sứ.
- Badge `draft` uses a /20 slate tint in Sứ.

### 8 · Laws waived or changed for porcelain

- **Law 1.** A new palette table, from the sources in §2.
- **Law 5.** Radius values per theme (§3).
- **Law 6.** Inter instead of Be Vietnam Pro in porcelain, Pretendard after
  the Latin face everywhere, tracking removed in porcelain (uppercase kept).
- **Law 15.** The glass-a sheen is a new gradient place.
- **Law 13** now covers THREE themes: contrast is measured in Aurora, Đá mịn
  and Sứ.
- **Law 12** is unchanged.

## Out of scope — follow-ups, not built

- The blue gradient 2×2 hero cell from the spec (it lives in page code, not
  `@pv/ui`).
- The floating BottomNav.
- Avatar initials.
- The per-component size changes of the spec beyond the remap.
- `--channel-meeting` `#0a6f68` measures 4.49:1 on its 14% tint over the page
  ground in Sứ. A darker teal token is needed; none is invented. Owner's call.
- Đá mịn has the same latent bug Sứ fixed: `hover:shadow-card` on DataTable
  rows paints Aurora's dark inlined shadow. Fixing it there changes Đá mịn, so
  it is the owner's call.
- The kit's radius, type and spacing specs (F-04, F-05, F-06) show Aurora's
  values in every theme.
- NavItem keeps a fixed 38px height with no `truncate`.

The theme's own page in `docs/design-system/` is written after the code lands.
