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
   person and for the head who committed the unit; never scored. Frozen values only, never adjusted ones.
3. **Total score (4c).** Per metric: % achieved capped at 120 %; a lower-is-better metric scores target ÷ actual,
   capped the same. The primary metric weighs 50 %, the others share 50 % equally; a role with one metric weighs it
   100 %. A metric without a target is left out and the weights re-share. Grades: A ≥ 100, B 85–99, C 70–84, D < 70.
   Weights and bands live in the KPI config and change through its approval flow. Computed on closed months only.
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

## Consequences

One migration: commit, unit commit, 1:1 and 1:1 action tables; one bell kind (CHECK lists rebuilt from the newest
migration that touched them). Config gains weights and grade bands.
