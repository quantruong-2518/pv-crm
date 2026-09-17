# Stone — the light mode

The second mode — the `light` theme of Pebble Aurora, shipped under the name the header already uses. Asked for on 16/09/2026: a light, restrained, minimal surface for office sales users. Aurora is the default; the user switches with the Aurora / "Đá mịn" button in the app header or on the sign-in screen. The choice is stored under `pv-theme` in the browser and stays in sync across tabs.

## Material and colour

- A cool grey page (`bg-000` `#EEF1F6`) with the aurora glow in its pastel light column; no grain, no grid.
- Content surfaces are white, opaque, never blurred; a shallow shadow does the layering.
- Ink text `#0F172A`; brand `#2451D6` for actions, links and selected regions.
- Be Vietnam Pro for body, headings and numbers; numbers still align on tabular numerals.
- The tokens live in `packages/tokens/globals.css`, under `:root[data-theme='stone']`.
- `surface-ink` is the tint shared by secondary backgrounds, dividers and hover states: white in Aurora, ink in Đá mịn. It does not change the white text on a primary button or on an avatar.
- The logo switches itself to the existing blue asset set.

## What was checked

TypeScript web, web build, ESLint over the interface, token drift and CSS coverage. Checked in the browser at `/kit` and `/sign-in`: switching both modes, the choice surviving a reload, desktop at 1536px and the sign-in screen at mobile 390px. The API was not running for this pass; the signed-out response was stubbed separately in the test browser.

Since 17/09/2026 it carries the light column of the Pebble Aurora token table; the mode needs almost no CSS of its own any more, because the panel classes read `--card` and `--shadow-panel` in both themes.
