# 0156 · A newcomer's target ramps up from their start date; a leaver's remaining target moves to their receiver

Status: accepted (owner's answers of 15/11/2026, open questions 183 to 186; slice 2c of the KPI plan; applies from
2027-01, December 2026 is untouched; extends ADR 0120)

## Context

In tiered months (ADR 0120) each head types every person's figure and a sent set cannot be resent once a level below
has sent. Nothing knows when a person started, and the account lock (`handoverTo`) moves leads and deals but leaves no
record KPI can read. There is no working-day helper.

## Decision

1. **Start date.** `platform.actor` gains "Ngày vào làm" (a date). The admin sets it on create or edit; blank on create
   stores the creation day. Accounts that exist when this ships keep it empty, and empty means fully ramped.
2. **Working days** are Monday to Friday in Vietnam days, one pure helper in `@pv/contracts` used by web and API.
   Pace and verdicts stay on calendar days (ADR 0100).
3. **Ramp.** The month holding the start date is month 1. Factor 50 % in month 1, 75 % in month 2, 100 % from month 3;
   month 1 is also multiplied by its remaining working days ÷ its working days. It applies to additive lines only;
   ratio, duration and copied lines are untouched.
4. **Suggestion, not rule.** The assignment page shows the ramped figure beside a ramping person's box; the head may
   type anything. The base is the average of the head's current figures for fully ramped holders of the same role in
   the same unit (their sent lines, for a late line); with none, the page suggests nothing.
5. **Joining after the month is sent.** The acting seat of the person's unit adds one line for them through a new
   door, outside the unit-sum check; the unit's received total is not reopened. The person confirms it like any line;
   it is accepted by default (ADR 0114 flag) five days after it was added or on the level's normal day, whichever is
   later. A late line stays out of the unit's sums.
6. **Leaving.** The lock writes a transfer row (month, leaver, receiver, day) in the same transaction. For that month
   the leaver keeps their additive lines × working days before the lock ÷ working days; the receiver gains the rest of
   each line their own scorecard holds. Lines of later months already sent move whole. No receiver: the leaver's lines
   are cut by days and the rest goes nowhere. Results before the lock stay the leaver's.
7. **Role change** applies from the next month with no ramp (question 185); a team move already does (ADR 0101 D7).

## Defaults that are not the owner's

- Monday–Friday with no holiday table: Tết lowers nothing until a holiday list exists.
- Existing accounts stay empty = fully ramped, rather than a back-filled creation date.
- The base of the suggestion and the five-day acceptance of a late line.
- A receiver whose role lacks a metric gains nothing for it.

- A receiver holding the metric in two roles gains it on the first in catalog order.
- The leaver's part is rounded once to a whole number (đồng or count); the receiver gains the remainder.
- A locked or departed receiver counts as none; a second lock fills an empty receiver and keeps the first day.
- Unlocking an account removes its transfers in months not yet closed.
- A newcomer may get a late line once they hold the role in the unit in the month's tree or in the next editable
  version, since org edits after a send land in the next month (ADR 0101 D7).

## Known gaps

- The receiver's confirm card shows their sent lines, not the transferred share their KPI card counts.
- A receiver with no line in the month gains nothing; the head can give them a late line.

## Consequences

One migration: the actor column and the transfer table. New door for a late line; the lock path writes through the
existing `WorkHandover` hook. Proof is a hand-computed acceptance script on PGlite (no unit tests, question 197), one
case per row above, and October–December readings byte-identical before and after.
