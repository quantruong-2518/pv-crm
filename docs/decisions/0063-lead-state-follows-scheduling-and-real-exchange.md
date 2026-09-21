# 0063 · Lead state follows scheduled care and real exchange, not edits; tier leaves the state machine

Status: accepted (partially supersedes 0058: the entry conditions of `verifying`,
`working` and `nurturing`, "Tier is not a state", and three Amendment bullets)
Source: project owner's decision in session, 21/09/2026

## Context

Under 0058 any first action by the owner (a contact edit, a field edit, an
account attach) moved a lead to `verifying`, and `working` needed a manual
"Xác minh xong" step that also picked the tier. The labels said "verifying" and
"working" while the triggers said "somebody touched the record". Owner: state
must say what the PIC is actually doing with the lead.

## Decision

### 1 · Labels (display only; stored identifiers unchanged)

`new` = "Khởi tạo lead" · `assigned` = "Nhận PIC" · `verifying` = "Tạo chiến lược
chăm sóc" · `working` = "Tình trạng chăm sóc" · `nurturing` = "Chờ thời điểm" ·
`converted` = "Đổi thành Opp" · `disqualified` = "Không theo nữa" ·
`archived` = "Lưu trữ".

### 2 · Entry conditions

- **`verifying`**: the owner PIC schedules care — a meeting recorded or amended
  with a FUTURE `at`, or a Quick-MAS mail run with `scheduledAt` set (no
  campaign, audience = leads). Only from `assigned`, owner-only, forward-only.
- **`working`**: a real exchange is logged — the `contacted` door, ANY message
  or call logged on the lead through comms (any direction, any duration), or a
  meeting recorded or amended with a PAST `at`. From `assigned` OR `verifying`:
  a logged exchange on an `assigned` lead goes straight to `working`.
- Editing a contact, PATCH lead, attaching an account and switching the primary
  contact NO LONGER move state.
- `converted` unchanged (first opportunity opened; the opportunity contract
  already requires amount + currency). `nurturing` is still reachable only from
  `verifying`|`working`. `archived`, `disqualified`, release to pool (any open
  state → `new`), reopen and resume unchanged in shape.

### 3 · Tier is decoupled from state

`working` no longer requires a tier (`CHECK lead_working_has_tier` dropped in
migration 0058). Tier (`prospect`/`mql`/`sql`) is optional, editable in any
state except `disqualified`|`archived`, still not clearable. The
`POST :code/verify` door and the "Xác minh xong" button are removed.

### 4 · Reopen and resume read FACTS in the touch trail

Highest rung ever reached: `working` if an `exchange-logged` or legacy
`verified` touch exists, `verifying` if `care-planned` or legacy `first-action`,
else `assigned` — not from the tier. Known blind spot: "highest rung ever
reached" — a lead that reached `working`, was released and rescheduled, then
disqualified, reopens as `working`. The off-backbone lane already applies the
same rule.

### 5 · Two new touch kinds

`care-planned` and `exchange-logged`. Owner chose distinct kinds over reusing
`first-action`/`verified` so names stay honest. Legacy kinds stay valid forever;
every walk (`sales.workstream_stand()`, `LEAD_LANE_BACKBONE` consumers, the
TypeScript lane code) must accept old and new. Migration 0058 extends
`touch_kind_known`, the `touch_workstream_stand` trigger WHEN list and the SQL
function.

## Consequences

- **No backfill.** Leads already in `verifying`/`working` keep their state. A
  lead put in `verifying` by migration 0052's backfill without a `first-action`
  row reopens as `assigned`.

## Alternatives rejected

- Keep the old triggers, rename labels only — the label would lie: any contact
  edit moved the lead.
- Build a CarePlan entity — big, a separate turn.
- Reuse the old touch kinds — the `verified` name would lie.

## Open

- There is no call-plan concept anywhere in the data model; "kế hoạch gọi" has
  no place to be written.
