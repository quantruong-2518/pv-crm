# 0050 · `comms` sits under `platform`, not under `sales`

Status: accepted
Source: docs/ke-hoach-thi-cong-comms.md §10 ("Four places to stop and ask, no
agent decides alone"), point 1, and §11 ("The four questions in §10, now
answered"), point 1 — a summary of `tam-nhin-giao-tiep-va-noi-dung.md` §17,
locked 14/09/2026

## Context

Where the `comms` module's file tree lives — `platform` or `sales` — was an
open question because it decides two things at once: the file tree itself,
and whether the `platform.object` mirror-row debt (every write needs a
mirror row in `platform.object` so `E1.story()` can chain it) grows to cover
`comms` as well.

## Decision

`comms` stands in **`platform`**. As a consequence, the mirror-row debt
against `platform.object` moves to batch 1 (lượt 1) of the comms build, and
now covers **both** `opportunity` and `contract`, not just `comms` — a
correction made at phase 0 of that build. Full detail is at
`tam-nhin-giao-tiep-va-noi-dung.md` §18.

## Consequences

Every capture adapter and every screen built against `comms` reads and writes
through `apps/api/src/platform/comms/**`, not a `branches/sales/comms/**`
tree.
