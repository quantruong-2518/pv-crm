# 0082 · KPI is scored per role from recorded facts, against an agreed, versioned monthly target

Status: accepted
Source: project owner's decisions in chat, 09/10/2026

## Context

A KPI model existed only as a frozen fixture: `ROLE_KPI_MODEL` in
`packages/engines/src/fixtures/das-vina.ts`, read by the "Hiệu suất" screen
(`/sales/performance`). The database had no target store and no period-aware
reading per person. Three definitions of "won" disagreed: the leaderboard
counts a deal that has a contract, the workstream scorecard counts a run
closed `WON` off the lead's signature, and the fixture counts a lead carrying
a contract code.

## Decision

### 1 · Four owner decisions

1. KPI is per ROLE. A person holding two roles carries both scorecards. No
   per-person targets.
2. v1 is a scoreboard plus an agreed, versioned target. No pay, bonus or
   commission maths.
3. Scope is own / whole room (the existing two levels). No team or manager
   relation.
4. v1 covers the seven existing roles. Accountant and delivery are documented
   only (§8).

### 2 · Ground rules

- Only what the system recorded counts. No self-reported numbers; nobody edits
  a reading.
- Each role has 1–5 metrics in four layers: `activity` ("Hành động") →
  `conversion` ("Chuyển đổi") → `result` ("Kết quả"), plus `guardrail`
  ("Giới hạn phải giữ") that stops a result being gamed (signed value ↔ overdue
  receivables). Exactly one metric per role is its primary.
- Colour follows pace to date, not the full-month target.
- No target agreed → the number still shows, verdict `unset`. No invented
  default targets.
- "Won" has ONE definition everywhere in KPI: the deal has a contract row.
- Compute on read. No poller, no worker, no snapshot table (Neon compute
  quota).
- The period is one calendar month, edges on Vietnam days, the same edges as
  `apps/api/src/branches/sales/performance/performance-period.ts`.
- If a definition cannot be built from real columns it is not approximated
  silently: the metric is returned with no value and reported.

### 3 · The roles and what each is scored on

In workflow order. Own = filtered on the actor; room = the whole Sales book.

| Role                | Primary metric               | Other metrics                                                 | Guardrail                    |
| ------------------- | ---------------------------- | ------------------------------------------------------------- | ---------------------------- |
| `marketing`         | `leads-sourced` (own)        | `lead-to-opportunity-rate` · `sourced-signed-value` (own)     | —                            |
| `bd`                | `opportunities-opened` (own) | `opportunity-accept-rate` (own)                               | `first-response-hours` (own) |
| `presales`          | `demos-joined` (own)         | —                                                             | —                            |
| `sale`              | `signed-value` (own)         | `win-rate` · `debriefs-closed` (own)                          | `overdue-receivables` (own)  |
| `account-executive` | `signed-value` (own)         | `opportunities-opened` · `debriefs-closed` · `win-rate` (own) | `overdue-receivables` (own)  |
| `head-of-sales`     | `signed-value` (room)        | `win-rate` (room) · `accept-lag-days` (own)                   | `overdue-receivables` (room) |
| `director`          | `signed-value` (room)        | `collected-value` · `approval-turnaround-hours` (room)        | `overdue-receivables` (room) |

- The `head-of-sales` and `director` scorecards carry room figures by role.
- `opportunities-opened` for the `account-executive` seat counts a deal where
  the actor is on EITHER lane (that seat stands on the SALE lane); for `bd` it
  stays the BD lane.
- `first-response-hours` takes a `contacted`, `exchange-logged` or
  `first-meeting` touch as the response. A lead that reached the actor and has
  not been answered counts up to now, or to the month's end once the month has
  closed — ignoring a lead must not improve the figure, and a closed month
  stops moving.
- A snapshot metric (`overdue-receivables`) carries a figure only for the
  running month; a closed or future month reads `no-data`.

The definition of each metric, its unit, direction and whether it is paced are
the catalog in code, not here: `packages/contracts/src/sales/kpi.ts` and the
API module `apps/api/src/branches/sales/kpi/`.

### 3a · What each role does, and what the system reads

| Role                | The action                                                                                                       | The recorded fact the metric reads                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `marketing`         | Bring the lead into the book under your own name, with its origin and campaign                                   | The lead's `marketing_owner_id` and `created_at` (`leads-sourced`)                                   |
|                     | Follow which of your leads became a deal and which were signed                                                   | Deal and contract rows on that lead (`lead-to-opportunity-rate`, `sourced-signed-value`)             |
| `bd`                | Record the first contact as soon as a lead reaches you: an exchange, a contact, or the first meeting on the lead | The first such touch carrying your actor (`first-response-hours`)                                    |
|                     | Open the deal when the lead qualifies and stand on its BD lane                                                   | The deal row and its BD owner (`opportunities-opened`)                                               |
|                     | Hand the head a deal complete enough to accept                                                                   | `accepted_at` on the deal (`opportunity-accept-rate`)                                                |
| `presales`          | Be added as an attendee of the meeting, and have the meeting marked held with you attended                       | The meeting's `held_at` and your attendee row's `attended` (`demos-joined`)                          |
| `sale`              | Close every exchange record with its summary, evaluation and next step                                           | Debriefs you own with `closed_at` set (`debriefs-closed`)                                            |
|                     | Raise the sign request when the deal is won, and stop a lost deal with its reason instead of leaving it open     | Contract rows and closed deals on your SALE lane (`signed-value`, `win-rate`)                        |
|                     | Chase instalments before their due date                                                                          | Unpaid instalments past `due` on your contracts (`overdue-receivables`)                              |
| `account-executive` | The `bd` and `sale` actions together                                                                             | As those two rows                                                                                    |
| `head-of-sales`     | Accept new deals promptly and assign the seller                                                                  | `accepted_at` − `created_at` on the deal (`accept-lag-days`)                                         |
|                     | Send next month's targets before the month starts                                                                | —                                                                                                    |
|                     | Run the weekly 30-minute review from the "Cần chú ý" block                                                       | —                                                                                                    |
| `director`          | Approve targets and sign requests promptly                                                                       | `decided_at` − `raised_at` on the approval (`approval-turnaround-hours`)                             |
|                     | Watch collected cash and overdue receivables for the room                                                        | Instalments' `paid_at` (`collected-value`) and unpaid instalments past `due` (`overdue-receivables`) |

### 4 · The verdict

A reading is compared with the agreed target, and for a paced metric in an
open month with the target scaled by the share of the month's days gone:
higher-is-better is `met` at or above target, else `on-track` at or above that
pace and `behind` under it, and `missed` once the month is closed;
lower-is-better is `met` at or under target, else `behind` (open) or `missed`
(closed). A reading with no value is `no-data`, one with no agreed target is
`unset`, and there is no tolerance margin — a margin would be an invented
threshold.

### 5 · Who proposes, agrees and acknowledges a target

A target is set per role × calendar month × metric. One manager proposes, a
DIFFERENT manager agrees; an agreed target is locked. Changing it writes a new
version. Every holder of the role acknowledges the agreed targets ("Tôi đã
nhận chỉ tiêu"). An acknowledgement older than the newest agreed target is
stale.

On screen the two-person change uses the product's existing words, "gửi đề
nghị" → "duyệt", as in sales config and the sign drawer. What the server
enforces:

- Proposing is per metric.
- Approval is refused as a whole when any pending row of the role is the
  caller's.
- Approval locks only what the approver saw: a proposal replaced after their
  read is refused, and nothing is agreed.
- A closed month takes no more proposing, approving or acknowledging; the
  running month and future months are open.
- A ratio target above 1 is refused.

Proposing and agreeing sit on `kpi.set-target`; reading one's own scorecard
and acknowledging on `kpi.view`; reading every person's on `kpi.view-all`.

### 6 · Review cadence

Daily personal view · weekly 30-minute review of activity metrics · monthly
result close · quarterly target renegotiation.

### 7 · Screens

"KPI của tôi" (`/sales/kpi/me`) and "KPI công ty" (`/sales/kpi/company`). Both read
the live API only — no fixture, no scenario.

### 8 · Not measurable yet

KPIs the CRM cannot score, each with the fact it is missing:

- **Accountant and delivery roles** — neither has a seat, and a payment
  records no actor and no partial amount.
- **Quote count, discount rate, presales demo → quote** — there is no quote
  table.
- **On-time follow-up rate** — next-step rows are deleted on completion.
- **Hand-off SLA as a stored fact** — there is no lead state history and no
  first-response column; `first-response-hours` is rebuilt from touches.
- **Credit split by time held** — opportunity owner history has no
  timestamps.
- **Comm activity as effort** — comm activity is manual capture, so a count
  measures logging discipline.
- **A "behind pace" alert** — there is no in-app notification store.
- **Anything paid out** — the commission split is still open (out of scope in
  ADR 0071).

Measurable in code but with nothing to read yet, as observed on the local
data on 09/10/2026:

- **First-response time** — the seed's `contacted` touches carry no actor
  (the live write paths do record one), so on demo data the figure rests on
  few rows.
- **The activity metrics** — no meeting is marked held, no attendee is marked
  attended and no debrief is closed, so they read zero until those are used.

## Basis

- Activities → objectives → results tiers:
  [Jordan & Vazzana, Cracking the Sales Management Code](https://salesmanagement.org/blog/cracking-the-sales-management-code-the-secrets-to-measuring-and-managing-sales-performance/).
- Controllable input metrics:
  [How Amazon uses input metrics](https://www.holistics.io/blog/how-amazon-uses-input-metrics).
- 4DX lead measures, scoreboard and weekly cadence:
  [OKR vs 4DX](https://www.perdoo.com/blog/okr-vs-4dx/).
- Paired counter-metrics against gaming:
  [Four types of Goodhart's law](https://holistics.io/blog/four-types-goodharts-law).
- Goals not linked to pay in v1:
  [OKRs separate from pay](https://www.whatmatters.com/stories/okrs-separate-pay-compensation-bonuses).

## Consequences

- The fixture-backed "Hiệu suất" screen (`/sales/performance`) still exists
  beside the two new screens, with its own KPI model. Whether to retire it is
  not decided (question 35).
- The leaderboard and the workstream scorecard keep their own "won"; only KPI
  is bound to §2's definition.
- Debt: money metrics drop a contract with no amount or an unknown currency,
  unlike the overview, which reports them as blank.
- Debt: two managers who each hold a pending row of the same role block each
  other until one re-sends the other's metric (§5).
- Migration number 0095 may collide with another branch.
- Quarter periods are not supported for KPI: the period key is a month only,
  and a quarter key is refused.

## Open

Not decided; each is a numbered question in `open-questions.md`:

- Retiring the fixture "Hiệu suất" screen (question 35).
- Pay linkage and the commission split (question 36).
- Accountant and delivery roles (question 37).
- A tolerance margin on the pace verdict (question 38).
