# 0112 · The KPI screens are merged by job, and the bell loop of 0099 and 0101 is closed

Status: accepted (updates 0082 §7; renames the screens 0099 §4 mentions; amends 0101 default 7 and its page-access statement)
Source: project owner's decisions of 16/10/2026 (screen merge) and 20/10/2026 (member page for the team lead, three bells, phone/tablet). Migration 0133.

## Context

After 0097–0101 the KPI menu held six entries, plus "Thống kê phòng" and a
per-person page off-menu. The same package was touched on three screens, and one
question ("what is waiting on me?") had no single answer. 0099 and 0101 also left
bells undone: nobody was rung when a package was sent for approval, when a
counter was proposed, or when a month ended unclosed.

## Decision (the owner's)

### A · Split by job, not by role

Giám đốc and Trưởng phòng hold the same KPI rights, so a screen per role would
show the same work twice. Screens are cut by what the viewer is doing. The nav
keeps three KPI items:

- "KPI của tôi" (`/sales/kpi/me`) absorbs "Nhận chỉ tiêu" (`/receive`): a
  "Chỉ tiêu được giao" section to confirm or counter. Reads `?month=`. A team
  lead sees a count of team items waiting.
- "KPI công ty" (`/sales/kpi/company`) absorbs "Thống kê phòng" (`/department`):
  attention list, ranked heat map. One person's KPI moves to
  `/sales/kpi/company/:actorId` (screen gate `kpi.view`; the API decides).
- "Chỉ tiêu tháng" (`/sales/kpi/targets`, `kpi.view-all`) absorbs "Đặt chỉ tiêu
  và duyệt", "Phân bổ chỉ tiêu" (`/allocation`) and "Xử lý đề xuất"
  (`/proposals`). First a "Chờ bạn xử lý" list: role targets to agree, packages
  to decide, returned room packages, open counters, overdue reasons waiting for
  whoever holds `contract.approve-overdue-reason`, the ended month to close. Then
  the per-role steps.
- "Chốt tháng" is pressed only on "Chỉ tiêu tháng". "KPI công ty" shows the
  closed line only: one action in one place.
- Old URLs redirect (`LEGACY_PATHS` in `routes.tsx`): `/receive` → `/me`,
  `/department` → `/company`, `/allocation` and `/proposals` → `/targets`,
  `/person/:id` → `/company/:id`.
- The team page `/sales/kpi/team/:teamId` is unchanged; member names open the
  member page.

### B · A team lead can open a member's KPI page

New `GET /sales/kpi/:period/people/:actorId` and
`GET /sales/kpi/:period/forecast/people/:actorId`, both `kpi.view`. One rule: the
reader is that person, holds `kpi.view-all`, or leads that person's team in that
month's roster (the rule contributions and history already used).

### C · Three new bells (migration 0133)

Migration 0133 widens the two `kind` CHECKs to the list of 0132 plus these three.

| Kind                     | Weight        | Fires                                                                         | To                                              |
| ------------------------ | ------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| `kpi-allocation-waiting` | important     | a package (room or team tier) is sent                                         | every `kpi.set-target` holder except the sender |
| `kpi-counter-proposed`   | not important | a counter is proposed                                                         | see below                                       |
| `kpi-month-unclosed`     | important     | once, on the first daily sweep of the next month, for the previous month only | `kpi.set-target` holders                        |

- Counter recipients: room tier → `kpi.set-target` holders; team tier → only the
  team's lead (owner: "Chỉ trưởng nhóm"); the lead's own counter, or a disabled
  lead → `kpi.set-target` holders.
- `kpi-month-unclosed` opens "Chỉ tiêu tháng". Owner: "Một lần, ngày 1".
- "`kpi.set-target` holders" in this table means holders who also have
  `kpi.view-all`: the `kpi-allocation` subject opens on `kpi.view-all`, and the
  hub drops a line its reader could not open.
- The room-tier "package returned" bell now carries the role in its link. This
  closes the debt the unmerged draft of this ADR recorded.

### D · Phone and tablet

Wide KPI tables become stacked cards below `md` / `lg`.

## Defaults that are not the owner's

1. Which of the three kinds are important (table above).
2. `kpi-month-unclosed` lands on "Chỉ tiêu tháng".
3. The redirects of A stay indefinitely; they are cheap.
4. `kpi-month-unclosed` skips a month with no agreed role target: nothing was
   set, so there is nothing to close.

## Consequences

- 0082 §7 (two screens), 0099 §4 (bell kinds and the `kpi-target` link opening
  "Nhận chỉ tiêu") and 0101 (default 7 "One new bell only"; the statement that
  nobody outside the team sees the team page, now read with B) carry pointers here.
- A bell link to a bare `<period>` now opens "KPI của tôi" at that month.
- Ship order: migrate 0133 before deploying the API.
