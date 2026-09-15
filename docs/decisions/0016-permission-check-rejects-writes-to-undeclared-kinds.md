# 0016 · E1 must write edges at request time before cross-branch work proceeds; E2 rejects writes to permission-domain-undeclared kinds

Status: accepted
Source: docs/tam-nhin-pipeline-toan-he.md §7 ("Three blocking tiers — and tier
0 nobody has mentioned yet")

## Context

```
tier 0   E1 writes an edge AT RUNTIME  — without it there is no cross-branch chain
tier 1   E3 + platform.approval        — without it there is no "waiting on whom"
tier 2   the eleven pipelines          — each one stands on the two tiers above
```

**Tier 0 is the one no document had written down yet.** As of this writing,
**only `seed.ts` writes `platform.edge`**; `ObjectMirror` only writes the
`object` table, and `GraphService` is wired into no controller. That means the
chain `LD-0334 → HĐ-2607 → SO-0891 → …` **only lives in seed data** — no live
door generates an edge at runtime. Module 4 leaves exactly two things for
Supply to pick up (a `platform.edge` and a `sales.contract.signed` event) and
**neither has a writer yet**.

Building Supply/Factory screens before tier 0 closes is building a house with
no foundation.

## Decision

`KIND_DOMAIN` deliberately still omits eight kinds (`BG · SO · WO · PR · PO ·
L · BT · CNC`), because assigning them a permission domain would be inventing
a permission rule for a branch nobody is building — the role matrix has no
`purchase.*` permission to assign either. But that omission no longer means
"do whatever": `check()` now **rejects WRITE attempts** on any kind with no
declared domain, while still allowing READS (the license axis already answers
the read question, and rule 10's rail needs it). `export`/`approve` are not
exempted either — they do not depend on the object, so they are checked
against the domain table first. The full reasoning is at the rejection site in
`e2-access.ts`. Patched 14/09.

## Consequences

Because the day a first Supply screen opens is no longer on the roadmap (ADR
0014), the 14/09 patch matters more, not less: those eight kinds will
**permanently** have no permission domain, so what keeps them safe is the
rejection inside `check()` itself, not a promise to declare them later. Reads
still work — the license axis already answers the read question, and rule
10's rail needs it.

> **Partially overridden by ADR 0026.** That decision patches `KIND_DOMAIN` in
> `packages/engines/src/e2-access.ts` to map `BG` and `HĐ`, which this ADR's
> reading of decision #6 of `ban-giao-db.md` had left unmapped. The rule here
> still stands for every other kind; only the quote/contract case is carved out.
