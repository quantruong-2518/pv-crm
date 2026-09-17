# 0057 · Seven sales pipeline decisions — signed-deal editing, reversible lead exit, stage-gate scope, free-text loss reason

Status: accepted (supersedes 0055; partially supersedes 0015 rule 2 and rule
4, 0031's fourth request type, and 0034)
Source: project owner's decision in session, 17/09/2026

## Context

Seven separate rulings on the sales pipeline, ratified together on 17/09,
touching: editing a signed opportunity, a lead leaving the funnel, the shape
`limitDays` and the `STAGE`/`TIER` ladders are allowed to take, whether ADR
0015 rule 2 still applies to every phase, whether the opportunity loss reason
is a closed list, what stage-gate criteria actually block, and how signing a
contract goes through E3. Code is being changed in parallel to match; this
record is the decisions, not the implementation.

## Decisions

### 1 · Editing a signed opportunity is normal, and never reopens the deal

A signed deal can be edited like any other row. The edit never reopens it —
`state` stays `won`-equivalent and it stays off the board regardless of what
changed. If the edit changes the amount, the currency, or the main SALE owner
(the commission holder), the already-signed contract is updated along with
it — the contract is not left pointing at stale figures after a legitimate
edit.

### 2 · Lead exit is direct, reversible, and outside E3

A lead leaving the funnel ("rời phễu") is performed by the salesperson
directly: one of the six closed `EXIT_REASONS` (ADR 0015 rule 4) plus an
optional note, no approval step. It is **reversible** — a lead can be
reopened when the customer comes back.

Because it is reversible, **ADR 0015 rule 3** ("every non-reversible step
must go through E3") **does not apply to it**. This removes lead
disqualification (`loại-lead`) from the E3-gated request list ADR 0031 wired
in — that entry was built on the premise that the step could not be undone,
which no longer holds.

Exit is refused while the lead still has an open deal, or is signed. On exit,
the lead's customer-journey run closes `LOST`; on reopen, the run reopens.

### 3 · `limitDays` shape, and the `STAGE`/`TIER` ladders are structurally fixed

`limitDays` is an integer ≥ 1, or absent for "no limit" — not zero, not a
sentinel value. The `STAGE` and `TIER` ladders in sales config keep their
structure fixed: stages are code keys the rest of the system points at by
value, so config may **rename** a rung and **set its limit**, but may not
add, disable, or reorder rungs. Ladder shape is a code change, not a config
edit.

### 4 · ADR 0015 rule 2 is suspended outside the five opportunity stages

ADR 0015 rule 2 ("every stage/phase must have a `limitDays`") is **suspended
for now**. The five opportunity stages keep the limits already given to them.
No limits are to be built for the other pipeline phases until the project
owner lifts the suspension. This directly narrows what ADR 0034 shipped —
0034 extended `limitDays` to all eight phases; that extension is paused
outside the five opportunity stages until the suspension lifts.

### 5 · Opportunity loss reason reverts to free text

ADR 0055 is reversed. The opportunity loss reason (`lossReason`) is **free
text** again; the configurable `LOSS_REASONS` list is at most suggestions
offered to the salesperson, never an enforced closed list. This overrides
0055's closed-list direction outright — 0055's stated cost (a new reason
requiring a migration) does not apply, because there is no closed list left
to migrate.

### 6 · Stage-gate criteria block only forward moves and signing

Stage-gate criteria block exactly two actions: moving a deal to a **later**
stage, and signing. They do not block:

- Creating or importing a deal straight into a later stage.
- Reopening a lost deal.

Criteria belonging to stages the deal has already passed, if still unticked,
show as **missing** and must be ticked before the next forward move or
signing — the gate looks backward across every passed stage, not only at the
stage being entered.

### 7 · Signing goes through E3 approval

Signing a contract goes through E3 approval, kind `contract-sign`. Pressing
Sign raises a request; the contract is created only once the approver
accepts. At most one waiting sign request per deal. This is what brings
signing into compliance with ADR 0015 rule 3 — it was not E3-gated before.
`contract-sign` is a fifth entry alongside the four request types ADR 0031
wired in (`cấu-hình` · `đổi-chủ-lead` · `giảm-giá` · `loại-lead`, the last of
which decision 2 above removes).

## Consequences

- `packages/contracts`: `lossReason` on `opportunity.ts` returns to a free-text
  field; the `LOSS_REASON` closed enum ADR 0055 asked for is not built (or is
  demoted to a suggestions list, if it already exists).
- `packages/engines` (E3): a `contract-sign` approval kind joins the four ADR
  0031 wired; `loại-lead` (lead disqualification) drops out of E3 and becomes
  a direct, reversible action instead.
- Stage-gate criteria evaluation must look across all passed stages, not just
  the target stage, when deciding what counts as "missing."
- Editing a signed opportunity's amount, currency or main SALE owner is a
  write path that must also touch the signed contract row — this is a second
  writer into contract data alongside the sign-approval flow in decision 7,
  and the two must not race.
