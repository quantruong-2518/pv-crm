# packages/ui — where to go, don't re-litigate rules already in the root CLAUDE.md

Four zones, in the order src/index.ts exports them:

- `ui/` — atoms (A-01…A-20): button, input, badge, icon... no business state of its own
- `patterns/` — molecules (M-01…M-12): a few atoms composed together, still no engine knowledge
- `organisms/` — larger compositions (O-02…O-07), usually tied to one specific screen block
- `layout/` — foundations + templates (AuroraField, GlassCard, AppShell, Drawer...)

Doesn't know `@pv/engines`, doesn't know the app — data comes in through props
(package boundary, see root CLAUDE.md). Adding a component: put it in the
right zone → export it in `index.ts` under the matching `// ---- Zone NN ----`
comment → add one line to the kit page `apps/web/src/kit/zone-*.tsx`. Skip the
third step and the component doesn't count as existing.

Rules 1·4·7·8·9·11·15 (color, borders, spacing, glass, AI-waits-for-button,
icons, no AI slop) — full text in `docs/luat-thiet-ke.md §1`, not repeated
here so it can't drift from the source.
