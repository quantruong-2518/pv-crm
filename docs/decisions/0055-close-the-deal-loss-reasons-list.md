# 0055 · Deal loss reasons become a closed list

Status: accepted (supersedes the `LOSS_REASONS` half of ADR 0015 rule 4 only)

Source: project owner's decision in session · `crm_workstream_v2.pdf` ("CRM
master workstream V2", a 3-page diagram of the whole customer journey in five
blocks)

## Context

ADR 0015 rule 4 declared two exit-reason lists, deliberately distinct:
`EXIT_REASONS` (a lead dying before becoming an opportunity) — 6 values,
**closed** — and `LOSS_REASONS` (a quoted deal being lost) — 7 values,
**open**. 0015's other three rules, and its pipeline/queue/ledger three-way
distinction, are not touched by this decision and stand as written.

The V2 diagram reads "Lý do chọn sẵn" ("reason picked from a preset list") at
Closed Lost, and applies that same discipline at all four exit doors in the
journey, not just the lead-exit door.

Verified in code: `ExitReason` in `packages/contracts/src/sales/enums.ts` is
today **one shared six-value enum** serving both lead exit and deal loss —
`khong-goi-duoc` · `khong-phai-khach-cua-minh` · `khong-co-ngan-sach` ·
`nguoi-lien-he-nghi` · `chon-ben-khac` · `im-sau-bao-gia`. `lossReason` on
`packages/contracts/src/sales/opportunity.ts` is free text
(`textInputOptional(OPPORTUNITY_LOSS_REASON_MAX)`), not an enum at all.

## Decision

**`LOSS_REASONS` closes.** Deal loss reasons stop being free text and become a
fixed, closed list, the same discipline `EXIT_REASONS` already has.

**The required end shape is two separate closed enums** — one for lead exit,
one for deal loss — not one shared enum reused for both. They are two
different doors with two different reason vocabularies; 0015 rule 4 itself
said no pipeline shares a reason list with another, and a shared `ExitReason`
enum already violates that for the doors it does cover.

**The cost the owner accepts:** a seventh loss reason arriving in the future
is a migration, not a `config_entry` row. Closing the list trades that
flexibility for the discipline 0015 asked every exit door to have.

This does not touch 0015's rules 1–3 (pipeline position as pure function,
`limitDays` in `config_entry`, non-reversible steps through E3), and does not
touch the pipeline/queue/ledger three-way split — those stand.

## Consequences

- `LOSS_REASONS` needs its own zod enum in `@pv/contracts`, separate from
  `ExitReason`, and `lossReason` on `opportunity.ts` moves from free text onto
  it.
- **Debt this does not fix:** 0015 already flagged that drop-reason labels
  still read from a fixture, not from `config_entry` — that debt is unpaid and
  this decision does not pay it. Closing the list is a separate question from
  where its labels live.
