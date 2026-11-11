# 0151 · The assistant reads the KPI screens through `get_my_kpi` and `get_team_kpi`, one permission each, and carries no weighted pipeline outside the asker's own lines

Status: accepted (not shipped)
Date: 2026-11-11
Source: slice 4 of the series opened by 0142; design in the session handoff of 11/11/2026

## Context

Slice 4 answers "how am I doing this month or quarter" and "who in the team is
behind". Code: `apps/api/src/branches/sales/assistant/get-my-kpi.ts`,
`get-team-kpi.ts`, `kpi-read.ts`, the binder keys in
`apps/api/src/platform/assistant/assistant-bind.ts`, prompt v11
(`apps/api/src/platform/ai/prompts/assistant.prompts.ts`), eval
`apps/api/src/scripts/ai-eval/scope-kpi*.ts` and `seed-kpi.ts`, cases in
`assistant-cases.json` (coverage-03 flipped to positive, coverage-14 and 15 new).
Gate 0 is still OPEN. Open questions 179 to 182 (ADR 0143) are unanswered here.

## Decision

### 1 · Two tools, one permission each

Every KPI figure is an aggregate with no record code, so a stored answer carries
`codes: []` and a code re-check cannot close its replay. Replay is closed by
`reveals` plus `revealsContent` instead: `get_my_kpi` reveals `kpi.view`,
`get_team_kpi` reveals `kpi.view-all`. Neither has `recheck` or `revealReach`:
the KPI doors write no content audit, so a withheld replay writes no view row.

### 2 · `get_my_kpi {period: month | quarter, at?}`

Doors: `KpiController.me`, `KpiForecastController.mine` (optional),
`KpiQuarterController.me`. No input can name another person.

### 3 · `get_team_kpi {at?, team?}`

Owner decision: only `kpi.view-all` holders. The run refuses unless
`KpiController.people` is open, even though the roster and team-view doors need
only `kpi.view`. Doors: people, forecast for everyone, team roster, team view.
Month only. The trusted `behind` flag is per person; behind and missed come first,
cut at 20 with `more`. The team name is matched NFC, case-insensitive, with a
leading "nhóm " stripped.

### 4 · Never reached

Company KPI, targets, target history and contributions. The services are typed
`Pick<>` records, so a door outside the list does not compile.

### 5 · Weighted pipeline (ADR 0143 section 5)

`reveals` cannot say "`opportunity.view` without `ownOnly`", so a stored answer
holding another seat's pipeline would replay after the reader lost it.

- `get_team_kpi` carries no pipeline.
- `get_my_kpi` carries `pipelineMoney` only on the asker's own-scope money lines
  (the owner always sees their own; this is the replay fix for the ADR 0143
  section 5 rule, separate from the room-metric hide in the KPI worktree). It is
  left out when the forecast's pipeline is null, which means it does not apply
  (closed or future month, no signed-value holder). A null is never turned into
  0; a true zero (no open deals due) is shown as 0. Never summed.

### 6 · Units bind by key name

New money keys (`valueMoney`, `targetMoney`, ...) and percent keys (`valuePercent`,
...); ratios 0 to 1 are scaled to percent; money rows carry `currency: 'VND'`.
Durations and period labels rely on the prompt.

### 7 · The eval

Scope group `scope-kpi` asks the doors under the seat's name. The seed covers
`signed-value` only.

## Consequences

- Room-scope metrics: on 11/11 the owner decided (in the KPI restructure
  worktree) to hide them from readers without `kpi.view-all`. That rule must live
  in `KpiService.me`, and in the person and team view, so the tool inherits it.
  This slice depends on that work.
- Open for the owner, before that change merges: a seat that held `kpi.view-all`
  and later lost it still gets its stored room-scope answers replayed, because
  `reveals` is fixed per tool. Options: per-answer `reveals` in the platform, or
  no room-scope readings in `get_my_kpi`.
- Debt (durations, period labels): a binder key family or a period formatter.
- Remaining debt: `docs/status.md`.
- Gate 0 command is unchanged from 0142.
