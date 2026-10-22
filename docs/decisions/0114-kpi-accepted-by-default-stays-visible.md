# 0114 · A target accepted by default stays visible as such, on every screen and across a reissue

Status: accepted (amends 0100 §B and its default "A reissued package keeps a missed deadline")
Source: KPI plan, wave 1d (`.claude/PLAN-kpi.md`), from the owner's target design of 22/10/2026 ("Nhân viên không
trả lời: coi như nhận như hiện nay, nhưng ghi 'mặc định nhận' thay vì 'đã xác nhận'"). Migration 0135.

## Context

0100 §B: past the answer deadline the given level applies as accepted. The line state `lapsed` is derived on read
(`ackStateOf`, `kpi-rules.ts`) and shows on the person's own package table. Everywhere else it is lost:

- The scorecard folds the lapse moment into `acknowledgedAt`, so "KPI của tôi", the person page, the team table
  and the company exceptions all read "Đã nhận chỉ tiêu lúc …" for a target nobody confirmed.
- A reissue (a counter settled on an agreed package) copies a lapsed line as stored `acknowledged`, so in the new
  version it reads "Đã xác nhận".
- A holder with two confirmed lines and one lapsed shows as lapsed as a whole; the target figures carry no mark.

## Decision

1. `sales.kpi_allocation_line.acked_by_default` (boolean, not null, default false; CHECK: true only when
   `ack_status = 'acknowledged'`). A reissue sets it on a carried lapsed line; every reset to `pending` clears it.
   A stored line with the flag reads `lapsed`, so "lapsed is derived" stays true for every reader.
2. A flagged line cannot be confirmed afterwards; confirming the holder's other lines is not blocked by it.
3. Each reading carries `targetAck` (`acknowledged` · `lapsed` · `pending` · `countered`, null for a role target),
   and the scorecard says whether any line was accepted by default. Screens name the two states apart:
   "Đã xác nhận" vs "Nhận mặc định", in words beside the figure (an icon alone has no meaning on touch). The
   missed deadline is printed where the line itself is listed (the holder's package, the manager's answers);
   readings carry the state only. The company heat map prints no target, so it carries no mark.
4. The manager's per-holder answer and the package badge count lines by state instead of collapsing a holder.

## Defaults that are not the owner's

1. Wording "Nhận mặc định" and the missed-deadline note.
2. A closed month's frozen values do not store the answer state; its screens show the state read live.
3. Packages reissued before 0135 are not backfilled: their carried lines stay `acknowledged`.

## Consequences

- Migration 0135 adds the column and its CHECK (additive).
- The contract comment "lapsed is derived, never stored" now reads "derived from status, deadline and the
  carried flag".
