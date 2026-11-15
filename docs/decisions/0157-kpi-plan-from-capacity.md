# 0157 · Wave 3: the assignment page suggests from closed results, leading indicators are shown and never scored

Status: accepted (owner's answers of 15/11/2026, open questions 189 and 190; wave 3 of the KPI plan; extends ADR 0120
and 0156; which screen shows what to whom is ADR 0159)

## Context

A head assigning December types each figure with only last month's result beside it (ADR 0120 §12). Nothing tells a
seller what the target means in deals and quotes, and a metric's meaning lives only in ADRs.

## Decision

1. **Metric dictionary (3a).** Every catalog metric carries a one-sentence "how it is counted" in the product
   language, defined once in `@pv/contracts` beside the labels, shown on every KPI card and in the KPI config. A
   metric whose reading has no SQL in the API cannot be switched on (the config door refuses it).
2. **Leading indicators (3b), shown, never scored:**
   - pipeline coverage = weighted open pipeline expected to close this month ÷ signed-value target still missing,
     flagged under 3×;
   - win rate per stage over the last three closed months (deals that left a stage won ÷ deals that left it);
   - new qualified opportunities this month.
     Ratios sum numerators and denominators before dividing. They are read only for people whose scorecard holds
     `signed-value` (sale, account-executive) and for heads over them.
3. **Suggestion (3c).** Beside each person's additive box: average of their last three closed months × ramp
   (ADR 0156). With fewer than three closed months: "chưa đủ dữ liệu" and last month's figure. Beside it the person's
   weighted pipeline and the coverage flag. A suggestion is never written into the box.
4. **"Kế hoạch của tôi" (3d)** is computed backwards from the person's remaining signed-value target with their own
   average deal size and stage win rates: deals to win, opportunities to open, quotes to send. The person enters
   nothing. Fewer than three won deals in three closed months → "chưa đủ dữ liệu", no figures.
5. **Tolerance** stays the config value of ADR 0100 §A; nothing to build.

## Defaults that are not the owner's

- The 3× threshold, the three-month window, and the "fewer than three won deals" floor.
- The pipeline in 3b and 3c follows ADR 0143's sight rule: a reader without `opportunity.view` or with own-only
  scope sees the coverage flag but not the money.

## Consequences

Read-side only: no migration. New reads on the KPI module, reusing the readings and forecast SQL.
