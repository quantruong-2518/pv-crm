# The five PV One screens — purpose and required states

Source: `docs/luat-thiet-ke.md` §7.

The reference mockups are gone; this is the spec kept for rebuilding them.

| #   | Screen                       | States the code must have                                                                                                                                                                                                          |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | **Home / Overview**          | TWO TIERS. Room tier: 1 hero 2×2 (cash line) + 4 KPI + 2 alert cards + pipeline by stage + funnel + headcount table. Personal tier: the logged-in person's own overdue tasks + AI strip. Empty state when nothing needs attention. |
| 02  | **Approval inbox**           | list grouped by type · 3-block detail (why / AI quote table / impact if approved today) · E3 approval chain · E2 audit trail. States: `waiting` ↔ `approved`.                                                                      |
| 03  | **Global search**            | 1 query → 4 sources, 1 list merged by relevance. Must have a **"Hidden by your permissions"** row + a request-access button. Changes by who's viewing (Sales Lead vs. Director).                                                   |
| 04  | **AI Assistant**             | right panel 420px ↔ 760px, overlays the brief + scrim `rgba(3,7,16,.52)`. Suggestion card sticky to the bottom, collapsible. States: `pending` ↔ `done`.                                                                           |
| 05  | **Notifications & channels** | rule table (event → threshold → channel → cadence → role) · send log with a `blocked-duplicate` line · real Zalo OA ↔ Email preview · "unsaved" dirty state.                                                                       |

Screen 01 is built (`apps/web/src/pages/home.tsx`). The other four are not.

> **Screen 01 changed shape on 03/09.** The old build was a morning brief for
> one manufacturing story: the hero was the lifecycle of one sales order
> `SO-0891`, the four KPIs included equipment efficiency and receivables, the
> two alert cards were about a CNC machine. None of that had a table, an
> endpoint, or a screen behind it — `apps/api` only has a `sales` branch,
> `routes.tsx` has no Supply/Factory/Finance route — and every number was typed
> straight into JSX.
>
> The new build reads three real ledgers (lead · opportunity · contract) and
> splits into two tiers because the two tiers answer two different questions:
> the top tier is the whole room's numbers, **not** scoped to the viewer; the
> bottom tier is the logged-in person's own overdue work. Merging them would
> let the word "pipeline" carry two meanings under one label.
>
> The hero is still exactly ONE 2×2 cell (law from §3 devices, desktop row),
> but its content is the **cash line** — open · signed · collected · overdue
> collection — not one order's lifecycle. Those four are not four stages of one
> funnel and the label must not call them a funnel: they share a unit, not a
> denominator.
>
> `/` is the ONE route that declares no `permission`, so every block asks E2
> for its own permission (`enabled` on each query) and the screen states which
> block is hidden. A marketing account with neither `opportunity.view` nor
> `contract.view` — firing the query unconditionally would turn their home
> screen into a wall of errors.
