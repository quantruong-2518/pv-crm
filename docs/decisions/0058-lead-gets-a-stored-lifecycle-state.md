# 0058 · A lead gets one stored lifecycle state, replacing `stage` and the running/signed/exited split

Status: một phần bị thay thế bởi 0063 (entry conditions of `verifying`/`working`,
tier rules); accepted (partially supersedes 0015 and 0034's use of the pipeline
`phase` ladder for the lead's own status; keeps 0057 §2 for `disqualified`)
Source: project owner's decision in session, 18/09/2026; diagram
`crm_workstream_v2.pdf`, block 2 ("Lead") — already cited by ADR 0054

## Context

A lead today carries its status two ways at once: `stage` (a `StageKey`, the
same ladder the pipeline uses) and the derived `LeadStatus` triad
(`running`/`signed`/`exited`, computed from `exitReason`/`EXISTS(contract)`).
Neither is a lifecycle a lead itself moves through — `stage` belongs to the
pipeline, and the triad only tells apart "still open" from the two ways a
lead leaves. There is no single column that says what state the lead is in
right now, or since when.

The V2 workstream diagram's block 2 lays out an explicit lead lifecycle,
separate from the pipeline stage ladder: a lead is created, gets a PIC,
gets worked, may be nurtured, converts to an opportunity, or is dropped.

## Decision

A lead gets one explicit, stored lifecycle state: a closed enum in a column
guarded by a `CHECK` constraint, plus the timestamp the lead entered that
state. This replaces both `lead.stage` used as the lead's status and the
`running`/`signed`/`exited` split. The server moves the state inside the same
transaction as the write that caused it — the state is never a side effect
computed after the fact.

### States

| Key            | Vietnamese label | Entered by                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new`          | Mới tạo          | No PIC yet. Manual create, import, landing-page intake without an owner.                                                                                                                                                                                                                                                                                                                                                |
| `assigned`     | Đã nhận          | Has a PIC, PIC has not acted yet. Automatic when a PIC is set (self-claim or assigned by a manager).                                                                                                                                                                                                                                                                                                                    |
| `verifying`    | Đang xác minh    | Covers both checking the lead's information and qualifying need/timing after first contact. Automatic on the PIC's first action of any kind (editing fields, a contact, a meeting, a mail sent). **Đã thay bởi 0063.**                                                                                                                                                                                                  |
| `working`      | Đang chăm        | Manual: the PIC confirms the lead is verified and must pick the tier in the same action. **Đã thay bởi 0063.**                                                                                                                                                                                                                                                                                                          |
| `nurturing`    | Nuôi dài hạn     | Manual by the PIC from `verifying` or `working` ("not ready"); at most 6 months (the diagram's number). The PIC brings it back to `working` when there is a new signal. **Resume rule đã thay bởi 0063.**                                                                                                                                                                                                               |
| `converted`    | Đã lên cơ hội    | Automatic when the first opportunity is created from the lead.                                                                                                                                                                                                                                                                                                                                                          |
| `disqualified` | Đã loại          | Manual, one of the six closed exit reasons plus an optional note; reversible (reopen recomputes the resulting state from current facts — see Amendment). This is the lead exit ADR 0057 decision 2 named, renamed as a state — everything 0057 §2 says (direct, no E3, refused while an open deal exists or the lead is signed, the run closes `LOST` / reopens on reversal, permission `lead.disqualify`) still holds. |
| `archived`     | Lưu trữ          | Automatic, by the system, after 6 months in `nurturing`.                                                                                                                                                                                                                                                                                                                                                                |

Automatic transitions only move forward and may skip states — a PIC who
calls first goes straight past `assigned` to `verifying`. Manual transitions
are the only way back (`nurturing` → `working` or `verifying`; `disqualified`
→ its recomputed state on reopen — see Amendment).

### Tier is not a state

> Đã thay bởi 0063: tier is optional, editable in any state except
> `disqualified`|`archived`, and no longer set by a verify step.

`tier` (`prospect`/`mql`/`sql`) stays a separate field, not folded into the
state enum. It is set only when the PIC confirms verification — the
`verifying` → `working` step — never before. This narrows how tier was set
until now: an import could set tier at entry; under this decision, tier stays
unset until a PIC has confirmed verification (see Amendment for the further
rulings on when tier may be written or edited).

### Explicitly not in this decision

- Merging duplicate leads (the diagram's "Gộp bản ghi" / a `merged` state).
  Owner: "tạm thời chưa làm" (not for now).
- The migration path itself is not designed here; existing leads' state is
  backfilled from current data by the migration that implements this ADR.

### Relation to other ADRs

- Builds on ADR 0054 (full customer-journey scope), which already cited this
  diagram's block 2.
- Keeps ADR 0057 §2 in full for the `disqualified` state and its reopen path.
- Partially supersedes ADR 0015 and ADR 0034 only where they used the
  pipeline `phase`/`stage` ladder to stand in for the lead's own status: ADR
  0034's `phase` field (P2/P3, keyed off `tier ≠ dau-moi`) and `pipeline_position`
  more broadly are pipeline concepts and are untouched by this decision — a
  lead's `pipeline_position.phase` still exists and still answers "where is
  this object in the pipeline." What this decision removes is `lead.stage`'s
  second job of also being read as the lead's status, and it removes the
  `running`/`signed`/`exited` `LeadStatus` triad as the lead's status,
  replacing both with the one enum above.

## Consequences

- `packages/contracts/src/sales/lead.ts`: the `stage` field's use as lead
  status, and the `LeadStatus` enum (`running`/`signed`/`exited`/`all`), are
  replaced by the new state enum plus its since-timestamp. Filtering that
  used to read `LeadStatus` needs an equivalent over the new states.
  `exitReason`/`exitedAt` keep meaning what they mean today, now paired with
  the `disqualified` state instead of the derived triad.
  `tier` gains a stricter write rule: settable only on the transition into
  `working`.
- The migration backfilling existing leads' state from current data
  (`stage`, `exitReason`, `EXISTS(contract)`, PIC presence) is a piece of
  work this ADR requires but does not specify.
- Whichever service performs a PIC's first action against a lead becomes the
  place that must also move the state to `verifying`, inside the same
  transaction — this touches every write path that can be a "first action"
  (edit, contact log, meeting, mail sent), not just one endpoint.
- A scheduled sweep is needed for the one purely time-based automatic
  transition: `nurturing` → `archived` after 6 months.

## Amendment · 18/09/2026

Source: project owner, further rulings in session, same day, made as the
code implementing this ADR was being built.

- **Reopen from `disqualified` recomputes, it does not return to a fixed
  state.** The resulting state is derived from current facts: any deal
  exists → `converted`; no owner → `new`; no tier → `verifying`; otherwise →
  `working`. **Đã thay bởi 0063** (recomputed from touch facts, not tier). This corrects the body above, which said reopen unconditionally
  returns to `working`.
- **Resume from `nurturing`** goes to `working` if the lead already has a
  tier, otherwise to `verifying`. **Đã thay bởi 0063.**
- **Owner change.** Handing a lead from one PIC to another (A → B) keeps the
  current state unchanged. Releasing a lead to the pool (no owner) from any
  open state moves it to `new`. Terminal states (`converted`, `disqualified`,
  `archived`) never change on an owner change.
- **Converting an unverified lead is allowed.** Creating an opportunity from
  a lead still in `new`, `assigned`, or `verifying` is allowed and moves the
  lead straight to `converted`, skipping the states between — tier may stay
  empty in that case. Opportunities are refused from `disqualified` and
  `archived`.
- **Disqualify is allowed from every open state**, including `new` (a
  spam-intake lead can be disqualified before it is ever assigned or
  verified), and from `converted` only under the existing ADR 0057 §2 guard
  (no open deal, not signed).
- **What counts as the PIC's first action.** The automatic `verifying`
  transition fires only when the actor performing the action is the lead's
  current owner. An action by anyone else does not count, and a campaign
  wave touching the lead does not count. A call logged against the lead in
  comms does count, regardless of which channel logged it. **Đã thay bởi 0063.**
- **Tier writes narrow further.** The first tier value is set only by the
  verify step (the `working` entry action), never earlier. After that, tier
  may be edited only while the lead is in `working` or `converted`. **Đã thay bởi 0063.** Import no
  longer writes a tier at all — this supersedes the body's earlier mention of
  an importer cap, which assumed import still set a (capped) tier.
- **`archived` is a dead end with side effects.** Reaching `archived` frees
  the lead's email for reuse by a new lead, makes the lead not mailable, and
  closes the lead's customer-journey run `LOST`. There is no way back to any
  other state in this batch. The six-month nurturing limit that leads to
  archiving is a named constant citing this ADR, not a `config_entry` row —
  `config_entry.limit_days` is fenced to the `STAGE`/`TIER` ladders (ADR
  0034's `CHECK config_limit_only_stage`), and ADR 0057 §4 suspends building
  new limits outside the five opportunity stages.
