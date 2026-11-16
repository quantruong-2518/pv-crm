# 0158 · Wave 4: weekly forecast commits, a total score with grades, a monthly 1:1, and a year view

Status: accepted (owner's answers of 15/11/2026, open questions 191 to 195; wave 4 of the KPI plan; which screen shows
what to whom is ADR 0159)

## Decision

1. **Weekly commit (4a).** From Monday each week, every Sale and account-executive picks the open opportunities they
   are sure to sign this month; the sum is their commit. The acting seat of their unit (ADR 0117) reviews, may edit
   the unit's number, and commits it. One commit per person and per unit per week; a later save replaces it until
   the week ends.
2. **Accuracy (4b).** At month close, the last commit of each week is compared with the month's closed
   `signed-value`: accuracy = 1 − |commit − actual| ÷ actual (0 when actual is 0 and commit is not). Shown for the
   person and for the head who committed the unit; never scored.
3. **Total score (4c).** Per metric: % achieved capped at 120 %; a lower-is-better metric scores target ÷ actual,
   capped the same. The primary metric weighs 50 %, the others share 50 % equally; a role with one metric weighs it
   100 %. A metric without a target is left out and the weights re-share. Grades: A ≥ 100, B 85–99, C 70–84, D < 70.
   The three grade bands live in the KPI config and change through its approval flow; per-metric weights come with
   ADR 0160. Computed on closed months only.
4. **1:1 (4c).** After a month closes, the acting seat over a person writes one note and up to three actions with a
   due date. The person reads it and presses "Đã trao đổi". Open actions show on "KPI của tôi" until marked done by
   either of them. One 1:1 per person per month, editable until the person acknowledges it.
5. **Bells.** Slip and hit bells stay from day 16 (question 194). One new kind: the person is told when their 1:1 is
   written, through the morning digest of ADR 0145. A missing weekly commit rings nothing; the screen shows it.
6. **Year view (4d)** = sum of twelve months, built exactly like the quarter (ADR 0146). No seasonal factor until
   twelve months of data exist (10/2027).
7. **Loop (4e).** The wave 3 suggestion already reads closed results; forecast accuracy is shown beside it.

## Defaults that are not the owner's

- The accuracy formula, the commit week starting Monday, the 1:1 bell, and re-sharing weights when a target is missing.
- A week belongs to the month holding its Monday, and its commit forecasts that month. A month's accuracy is the
  mean of its weeks' accuracies, over the weeks that hold a commit.
- The company's committed figure takes, per department, the highest level that committed that week: a department's
  commit replaces its teams', a team's replaces its people's, so nothing is counted twice.
- Score and accuracy read the month's frozen card figure (`kpi_month_value`, ADR 0115), which includes the earlier
  months' adjustments that landed in it, never a live reading. The target is read from the closed month's target
  sources, which no door writes after close.
- The score uses the catalog and the grade bands frozen at close (`kpi_month_close.score_basis`); a month closed
  before that column existed uses the current config.
- A commit freezes when its month ends or closes; a week not started yet takes none, and the company node takes none
  of its own (its figure is the departments').
- A lower-is-better metric with an actual of 0 scores the cap.
- The slipping list on the company tab is capped at 10 people; a 1:1 note is at most 2000 characters and an action at
  most 200.
- A line is left out of the score when it has no target, no reading, or a target of 0 on a higher-is-better metric.
- Only people whose scorecard holds `signed-value` record a weekly commit; a unit commits only when it holds such
  people. The 1:1 is written by the acting seat of the person's lowest unit.
- The grade bands are three settings beside the pace tolerance (`kpi.score.*`), changed through the same door. The
  primary metric weighs half until per-metric weights land (ADR 0160).

## Consequences

One migration: commit, unit commit, 1:1 and 1:1 action tables; one bell kind (CHECK lists rebuilt from the newest
migration that touched them). Config gains the grade bands; the close gains `score_basis`.
