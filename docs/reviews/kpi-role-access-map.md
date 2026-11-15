# KPI role access map (15/11/2026)

Traced from origin/master `9b270b69` as input to the per-role KPI screen redesign.
Grants are the defaults in `packages/engines/src/e2-access.ts`; production roles may differ
(an admin can change them after the seeder plants them once).

## How a KPI read is gated

- Every route is `@Need({ branch: 'Sales', ... })` with `kpi.view`, `kpi.view-all` or `kpi.set-target`.
- `ownOnly` matters in one place only: forecast pipeline lines need `opportunity.view && !ownOnly`
  (`kpi-forecast-sight.ts`).
- Most real gating is in services: `readsPerson` (self, `kpi.view-all`, roster lead or acting lead,
  org head above, or acting head) and the seat rule of ADR 0117 (holder → stand-in → head above → setters).
- Months ≥ `TIERED_FROM` (2026-12) refuse the old write doors (409) and the assignment doors refuse older months.

## What each role reaches (default grants)

| Role                        | Nav                                                                               | Reach                                       | Overlays                                         |
| --------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| director, head-of-sales     | KPI của tôi · KPI công ty · Chỉ tiêu tháng · Tình trạng giao · Thiết lập bán hàng | every KPI screen, targets, close, org edits | company / department seat on `/sales/kpi/assign` |
| sale, bd, marketing         | KPI của tôi · Thiết lập bán hàng (read)                                           | `/me`, own person page                      | team lead or unit head: links from `/me` only    |
| presales, account-executive | KPI của tôi                                                                       | `/me` only, never the org tree              | same lead / head overlays                        |

## UI reachability holes

1. "Tình trạng giao" needs `kpi.view-all` in the nav, but the route and API also admit the company seat.
2. Team leads and unit heads have no nav entry; `/me` links only, and the assign link probes role `sale` only.
3. Stand-ins cannot act in tiered months: the assign page picks the unit where the caller is `head`, so it 404s.
4. A head above opens a lower unit's assign desk read-only with nothing to act on.
5. Company and Targets still fire old-model reads in tiered months and show "Chờ bạn xử lý" with no items.
6. "Bạn chỉ có quyền xem." on Targets is unreachable under default grants.
7. The same per-person numbers render on the company heatmap, team page and person page.
8. Presales and account-executive never see the org tree; account-executive lacks `performance.view`.
9. Absence doors are all `kpi.view`; the real split (`kpi.set-target`) lives only in the service.
10. `/me` still calls `GET :period/allocations` in tiered months, where it drives nothing.
11. Org writes: the guard needs `kpi.set-target`, the service also needs `kpi.view-all`.
12. Assign and assign-status drop a role silently when its query fails.

No route was found without a permission, and every traced write leaves an audit row
(`config.propose` not checked). The holes are reachability, not data leaks.
