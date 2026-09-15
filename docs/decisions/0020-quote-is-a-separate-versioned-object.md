# 0020 · Quote (`BG`) is a separate object with line items; module 4 stops at hand-off, it does not create the sales order

Status: accepted
Source: docs/tam-nhin-bao-gia-hop-dong.md — "Ba thứ chủ dự án đã chốt trước khi
phác" (table) and "§1 · Chuỗi đầy đủ và ranh giới"

## Context

Before module 4 (Quote/Contract) could be sketched, three questions needed an
answer: what a "deal" actually is once it leaves the opportunity stage, where
the module's own boundary sits, and whether quotes need line items at all.

## Decision

Three things the project owner ratified before any sketch was drawn:

- **A quote is its own object**, with line items and multiple versions — not a
  field on the opportunity.
- **The module's boundary is the hand-off**: signing a contract must be able
  to connect to Supply's sales order (`SO`), but module 4 stops there.
- **Line items are required**, enough to print both the quote and the
  contract.

The full chain is:

```
lead → opportunity (M3) → [ quote (BG) → contract (HĐ) ]  → sales order (SO) → work order (WO) → ...
                            module 4 (this decision)          module 5, Supply branch
```

**Module 4 does not create the sales order.** It leaves exactly two things for
Supply to pick up: one `platform.edge` from the contract, and one
`sales.contract.signed` event. Having Sales auto-create the `SO` would force
the Sales branch to know Supply's schema — the package-boundary rule in
`CLAUDE.md` forbids exactly this.

This chain matches fixtures already frozen, not a hypothetical: `sao-do.ts`
already has `LD-0334 → HĐ-2607 → SO-0891 → WO-1180 → PO-0455 → L-2608-042`, and
`das-vina.ts:46,57` already has the edge `OP-0288 → BG-1077`. The `BG` and `HĐ`
object kinds are already declared in `packages/engines/src/types.ts`. Module 4
fills the middle of a chain already drawn, it does not open a new one.

## Consequences

Module numbering shifts: Performance moves from module 4 to 5, Plan from 5 to
6, Settings from 6 to 7 (`routes.tsx` module names, `SALES_MODULES` in
`apps/web/src/app/chrome.tsx`), because the sales-journey number sequence (1
campaign → 2 lead → 3 opportunity) now has Quote/Contract at 4.
