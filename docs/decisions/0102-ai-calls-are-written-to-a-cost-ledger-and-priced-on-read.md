# 0102 · AI calls are written to a cost ledger and priced on read

Status: accepted; the ledger write and the scan env vars amended by 0127
Source: project owner's decisions, 19/10/2026

## Context

The owner wants AI support in every flow of every role. It will be multi-agent:
an orchestrator picks the model per task from a routing table (decided, built
later). Before that grows, the owner wants a cost view of the whole product, and
AI cost comes first because vendor billing APIs mostly do not exist. Research on
19/10 from the vendors' official docs: only Vercel has a billed-cost API; Gemini
cost is available only through a Cloud Billing BigQuery export; Neon's
consumption API returns usage units, not money; Fly (including Tigris), Resend
and VietMap have none. Infra cost is deferred.

## Decision

### 1 · One ledger row per model call

`platform.ai_call`: one row per model call, success or failure, with counts
only — never prompt or answer text (customer data). Output tokens include
thinking tokens, because they are billed as output. `task` is a closed list
(CHECK), starting with `lead-scan`. `actor_id` is who pressed; null for system
jobs. `source_key` is unique and used only by the backfill (§4).

### 2 · Price history, computed on read

`platform.ai_price`: USD per 1M tokens, input and output, per model, with an
`effective_from` date. The cost is never stored on the call: it is computed on
read, so a corrected or back-dated price corrects the past. A call is priced by
the row of its model with the greatest `effective_from` on or before the call's
date in Asia/Ho_Chi_Minh.

A call with no price is **unpriced**: its cost is unknown, never 0. A line sums
priced calls only and shows its unpriced calls apart. No prices are seeded; we
do not invent numbers, the admin enters them. The screen says the figures are
tokens × the unit price entered, not reconciled with the vendor's bill.

### 3 · Who sees it

New permission `cost.view` ("Xem chi phí"), granted by default to `director`
only. Head of sales is excluded on purpose: the owner said only the admin sees
costs. Editing a price rides the same permission and writes an audit line.

### 4 · Backfill from `sales.scan_file`

Migration 0123 turns every `sales.scan_file` row still stored that spent tokens
into one `ai_call` (task `lead-scan`), idempotent through `source_key`. Files
already dropped or swept and cached re-reads (0 tokens) leave no row, so history
before the migration is a floor, not a full count. The model is
written as `gemini-3.8-flash`: that is the default of `SCAN_GEMINI_MODEL`,
unchanged since it was introduced on 28/09 (b9f2424), and `fly.toml` does not
override it.

### 5 · No spending cap yet

The owner decided on 19/10 to build the cost view first and set no cap.

## Consequences

- The future orchestrator writes the same ledger; it adds task kinds, not a
  second table.
- Adding a task kind widens the `task` CHECK by migration.
- Reconciliation with the real Google bill (the BigQuery export) is a later
  column beside the computed cost, not a replacement.
- Ship order: 0123 must be on Neon before the API that writes the ledger, or
  every scan read rolls back and is retried (and billed) again. It shipped
  together with the KPI branches, renumbered from 0122 when the other machine's
  0116 (account logo) landed first; the KPI migrations are 0117–0122.
- `sales.scan_file.tokens_*` still feeds the 24-hour scan limit; the ledger is
  the source for cost. Moving the limit onto the ledger is a later step.
- Infra cost (Fly, Neon, Vercel, Resend, VietMap) is a later slice; this one
  is AI only.
- Context for the proposals work that this ledger serves:
  `.claude/HANDOFF-ai-proposals.md`.
