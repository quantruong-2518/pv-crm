# 0027 · `opportunity.state` stays hand-typeable and is never derived from quote status

Status: accepted
Source: docs/tam-nhin-bao-gia-hop-dong.md — "§11 · Năm câu treo — đã chốt
30/08 · 4 · `opportunity.state` — VẪN GÕ TAY ĐƯỢC, và KHÔNG suy ra từ báo giá"
and "§7 · Màn" ("Trạng thái đơn phải tự đi theo báo giá")

## Context

Once quotes carry their own status (`nhap`/`da-gui`/`khach-chot`/…), the
question is whether `opportunity.state` should become a column derived from
quote status, since `stage='da-bao-gia'` today only means "somebody clicked
Send" rather than reflecting an actual document.

## Decision

`opportunity.state` **stays hand-typeable**: a verbal quote given over the
phone is a real thing that happens, and a column nobody can type into cannot
record that reality.

More importantly: **`state` must never become a column derived from quote
status.** The two columns answer two different questions — `state` is "what
the salesperson says they're doing" (self-reported), quote status is "where
the paper actually is" (a fact). Forcing one to derive from the other repeats
the exact mistake module 3 already avoided by keeping `state` and `stage` as
two separate columns: the five `state` values only map onto three of the five
`stage` columns, and a `GENERATED` column would wipe out the position of every
deal that doesn't fit.

The `send` route pushes `state` to `gui-quotation` for the common case — one
writer is automatic, one is manual, but it is still **only one column**. Two
writers into one column cannot drift; two columns both answering the same
question is what drifts.

## Consequences

The `send` transaction must update `opportunity.state` and only touch `stage`
when `state` actually changes — same lesson module 3's error #3 already
taught ("saving a deal makes it silently change a column of its own accord").
Skipping this means salespeople must remember to update state in two places,
and the kanban board lies the first time somebody forgets.
