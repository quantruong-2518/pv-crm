# 0159 · KPI is one menu entry with three tabs, each shown only to whoever holds that work

Status: accepted (owner approved the canvas "KPI theo vai" on 16/11/2026 with no comments; places the screens of
ADR 0155 to 0158; input: `docs/reviews/kpi-role-access-map.md`)

## Context

KPI has four menu entries (KPI của tôi, KPI công ty, Chỉ tiêu tháng, Tình trạng giao). Team leads and unit heads have
none and reach their work through links on "KPI của tôi"; a stand-in cannot open the assignment desk in tiered months;
the same per-person table renders on three screens. Waves 3 and 4 add a weekly forecast, a score, a 1:1 and a plan,
which need a home per role.

## Decision

1. **One entry "KPI"** opening "Của tôi". Three tabs at the top of every KPI screen:
   - **Của tôi**: everyone with `kpi.view`.
   - **Đơn vị của tôi**: only when, in the selected month, the caller heads a unit or acts for its head (ADR 0117
     seat rule): org-tree units from `TIERED_FROM`, roster teams before it. Several units → a picker. A stand-in sees
     one line naming whom they act for and until when.
   - **Toàn công ty**: `kpi.view-all`, or the company seat (hole 1).
     A tab the caller does not hold is not drawn. The server decides the tabs: `GET /sales/kpi/:period/desk` returns
     the units the caller acts for (holder or stand-in, and for whom), the company flag, and the members table of the
     chosen unit. The web never probes a role to guess a tab (hole 2).
2. **Every tab starts with "Cần làm hôm nay"**: only actions the caller can take today, each with its button. The
   strip is not drawn when empty; "Chờ bạn xử lý" with nothing under it is gone (hole 5).
3. **Của tôi**, in order: today's actions (weekly forecast on Mondays, open 1:1 actions, a target to confirm) → the
   primary metric with pace → last closed month's score and grade → metric cards, each with its "how it is counted"
   line → for holders of `signed-value` only: "Kế hoạch của tôi", pipeline coverage, stage win rates, the weekly
   forecast form → contributions. A Tháng / Quý / Năm switch heads the page.
4. **Đơn vị của tôi**: today's actions (commit the unit forecast, members who have not recorded theirs, 1:1s to
   write) → unit totals with coverage and last month's forecast accuracy → members table (role, primary metric, pace,
   coverage, last score; a name opens the person page) → the unit's weekly forecast (shown only when the unit holds
   sale or account-executive people) → 1:1 status. In a month being assigned, the assignment desk with suggestions
   (ADR 0157) and late joiners (ADR 0156) take the top; every role of the unit can be assigned, not only `sale`.
5. **Toàn công ty**: today's actions (month close, company assignment) → company totals with the committed forecast
   → units table (head or stand-in, primary metric, pace, coverage, average score, forecast state; a row opens the
   unit as its head sees it, read-only) → people slipping on their primary metric, sorted by the gap. Links to "Tình
   trạng giao" and, for months before `TIERED_FROM`, the old "Chỉ tiêu tháng".
6. **One per-person table**, in "Đơn vị của tôi" (and, by unit, in "Toàn công ty"). The person page opens from there
   (hole 7).
7. **A head above** who opens a lower unit's desk sees it read-only with one line naming who assigns it (hole 4).
8. **Each card loads on its own**: a failed read shows its error inside that card, never an empty page or a silently
   missing role (hole 12). Tiered months never call the old-model reads (holes 5, 10).

## Not changed

- No screen or route is deleted before 2027-01 (slice 2e). Removed menu entries stay reachable by URL and from the
  tabs; November 2026 is an old-model month and closes in December, so the old screens must keep working.
- Holes 6, 8, 9 and 11 stay: they are permission splits the services already enforce, and presales and
  account-executive not seeing the org tree is intended.

## Consequences

One new read (`desk`); the KPI pages move under one tab shell; the menu loses three entries. Builds with waves 3 and 4.
