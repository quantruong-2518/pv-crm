# 0164 · The assistant lists open deals through `list_deals` and answers "what should we do next"

Status: accepted (built on branch `ceo-questions`, not merged, not shipped; gate 0 still open)
Date: 2026-11-18
Source: five questions a director seat asked; owner decisions of 18/11/2026

## Context

Five director questions failed: focus this week, which deals are at risk and
why, the next step on one deal, a Korean follow-up draft plus the next task,
and a pipeline summary for a Korean CEO. `list_my_work` and the stale-deal read
cover only the asker's own deals, so a director saw nothing of the room.

## Decision

### 1 · `list_deals`

- Open opportunities across the room through the opportunity book door, read
  as the asker: a director sees the room, a sale only their scope.
- Focus: stale, step-due, closing. Sort: amount, expectedClose, quiet. Stale,
  step-due and quiet filter in memory over a wider read and say `more`.
- Each row carries `stageOverdueBy` and `stageLimitDays` from the stage's
  configured limit, so the model never judges "too long in stage" itself.
- No `mine` option: the asker's own deals stay `list_my_work`'s job. A merged
  two-lane read would mis-sort mixed currencies.
- Scope is proven by the ai-eval `scope-deals` matrix.

### 2 · Prompt v19

- `propose_next_step` may answer "what should we do next" on one record, after
  reading `get_record` and `get_history`. The due day is one agreed in the
  history, else `nextWorkingDay`, which the server puts in the context line
  (Monday to Friday, as `working-days.ts`), so the model never computes a date.
- A customer email draft is allowed. It sends nothing and holds only cited
  values.
- A text for someone else (an email, a message, or a summary for a named
  person) may be in a named language other than the chat's. Periods are named
  in words there, because a period cite prints in the chat language.

## Amends

- ADR 0162: "propose only when the person asks for a change to a step" no
  longer holds for the next-step question on one record.
- ADR 0163: "kept for the whole chat" no longer holds for a text written for
  someone else.

## Consequences

- No migration. Ship needs the gate 0 live run first.
- Known limit: money and date cites inside such a text still print in the chat
  language's format.
- The eval seed has no deal amounts, next steps or activity, so stale,
  step-due and quiet are proven by unit tests only.
- Remaining debt: `docs/status.md`.
