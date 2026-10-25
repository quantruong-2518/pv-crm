# 0123 · The lead state `verifying` is removed; two stepper labels are renamed

Status: accepted (partially supersedes 0063 §1 and §4, 0067's state table, 0068 §2 and §7; 0058's `verifying` row is already superseded by 0063)
Source: project owner's decision, 25/10/2026, after reviewing the lead page stepper

## Context

`verifying` ("Tạo chiến lược chăm sóc") only meant care scheduled (a future
meeting or a timed mail run) with no customer touch yet. Its name overstated
that, and it was often skipped (a call goes straight `assigned` → `working`),
so the 5-step stepper looked like a missed step.

## Decision

### 1 · `verifying` is removed

The lead path is `new` → `assigned` → `working`, then the exits as before.

### 2 · Two labels

| State      | Was                   | Now                     | Why                                          |
| ---------- | --------------------- | ----------------------- | -------------------------------------------- |
| `assigned` | "Nhận PIC"            | "Đã có người phụ trách" | Read like a pending button next to the title |
| `working`  | "Tình trạng chăm sóc" | "Đang chăm sóc"         | "Tình trạng" is a field name, not a stage    |

## Implementer's calls

The owner did not rule on these; they stand until the owner says otherwise.

- Scheduling care moves nothing and writes no rung touch any more.
- The `care-planned` and `first-action` touch kinds stay as LEGACY: existing
  rows persist, nothing writes them, and a lead's trail reads them as the
  `assigned` rung.
- Existing `verifying` leads and workstream stand rows become `assigned`;
  `state_since` is kept.
- Lead `step_template` rows keyed `verifying` re-key to `assigned`; `state_rule`
  rows that would collide are dropped.
- One migration (migration 0144; the number is set by the migration itself,
  written in parallel with others above 0143).

## What this amends

- **0063 §1** — `verifying` and its entry condition (scheduled care) are gone.
- **0063 §4** — the trail walk has four rungs; legacy scheduling touches prove
  `assigned`.
- **0067** — its state table loses the `verifying` row.
- **0068 §2** — "`verifying` is kept, but only for care scheduled" no longer
  holds.
- **0068 §7** — a timed run moves no lead state.

### 3 · "Mở cơ hội" is not gated

Owner, 25/10/2026: a lead may open an opportunity from step 2 (`assigned`)
even with no customer touch yet; the sale decides (open question 119).
