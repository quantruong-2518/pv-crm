# 0149 · Foreign-currency money converts to VND at the Vietcombank transfer-buying rate of the day it happened

Status: accepted (amends 0022, 0077, 0082, 0115, 0119, 0124, 0143)
Source: project owner's decisions, 11/11/2026, asked one by one in chat. Found in a money audit the same day.

## Context

One constant, `USD_VND` = 26,400 (`packages/contracts/src/sales/currency.ts`), is the only conversion rate and is
applied at read time. Nothing stores the rate that was true when a contract was signed, an installment was paid or a
refund was made. Changing the constant would rewrite every closed KPI month (0115 says a closed month never moves),
and a figure never says which rate it used.

## Decision

1. **Rate.** The Vietcombank transfer-buying rate ("Transfer" attribute of the bank's published XML feed). Only USD
   today; VND is rate 1 and has no rows.
2. **Event day, per figure** (Vietnam calendar day, Asia/Ho_Chi_Minh):
   - contract value (signed total, book, trend, leaderboard, account signed): `contract.signed_at`
   - collected installment (collected moves, after-sale collected, summary collected, settled): `paid_at` of the installment
   - refund (negative terminated row): `terminated_at` of the termination
   - penalty: `penalty_settled_on`; while unsettled, today's rate
   - unpaid installments (overdue, due-unpaid, upcoming, due-soon, scheduled-unpaid), open deal amounts, weighted
     pipeline, sign drawer preview: today's rate, marked provisional ("tạm tính")
3. **A day with no stored rate** (weekend, holiday, feed down) uses the nearest earlier stored day.
4. **Storage.** Table `platform.fx_rate`, primary key (currency, day); columns: rate (> 0), source (`vietcombank` ·
   `manual` · `legacy`), who set it (manual only), when it was fetched. Backfill: one `legacy` row for 2000-01-01 at
   26,400, so every past event resolves to 26,400 and no closed KPI month moves.
5. **Fetch.** A daily sweeper takes the feed from 09:00 Vietnam time, at most one success per Vietnam day, retrying on
   worker ticks (no faster than every 15 minutes) until 17:00. A `manual` row for the day is never overwritten.
   5 s timeout; a failure never throws into the tick.
6. **Correct.** A holder of `setting.manage` sets a day's rate by hand (source `manual`); each correction writes one
   audit row with the old and new rate. The same permission lists rows, newest first, with source. Any signed-in user
   may read today's rate (what the client uses for provisional previews).
7. **Alert.** If the latest `vietcombank` or `manual` USD row is more than 3 Vietnam calendar days old, holders of
   `setting.manage` get one in-app bell per stale streak (new kind `fx-rate-missing`).
8. **Display.** Only on foreign-currency rows, under the converted figure: "≈ 132.000.000 ₫ · tỷ giá 26.400 ngày 12/10"
   (provisional: "· tạm tính theo tỷ giá 26.400 ngày 11/11"). On summary cards (home revenue, KPI tiles) the rate
   shows only on hover, in the per-entry peek. VND rows show nothing new.

Same turn, bug: the overdue bell sent the raw contract-currency amount as `amountVnd` and the banner printed it as ₫.
The bell detail now carries `amount` and `currency`, and the banner prints in that currency.

## Consequences

- A later correction of a day's rate changes the live basis of a closed month; the KPI reconcile pass of 0115 books
  the difference as an adjustment in the running month. Closed months stay frozen.
- The feed allows one request per 5 minutes and gives no history: a missed day cannot be fetched later, only set by
  hand or carried from the nearest earlier day.
- Past figures all read 26,400 until a real rate is stored for their day; only new events carry real rates.

## Out of scope

Locking a contract amount to its quote, unifying the "collected" rules, overdue escalation, an upcoming-due reminder,
VAT, invoices.

## Decisions taken during the build

The owner did not rule on the first five or on `set_by`; they are the builder's choice. The KPI overdue conversion day and the plausibility guard were decided by the owner on 11/11/2026.

- A manual rate is refused for a future day, and for any day before the first fetched or typed row: filling a past gap
  would reprice every later day and move closed months; old data stays on the default.
- The default (`legacy`) row cannot be edited.
- KPI overdue receivables of a past month convert at that month's `as_of` day, not today (owner,
  11/11/2026).
- The opportunity book shows the original-currency amount and the rate under the dong figure, not a repeated dong
  figure.
- Won and lost deals on the opportunity book convert at today's rate (an estimate).
- `set_by` is text (the actor id type), not uuid.
- Plausibility guard (owner, 11/11/2026): a typed rate is refused when it differs by more than 20% from the nearest
  earlier stored row. Manual PUT only, not the fetch. Built in `apps/api/src/platform/fx/fx-rate.service.ts`.
- Local reset-staff and seed drop typed (`manual`) rates, because `set_by` references a deleted actor.

## Status of the work

Built on branch `fx-daily-rate`, not committed yet: migration 0166, `apps/api/src/branches/sales/money.ts`,
`apps/api/src/platform/fx/`, screen `/admin/fx-rates`. Debt is in `docs/status.md`.
