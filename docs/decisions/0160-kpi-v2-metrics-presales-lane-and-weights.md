# 0160 · KPI v2: Marketing MQL and cost, a Presales lane, funnel step targets and one weight per metric, from 2027-01

Status: accepted (owner redesigned four boards of the canvas "KPI theo vai" and answered eight questions on 16/11/2026,
one more the same day; amends ADR 0158 §score and ADR 0159 §6; input: canvas v2, tracer report of 16/11)

## Context

The owner redrew "Của tôi" for Sale and for Marketing / BD / Presales, "Toàn công ty" and the assignment desk. The
boards need figures the catalog does not hold: MQL, cost per MQL, a Marketing budget, Presales signed value and
solution time, funnel step targets, per-metric weights. December 2026 is being assigned now, so nothing may change
the months before 2027-01.

## Decision

1. **Gate.** `KPI_V2_FROM = '2027-01'`. `catalogFor(period)` returns the v1 catalog before it and the v2 catalog from
   it. Every reader resolves the catalog for a period (`effectiveCatalog(period)`), including the static readers.
2. **Config is versioned by month.** A role's overlay set (enabled, primary, weights, funnel targets) carries
   `from_period`; a month reads the latest set with `from_period ≤ month`. A set before `KPI_V2_FROM` never applies
   to a v2 month (v2 months fall back to the v2 catalog defaults). An approved change applies from the month the
   request names, never earlier than next month.
3. **New metric keys (v2 only):**
   - `mql-reached` (count, own by `lead.marketing_owner_id`): a lead counts in the month it first reaches `mql` or
     above, including leads created or imported at that tier. Lowering and raising again never counts twice. The
     `created` and import touches start recording `toTier`.
   - `lead-to-mql-rate` (ratio, unpaced): `mql-reached ÷ leads-sourced`, same person, same month.
   - `cost-per-mql` (money, lower is better, unpaced): spend (`sales.source_cost` by `spent_on`) of the SOURCE rows
     the person owns (`config_entry.owner_id`) ÷ their `mql-reached`; no MQL → no reading. Not additive.
   - `presales-signed-value` (money, SUM, full contract value): contracts signed in the month whose signing snapshot
     names the person on the PRESALES lane. Sale's credit is not reduced; it never enters `holdsSigned`, the credit
     split, forecast commits, coverage or the company signed total.
   - `on-time-collection-rate` (ratio, unpaced): amount of the month's installments due so far, paid on or before
     their due date ÷ amount due so far, on contracts where the person is on the PRESALES lane.
   - `solution-days` (days, lower is better, median): per opportunity, first `site-visited` touch → first
     `solution-sent` touch, counted in the month of `solution-sent`, for the opportunity's PRESALES people.
   - `win-rate` for presales reads the PRESALES lane (a role override, its own series key).
4. **v2 catalog changes:** Marketing primary `mql-reached`, with `lead-to-mql-rate`, `cost-per-mql`,
   `leads-sourced` on and `lead-to-opportunity-rate`, `sourced-signed-value` default-off. Presales primary
   `presales-signed-value`, with `win-rate`, `on-time-collection-rate`, `solution-days` on and `demos-joined`
   default-off. Other roles unchanged.
5. **PRESALES lane.** `OpportunityOwnerRole` gains `PRESALES` (CHECK on opportunity owners and on the contract
   signing snapshot, which copies the lane). An assign door mirrors the Sale owners door with the same permission.
   The opportunity screen shows and edits the lane. TouchKind gains `solution-sent`, written by a new care
   activity `solution` ("Gửi giải pháp"); like the others, the first one moves an assigned deal to engaged.
6. **Weights.** One weight per enabled metric in a v2 set, summing 100 %. No weights → primary 50 %, the rest equal.
   A pending request without weights gets that default when approved. A line with no target is dropped and the
   others are re-shared in proportion. Weights are frozen into `score_basis` at close. v1 months keep ADR 0158.
7. **Funnel step targets** per role in the same set, through the same approval, never scored; blank = not drawn.
   Steps: Marketing lead → MQL → SQL → opportunity; BD lead received → contacted → SQL → opportunity → accepted by
   Sale; Presales met or surveyed → solution or demo → quotation → signed; Sale its stage pass-through. Each step
   counts its own events in the month; a step's rate is it ÷ the step before.
8. **Marketing budget:** one amount per unit and month (`kpi_marketing_budget`), set by the unit's head, its
   stand-in or a seat above (guarded by `kpi.view` plus that seat rule, as the tiered assignment writes are, since
   only director and head-of-sales hold `kpi.set-target`); not for a month that has ended or before 2027-01. Spent = spend of SOURCE rows owned by the unit's members in the month. Shown, not scored.
9. **Display-only reads** for the boards: six-month trend (v2 keys blank before 2027-01), Marketing table by SOURCE,
   BD lead origin and pipeline created (target 3 × the unit's missing signed value), Presales collection per
   contract, Sale cumulative signed value by day with the forecast line, stage rates beside the unit average.
10. **Toàn công ty** adds a leaderboard of people by % of their own primary target (amends ADR 0159 §6) and unit
    cards with the primary metric plus two of the unit's other metrics.
11. **Copy.** No industry benchmark anywhere. A sentence under a chart is built from a template over real numbers
    (the step furthest under its target, else the largest drop) and states facts, never advice.

## Defaults that are not the owner's

- Reaching `sql` straight from `prospect` counts as reaching MQL.
- No door creates or imports a lead with a tier today, so "created at MQL" counts nothing until one does; the
  `created` touch already records `toTier` when a tier is given.
- `lead-to-mql-rate` divides this month's MQLs by this month's new leads, so it can pass 100 % when older leads
  reach MQL.
- A Presales-only unit has no unit total for `presales-signed-value` (not additive), so its unit card shows no
  primary figure.
- Steps with no data are dropped: Presales "Khách đã liên hệ", BD "Bị trả về" (no decline door exists).
- "Chu kỳ bán" for Presales is not built; `sales-cycle-days` stays Sale's.
- Config approvals apply from next month at the earliest (today they apply at once). A request still waiting when
  its month arrives is refused at approval, not moved; a request stored before this change is dated next month and
  checked against that month's catalog. The config screen offers the next twelve months.
- Weights are all or none. A stored set whose weights do not sum to 100 reads as the default split; the default
  gives rounding leftovers to the first metrics.
- Funnel steps: BD "contacted" counts real exchanges, "lead received" counts hand-overs and leads created for the BD;
  Presales "met" is `first-meeting` or `site-visited`, "solution" is `demo-held` or `solution-sent`; Marketing SQL is
  the first `to_tier = 'sql'`. Funnel reads are live, also for closed months.
- `solution-days` leaves out a deal with no site visit before the solution.
- Sale's forecast line places each picked deal at its expected close, kept inside today … month end; a deal without
  one is left out; a reader who may not see the pipeline gets no line.
- The BD pipeline target is shown only to a reader who may read the unit.
- Marketing spend of a unit includes its child units.
- The Presales door refuses a deal at `new` and one waiting for a sign approval, like the Sale door. Being on the
  PRESALES lane gives that person sight of the deal and its contract.
- Funnel step targets, like weights, start at 2027-01.

## Open

- From day 1 to the first Monday of a month no week can hold a forecast (ADR 0158 week rule).
- `score_basis` written at close has not run for real; prove it with the v2 shape.
