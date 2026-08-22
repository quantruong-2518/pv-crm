# packages/engines — the real E1–E4 table lives in src/index.ts, read that first

The doc comment at the top of `index.ts` is the source of truth for "which
engine owns what" — don't copy that table here, it will drift. Which file to
open, by task:

- editing object relationships/lifecycle → `e1-object-graph.ts`
- checking permissions or writing an audit entry → `e2-access.ts`
- adding a new approval request type → `e3-approvals.ts`
- adding an event that needs to notify someone → `e4-notifications.ts`
- aggregate numbers for dashboards → `stats.ts`

No React dependency (that's what keeps this engine reusable on a real backend
later) — don't import from `react` or `@pv/ui` here, not even for convenience.

`fixtures/` holds the FROZEN data for the two scenarios (Sao Do, DAS Vina) —
every locked-in number is pinned by `fixtures/scenario.test.ts`. Need a new
number? Add it to the fixture with a test, don't hardcode it into a screen
(see root CLAUDE.md, "Dữ liệu" section).
