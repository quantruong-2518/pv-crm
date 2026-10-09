# 0080 · Next-step templates and a free-entry flag become per-state config; the state sets stay closed

Status: accepted (replaces 0071 §12; adds to 0074 §4's `STEP_KIND` list; leaves 0057 §3, 0058 and 0072 §2 untouched)
Source: project owner's decisions in chat, 08/10/2026

## Context

Sales people must always work inside one company framework. The sales
configuration screen gets a "Khung hành trình" area structured phase › state ›
next step. Two ways to build it were costed and the owner chose the first:
keep the state SETS closed in code and make only the per-state RULES data.
The second, opening the sets, is deferred (§6).

## Decision

### 1 · Next-step templates per state

For each (object kind: lead | opportunity, state key) config holds an ordered,
switch-off-able list of templates: a name, a step kind (a row of the existing
`STEP_KIND` list, 0074 §4) and a default due in days. The step card's picker
reads these instead of the hard-coded web lists (`DEAL_STEP_SUGGESTIONS` in
`apps/web/src/data/deal-next-step.ts`, `LEAD_SUGGESTIONS` in
`apps/web/src/pages/lead-model.ts`). This replaces 0071 §12 ("Per-stage
next-step suggestions are display data in the web").

### 2 · Free entry is a per-state flag

Each state carries a flag: whether a seller may type a step outside the list.
Default: allowed. The server enforces it on the next-step write doors and on
the comm close-out hook (0074 §7), not only by hiding the text box.

### 3 · The deal-stage deadline stays on `limitDays`

The deadline of a deal stage stays where it already is, `limitDays` on the
`STAGE` config list (0057 §3). The config screen shows it in the journey
frame; no second column is created for the same fact, and the screen stops
showing deadlines in two places.

### 4 · Edits go through the existing approval door

Template and rule edits use the same propose → director-approves door as every
other sales config change (`config.propose`, an approval row as the audit
trail). Reading templates for the picker needs its own read door on
`lead.view` / `opportunity.view`, because presales and account-executive hold
`opportunity.edit` but not `config.view`.

### 5 · A finished step remembers its template

Which template a finished step came from survives the step row being deleted
on "done": it is carried on the `next-step-done` touch, the way 0070 carried
`reason_id` on the stop's activity row.

### 6 · Opening the state sets is a separate project

The owner wants admin-added, reordered and switched-off states later, as its
own project. It is not folded in here because the sets are hand-copied into
Postgres CHECKs and the `workstream_stand()` SQL function, joined to config
rows by position in three places, and every state mover is hard-wired to named
states. It will need its own ADR superseding 0057 §3, 0058 and 0072 §2. Not
designed here.

## Consequences

- The `LeadState` enum and the four `StageKey` stages (0072 §2) stay exactly
  as they are; only the rules hanging on them are data.
- Presales and account-executive read templates without `config.view`.
- A template renamed or switched off later does not rewrite history: the
  touch keeps the template it came from (§5).

## Superseded

- **0071 §12** — "Per-stage next-step suggestions are display data in the
  web."

## Open

Raised in the same session, not decided; each is a numbered question in
`open-questions.md`:

- "Next step required" per state, soft or hard (question 30).
- Auto-creating a step on entering a state (question 31).
- Finishing a step advancing the state (question 32).
- A per-state deadline for lead states (question 33).
- Renaming a state (question 34).
