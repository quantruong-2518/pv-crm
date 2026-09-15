# Design system — map

English translation of `docs/luat-thiet-ke.md` (Aurora v2.0), the design
system for PV One. `docs/luat-thiet-ke.md` is slated for deletion in the
16/09 Vietnamese-docs migration; this folder is what replaces it as the single
source for the hard laws.

Two agents rely on these files directly and lose their footing if a section
goes missing:

- `aurora-reviewer` checks law 12 (4-layer background) · law 13 (contrast ≥
  4.5:1, tablet buttons ≥ 48px) · law 8 · 9 · 10 · 14 — none of these are
  gated by CI.
- `screen-builder` reads `laws.md` (fifteen laws) and `tokens.md` (real token
  names) before building any screen.

## Files

| File            | Content                                                                            |
| --------------- | ---------------------------------------------------------------------------------- |
| `laws.md`       | The fifteen hard laws, plus which are machine-gated vs. eyes-only                  |
| `tokens.md`     | Real token names — the copy-paste source for `screen-builder`                      |
| `devices.md`    | The three device frames, sizes, safe areas, button sizes                           |
| `components.md` | The components already built in `@pv/ui`, in build order, with constraints         |
| `screens.md`    | The five PV One screens — purpose, required states, the 03/09 rewrite of screen 01 |
| `checklist.md`  | The pre-PR checklist — which lines CI runs, which line is eyes-only                |

## Old section → new file

| Old section (`docs/luat-thiet-ke.md`)  | New file                           |
| -------------------------------------- | ---------------------------------- |
| §1 · Mười lăm luật cứng                | `docs/design-system/laws.md`       |
| §2 · Token dùng thật                   | `docs/design-system/tokens.md`     |
| §3 · Ba thiết bị là ba vai             | `docs/design-system/devices.md`    |
| §4 · Component dựng trước, theo thứ tự | `docs/design-system/components.md` |
| §7 · Năm màn PV One                    | `docs/design-system/screens.md`    |
| §8 · Checklist trước khi mở PR         | `docs/design-system/checklist.md`  |

`§5` and `§6` do not exist in the source file — its own numbering runs
§1 → §2 → §3 → §4 → §7 → §8; there is no §5 or §6 to account for.
