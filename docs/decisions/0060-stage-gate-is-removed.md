# 0060 · Stage-gate is removed

Status: accepted (supersedes 0057 §6; retires migration 0047_stage_gate.sql)
Source: project owner's decision in session, 20/09/2026

## Context

ADR 0057 §6 let stage-gate criteria block exactly two actions: moving a deal
to a later stage, and signing. Refusal came back as a 409 with
`errors.criteria` listing the missing labels.

Seeded data showed what that enforcement actually covered: all four criteria
that ever existed — "Ngân sách", "Người quyết định", "Timeline", "Pain
point" — were seeded onto a single stage, `discovery`
(`apps/api/src/seed-config.ts`) <!--ctx:ignore-->. Verified on the live tree
just before the drop migration ran: `sales.stage_criterion` held exactly 4
rows, all four on `discovery`, none on any other stage — a closed,
point-in-time fact about the table that is now gone, not a count anyone
should expect still to hold. Two tables (`sales.stage_criterion`,
`sales.opportunity_criterion_tick`), three API doors, a config-screen section
and a contracts file existed to enforce a rule that, in practice, gated one
rung of one ladder.

Worse, the two ends of the feature lived on different screens. The refusal
surfaced on the opportunity screen, `/sales/opportunities` — but the only
place a criterion could be ticked was the workstream/journey screen,
`/sales/workstreams/:code`. A card built for the opportunity screen to hold
the checklist, `OpportunityGateCard`, was never imported by anything. A user
could hit a locked door with no key in sight — a comment in
`apps/web/src/components/sign-drawer.tsx` <!--ctx:ignore--> recorded this was
known and left deliberately, because the checklist was parked, not finished.

## Decision

Stage-gate is removed outright, not reworked. Moving a deal forward and
signing a contract are, from now on, subject only to the checks every other
write door already has: permission, scope, and — for signing — E3 approval
(ADR 0057 §7, unaffected by this decision). There is no criteria checklist
left anywhere in the product.

This retires migration `0047_stage_gate.sql` <!--ctx:ignore-->, which built
the two tables; `0055_drop_stage_gate.sql` drops both — run clean against a
PGlite copy of the live tree, no dangling foreign key, `sales.opportunity`
unaffected. The contracts file that
declared the rule, `packages/contracts/src/sales/stage-gate.ts` <!--ctx:ignore-->,
the service/repository pair enforcing it on the API side, and the
config-screen section and drawer card on the web side, are all deleted
along with it.

**Lesson for whoever rebuilds a gate later:** put the tick control on the
same screen as the door it blocks. A checklist living one screen away from
its lock is a checklist nobody can satisfy — that mismatch, not the four
criteria themselves, is what made this feature unused from the day it
shipped.

## Consequences

- `packages/contracts`: `sales/stage-gate.ts` and its exports
  (`StageCriterion`, `errors.criteria` shape) are gone; nothing in
  `@pv/contracts` describes a criteria checklist anymore.
- `apps/api`: the `sales.stage_criterion` and `sales.opportunity_criterion_tick`
  tables, their repository/service pair, and the three doors that read or
  wrote them are gone. Forward stage moves and signing keep only the
  permission, scope and E3 checks ADR 0057 already put on them.
- `apps/web`: the config-screen section for stage criteria, the checklist
  card, and the tick control on the workstream/journey screen are gone. The
  409 `errors.criteria` refusal no longer exists — moving a deal forward and
  signing fail only for permission, scope or an open E3 request.
- ADR 0057 §6 is superseded by this decision; §§1, 2, 3, 4, 5 and 7 of 0057
  stand as written.
- The "Đúng thiết kế, không phải lỗi" note about stage-gate — that Neon had
  no seeded criteria so the gate blocked nothing — no longer applies to
  anything: there is no gate left to block.
