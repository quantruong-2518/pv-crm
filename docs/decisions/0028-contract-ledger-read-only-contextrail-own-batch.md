# 0028 · Contract ledger ships read-only at batch 4; ContextRail is its own batch, not bundled into batch 4

Status: accepted
Source: docs/tam-nhin-bao-gia-hop-dong.md — "§11 · Năm câu treo — đã chốt
30/08 · 2 · Sổ hợp đồng — LÊN Ở LƯỢT 4, và chỉ ĐỌC" and "5 · ContextRail —
KHÔNG ở lượt 4, làm thành LƯỢT 6 riêng", "§8 · Lộ trình"

## Context

Two rollout-sequencing questions for module 4: when does the contract ledger
screen ship, and does ContextRail (rule 10) light up in the same batch as the
contract-sign edge, or separately.

## Decision

**The contract ledger ships at batch 4, read-only.** Batch 4 is the first
point real money exists in the system: `data/performance.ts` today writes
directly in code that "the fixture does not record signed-contract value, so
it is not added in here." The contract ledger is the first place "how much
did we sign this month" gets a real answer instead of a fixture number. It is
cheap to build — the screen frame is a copy of `opportunities.tsx`, one read
route, one screen — but **read-only only**: no dedicated contract profile, no
editing a contract at this batch. A contract profile splits into its own
route the day it has something to live on (sales order, delivery, payment
collection) — that is module 5.

**ContextRail does NOT ship in batch 4; it becomes its own batch 6.** The
earlier reason for deferring it ("waiting for someone to approve the layout")
is now half-moot — after batches 2 and 4, real E1 edges exist for the rail to
draw for the first time. It is still pulled into its own batch because it is
a **cross-screen layout decision**, not a feature of module 4: the rail must
light up simultaneously on the lead profile, the opportunity profile, the
quote ledger, and the contract ledger, or not light up anywhere. Bundling it
into batch 4 would leave one screen with a rail and three without — rule 10
requires it "mandatory on every screen," and half-done is worse than not-done.

## Consequences

Rollout order (seven batches, each leaving `pnpm check` green): 0 dedupe +
`UNIQUE(contract.opportunity_code)` · 1 `KIND_DOMAIN` + five permissions +
role matrix (ADR 0026) · 2 `quote`/`quote_line` tables + read/create/edit/
replace routes + `OP→BG` edge (needs 1) · 3 send + customer-decision recording

- outbound mail (needs 2) · 4 contract ledger (read-only) + `ContractSign`
  body change + `BG→HĐ` edge (needs 0 and 3 — a committed version must exist
  before signing) · 5 payment installments (needs 4) · 6 ContextRail across all
  four Sales screens at once (needs the edges from batches 2 and 4).

Batch 0 cannot be rolled back carelessly: count
`SELECT opportunity_code, count(*) … HAVING count(*) > 1` first. Any hit means
STOP and ask — deduping is a business decision, not a migration's job. Batch 4
is breaking: `ContractSign`'s shape changes, so `pnpm check` must go red at
every import site; if it stays green with no changes made, something is
type-coercing the mismatch away — grep again.
