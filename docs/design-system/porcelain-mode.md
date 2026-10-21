# Sứ — the third theme

The third mode — `data-theme="porcelain"`, display name "Sứ". Light, rounded and soft. Why it exists and the palette sources: `docs/decisions/0108-third-theme-porcelain.md`. Spec: a Design System artifact (private), https://claude.ai/artifact/VKjoJmRr1tGTx9brMJQSes.

## How users pick it

The header theme switch and the "Giao diện" row of the account menu cycle Aurora → Đá mịn → Sứ. The choice is stored under `pv-theme`. The script in `apps/web/index.html` reads it before first paint.

## Material

- A cool grey page (`#f2f4f6`) with the aurora glow in its pastel light column.
- Panels are white. `--border` is transparent (law 4); edges come from the shadows.
- `.glass-a` carries a sheen — a translucent overlay (2.5% `--surface-ink` fading to transparent at 40%) over `--card`, so a `bg-*` tint still shows through — and the bevelled elevation-2 shadow; `hover:shadow-card` rows use Sứ's own elevation; `.glass-b` stays flat on elevation 1.
- The AI wash is a light blue gradient.
- Radius 8 / 12 / 16, and 24 for modal and drawer.
- Inter for text, Pretendard for Hangul.
- The tokens live in `packages/tokens/globals.css`, under `:root[data-theme='porcelain']`.

## The type remap

In Sứ only, the off-scale sizes the screens use are lifted to 12 / 13 / 14 (11 and 11.5 → 12, 12.5 → 13, 13.5 → 14). Every `tracking-*` class resolves to 0. Uppercase is kept where the owner chose it. The remap table sits at the end of `globals.css`; no screen class was edited.

## What was checked

Full `pnpm check` passed on this branch. The built app was loaded in headless Chromium at `/kit` and `/sign-in`, with a stub API answering health checks. Computed styles were compared across the three themes:

- Aurora and Đá mịn values were unchanged: radius 6 / 4 / 3px, their shadows and their colours.
- Sứ resolved to radius 16 / 12 / 8, the Inter stack, the `.glass-a` sheen with elevation 2, and remapped sizes (11.5 → 12, 12.5 → 13). Tracking was 0.

Screenshots of `/kit` and `/sign-in` in Sứ were looked at. Not yet checked: signed-in screens with real data, tablet, mobile.
