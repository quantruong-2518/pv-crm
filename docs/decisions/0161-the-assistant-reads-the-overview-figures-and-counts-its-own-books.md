# 0161 · The assistant reads the overview figures through `get_performance` and counts the asker's own books through `count_records`

Status: accepted (reverses points 1 and 4 of the 11/11/2026 amendment of 0151; written before the code, built, not shipped)
Date: 2026-11-16
Source: wave 3 of the CRM assistant, on branch `assistant-wave-3`; owner decisions of 16/11/2026

## Context

The 11/11/2026 amendment of ADR 0151 said two things: the assistant reads no
room-scope figures, and no counting tool is planned. The owner reversed both on
16/11/2026, choosing parity with the overview screen (Tổng quan): the assistant
shows room-wide figures exactly as that screen shows them, to whoever the
screen's doors admit. Open question 198 (a counting tool; numbered 183 in the planning doc) is answered yes, on
scoped doors only.

Gate 0 is still OPEN: prompt v15 has never run live. Shipping wave 3 needs the
live run first.

## Decision

### 1 · `get_performance`

Input: `part` (`figures`, `exits`, `money`, `industries`), `grain` (`week`,
`month`, `quarter`, `year`) and optional `at`, a period key that must match the
grain. `at` absent means the current period of that grain on the Vietnam
calendar. A mismatch is a bad input.

Each call names exactly one door and checks only that door's need.

| part         | Door                        | Need               |
| ------------ | --------------------------- | ------------------ |
| `figures`    | performance by period       | `performance.view` |
| `exits`      | performance exits by period | `performance.view` |
| `money`      | performance money by period | `contract.view`    |
| `industries` | industry report             | `campaign.view`    |

- A door that refuses someone refuses them in the tool. `money` keeps the
  door's refusal of an own-only seat.
- `industries` takes only month, quarter or year, and only the current period;
  week, or any `at`, is a bad input. One lead with several industries counts in
  each, so the tool says the rows overlap and the model must never add them up
  to the total. A conversion ratio goes out as a percent field.
- Config text (exit labels, industry names) is untrusted; counts, days and
  money are trusted. Config ids and keys are dropped.
- No codes and no refs: a figure belongs to no record. Industry rows are cut at
  a fixed cap with `more`; the other parts are bounded by their catalogues.

Not wrapped, on the owner's decision: the per-person leaderboard and the money
entries list.

### 2 · `count_records`

Input: `of` (`leads`, `deals`, `journeys`, `lead-sources`); `from` and `to`
only for `lead-sources`, where they are the door's optional range.

| of             | Door                   | Need               |
| -------------- | ---------------------- | ------------------ |
| `leads`        | lead facets            | `lead.view`        |
| `deals`        | opportunity facets     | `opportunity.view` |
| `journeys`     | workstream scorecard   | `workstream.view`  |
| `lead-sources` | lead source statistics | `campaign.view`    |

Every door here already cuts rows to the asker's scope. Each is called with an
empty filter, so the count is the asker's whole visible book, and the answer
says so ("bạn xem được"). Filter-choice lists in the facets are dropped. Stage
names that are config text are untrusted. Source rows are cut at a fixed cap
with `more`. No codes.

Whole-book doors (lead and opportunity scorecards, the histogram, the contract
summary, account facets) are not wrapped: they ignore the asker's scope.

### 3 · Replay gate per input

Replay rechecks a stored call through the permission its tool reveals, read
from the registered spec by tool name. One tool with four doors would replay a
stored money answer under the wrong permission. So `reveals` may be a function
of the stored input, and replay applies it to the input already persisted. No
migration. `get_performance` and `count_records` map `part` and `of` to their
door's permission. The boot check that a tool revealing content names a
permission is kept. The eval proves a stored `money` answer is withheld after
the seat loses `contract.view`, and a stored `figures` answer after it loses
`performance.view`.

### 4 · Units and period labels bind by key name

Same approach as ADR 0151 §6, with two new families and one label rule.

- A trusted number whose key ends in `Vnd` prints as money in VND, whatever the
  enclosing currency.
- A trusted number whose key ends in `Percent` prints as a percent.
- A trusted string under `period`, or a key ending in `Period`, that is a sales
  period key prints as a Vietnamese label: week, month, quarter or year. A year
  stays a string in the tool output, because a bare number would print as a
  count. Buckets carry their period in `key`; the tool renames it to `period`.

The KPI tools already put `period` among trusted fields, so their periods now
print as labels too.

### 5 · Prompt v16

One step per tool: when to use it (room-wide figures of a period, versus counts
of the person's own visible book now), that these are what the overview screen
shows, that industries overlap, and that counts are what the person may see.
The `period` may now be cited. The `get_my_kpi` step now sends room-wide
figures to `get_performance`; `get_my_kpi` itself still carries no room-scope
reading. The rest of v15 is unchanged.

### 6 · The eval

Scope parity for both tools, every role, in the style of `scope-kpi`: the tool
gives what the same seat gets at the door, refusal for refusal. Coverage cases
per part and per `of`. Any coverage case whose rule says the assistant cannot
read room-wide figures or counts is removed or adjusted.

## Amends

- ADR 0151 amendment of 11/11/2026, points 1 and 4: reversed here for room-wide
  figures and counting. The rest of that amendment stands, and `get_my_kpi` is
  unchanged.

## Consequences

- No migration. Ship needs the gate 0 live run first.
- Known limits:
  - `reveals` cannot express `ownOnly` (same class as ADR 0151 §5): a stored
    money answer still replays after the asker becomes own-only, and stored
    counts still replay after a seat's scope narrows. Accepted.
  - An answer cut by scope (a stored `money` or any `count_records` answer) is
    withheld from an own-only reader of another person's chat (`scopeCut`, the
    report list); a chat the reviewer reported and owns is not foreign, so
    the list serves it.
  - An own-only seat holding `performance.view` sees room totals through
    `figures` and `exits`, exactly as the overview screen shows them. This is
    the owner's parity choice.
  - `count_records` cannot count by owner, by month, or by industry for a
    scoped seat, nor contracts by state: no scoped door exists.
- Debt (durations): still open; period labels are handled here.
- Remaining debt: `docs/status.md`.

## Not wrapped, and why

- **Leaderboard and money entries:** the owner excluded them.
- **Whole-book scorecards, histogram, contract summary, account facets:** they
  ignore the asker's scope, so a counting tool over them would leak records the
  asker cannot open.
- **`calculate`, owner or month counts for scoped users, contracts by state:**
  out of scope for this wave.
