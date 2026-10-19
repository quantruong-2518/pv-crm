# 0100 · KPI follow-ups: pace tolerance, acknowledgement deadline, overdue reasons and month close

Status: accepted (supersedes 0082 §4's "no tolerance margin"; supersedes 0099 §6's bullets on the acknowledgement deadline, "only the director approves" and a manager–subordinate relation; supersedes 0082 §1 decision 3's "no team or manager relation", the team part being decided here and built in a later round; supersedes 0082 §3's snapshot metric carrying a figure only for the running month; closes questions 36, 37 and 38)
Source: project owner's decisions of 19/10/2026, taken one question at a time; the last section lists what is not the owner's

## Context

0082, 0098 and 0099 left a list of KPI points deferred to the project owner:
a tolerance on the pace verdict (question 38), the acknowledgement deadline,
who approves a package, a manager relation, and how an overdue instalment is
scored once someone has explained it. The owner has now answered each.

## Decision

### A · The pace verdict gets a tolerance margin

The owner: yes, a tolerance margin on the pace verdict, editable in the KPI
config, default 0 %. At 0 % the verdict is the one 0082 §4 describes. The margin
only widens "on track" against the pace expected so far; met, missed,
lower-is-better and the weekly series are unchanged. It is written through the
existing `kpi-alert` config change, beside the slip and hit thresholds of 0099 §3.

### B · The acknowledgement deadline exists

The owner: the deadline exists; it is set in days by whoever hands out the
package; past it the head's level applies as accepted. A person who has not
answered by then can no longer confirm or counter. A line the person has
already countered is not lapsed: its counter stays in the manager's hands.
Packages made before this decision have no deadline.

### C1 · An overdue instalment needs a reason from the contract's Sale

The owner: the Sale on the contract must give a reason for an overdue
instalment and it must be approved. The approver is the head of sales or the
director, never the person who wrote it. At the month-end KPI lock, an overdue
instalment without an approved reason counts as-is.

"Overdue" is one definition for the reason and for the KPI reading: unpaid and
past its due day in Vietnam time; due today is not overdue. A reason explains
one due date: if the due date is edited, the reason stops applying. Approval is
a new permission, `contract.approve-overdue-reason`, held by the director and
the head of sales and nobody else by default. The writer and the approver are
each told through the bell.

### C2 · "Chốt tháng" freezes the whole month

The owner: the month is locked when the head or the director presses
"Chốt tháng" (manual, no date rule). The lock freezes the WHOLE month's KPI,
not only overdue receivables. Until it is pressed, an ended month is still
live. The button needs `kpi.set-target`, so it is the head and the director.
The lock can only be pressed once the month has ended, and a locked month shows
the figure as of its last day.

### Kept as built

- Allocation approval stays as 0082 §5 and 0099 §4b: any `kpi.set-target`
  holder other than the last setter. The owner: the 0099 §6 "only the director
  approves" is not wanted.
- The cap of 50 contribution records and the 80 / 90 slip / hit defaults are
  now owner-approved (0099 §6 last bullet).
- KPI is not linked to pay (question 36). Accountant and delivery do not become
  roles (question 37).
- Every enabled metric stays scored; there is no "1 main + 1 guardrail" rule.

### D · Teams with a team lead (decided, NOT built in this round)

The owner wants teams with a team lead. This reverses "no team or manager
relation" in 0082 §1, 0098 §5 and 0099 §6. For now it is KPI only. Two tiers:
room → team → person, where the sums must match; people in no team are split
by the head. The head of sales and the director create teams. One team per
person. It is a later round with its own migrations; nothing of it exists yet.

## Defaults that are not the owner's

Taken by the implementer; change them by amending this ADR.

- No bell when an acknowledgement lapses; the page shows it.
- No unlock after "Chốt tháng".
- A rejected reason may be rewritten; an approved reason stops applying when
  the due date changes.
- Approved reasons also lift the amount from the running month's live figure.
- Tolerance bounds 0–99 %; acknowledgement days 1–31.
- Reason and rejection note are capped at 500 characters, the same ceiling as
  the KPI counter reason.
- Both overdue-reason bell kinds are "important" (they pop up).
- A reason binds to the exact due it explains; when the due moves, the old row
  stays as stale history (never deleted) and the Sale writes a new one.
- The approve permission implies company-wide reach: decide and the waiting
  list are not fenced by contract scope, so granting it to an own-only role
  would widen that role's reach.
- The overdue reason is its own small approval, deliberately not an E3
  `platform.approval` request: it does not appear in the generic approvals
  inbox and is not counted by `approval-turnaround-hours`.
- The month-close dialog's count of waiting reasons is shown only to people who
  hold the approve permission (head and director by default).
- A reissued package keeps a missed deadline: lines that lapsed stay accepted.

## Consequences

- Migration 0117 adds the tolerance setting key. Migration 0118 adds the
  acknowledgement days to `sales.kpi_allocation`. Migration 0119 adds
  `sales.installment_overdue_reason` and the two bell kinds
  `overdue-reason-waiting` and `overdue-reason-decided`. Migration 0120 adds
  `sales.kpi_month_close` and `sales.kpi_month_value`.
- New permission `contract.approve-overdue-reason`. "Chốt tháng" reuses
  `kpi.set-target`.
- 0082 §2's "no snapshot table" is now false for the closed month: values of a
  closed month are read from `kpi_month_value`. The contribution list and the
  weekly series stay live and say so on a closed month.
- Questions 36, 37 and 38 are answered in `open-questions.md`.
- Known gap: the overdue-day rule is Vietnam calendar days in the reason door,
  the KPI reading and the waiting list; the existing hourly overdue bell
  sweeper and the web due badge still read UTC calendar days (pre-existing,
  not changed in this round), so for up to 7 hours around midnight the badge
  and bell can disagree with the reason door. A later round should move them
  onto one shared helper.
- Part D adds a table and screens in a later round.
