# 0118 · One org tree — Company → Department → Team — versioned by month, replaces the KPI team roster from 12/2026

Status: proposed (wave 2a of the KPI plan; supersedes 0101's team editor for months the tree covers)
Source: project owner's decisions of 22/10/2026: tiered targets from 12/2026 (Q1–Q4, Q10, Q11 at their defaults);
Q4 one tree for KPI now and for lead/opportunity visibility later; the holders of `kpi.set-target` edit the tree;
the director heads the company and heads of sales head departments, lifting 0101's ban on those two roles.

## Context

KPI teams (0101) are a flat, KPI-only roster: `kpi_team` + a header per month (`kpi_team_roster`) + members with
a `lead` flag. The roster bars `director` and `head-of-sales`, has no department layer, and drops a team with no
members. Tiered assignment (wave 2b) needs a tree where every level has one head, and Q4 wants the same tree to
drive visibility later, so the tree belongs to the platform, not to KPI.

## Decision

1. **Shape.** A unit is `company`, `department` or `team`. One company per version, at the root; a department's
   parent is the company; a team's parent is a department or the company. Unit ids are stable across versions;
   name and parent live in the version, so a team can move department from one month to the next.
2. **Versioned like the roster.** `platform.org_version` (one header per `from_period`) + `platform.org_node`
   (unit, kind, name, parent per version) + `platform.org_member` (person, unit, `head` per version). The tree in
   force for month P is the header with the greatest `from_period <= P`. Units with no member stay in the tree.
3. **Invariants in the database:** one unit per person per version; at most one head per unit per version; the
   head is a member of that unit; one company per version; a parent exists in the same version. The kind ladder
   (§1) is checked at the door.
4. **Head is not a role** (as 0101 D2). Any active person with the Sales licence may be placed (the licence filter
   goes when visibility reads the tree); the owner's intent (director heads the company, heads of sales head
   departments) is how the tree is filled, not a rule. One guard: a holder of `kpi.view-all` sits in a team unit
   only as its head, or the team's head would read their KPI.
5. **Edits** need a target setter (`kpi.set-target` and `kpi.view-all`, as 0117 default 5), are audited, take the
   roster's advisory lock and land on the first month that is ≥ 2026-12, ≥ this month, and after the last month
   anything was sent for (0101 allocations now, 2b assignments later). Removing a unit that still has members, or
   whose children remain, is refused. A name is a label, not history: a rename applies to every version.
6. **Reading** needs `kpi.view`, scoped as 0101's team read: without `kpi.view-all` a person sees only the units
   on their own path, with members of their own unit; the list of placeable people goes to setters only.
7. **Bridge to the old flow.** For a month the tree covers, the KPI team roster is read from the tree: team units
   with a head are teams, their members are members, their head is the lead; members of a headless team are in no
   team. Months before stay on `kpi_team_roster`, so 10–11 read what they read today, and the old team doors still
   edit membership for those months; an edit that would land on a tree month, or a rename or delete of a team the
   tree holds, is refused (409). Each team unit keeps a `kpi_team` row with the same id and name, so allocation FKs
   and labels resolve. On a database the migration left without a version, the read shows the tree §8 would
   build (with a fixed company id) and the first edit writes exactly that.
8. **Migration** (additive) creates the tree at 2026-12 (or the month after the last month already sent, if
   later): one company, every team of the roster in force then as a team unit under it with the **same uuid**
   (so `kpi_allocation.team_id` still resolves), the same members and the lead as head.

## Defaults that are not the owner's

1. The company unit's name in the migration is "Công ty"; it is renamed in the editor.
2. A team may hang straight under the company (no department layer for a small firm).
3. Members of the company or a department unit (not a team) are not in any KPI team for the old flow.
4. Moving a person removes them from their old unit in the same version; there is no "two units for a while".
5. No bell in this slice.

## Consequences

- `headsOver` (who heads every unit above a person) and the seat rule's fall-through up the tree arrive with 2b,
  which is the first reader of departments; 2a changes no KPI number or bell.
- `kpi_team*` stay for months before the tree; dropping them and their FKs is wave 2e, shipped separately.
- Visibility (Q4) does not read the tree yet; that is a separate slice after KPI.
