# 0072 · An opportunity has four stages; sample, POC, demo and site visits are care activities

Status: accepted (partially supersedes 0064 §1 stage set, §3 `sample`/`poc` milestone rows, §7 five columns, §8 `sample-sent`/`poc-run` as stage triggers; narrows 0069 §7 and §8 sub-rungs; relabels 0071's `assigned`)
Source: project owner's decisions in chat, 01/10/2026

## Context

0064 made `sample` and `poc` stages of a forward-only ladder. In practice a
sample, a POC, a demo or a visit to the plant is something the team does for a
customer, repeatedly and in any order, not a step the deal passes through.
Owner: "sample, POC hay gì nó là một trong những actions liên quan tới chăm
sóc khách hàng, không phải các bước liên tiếp". Mainstream CRM practice: stages
mark the buyer's commitment; activities are logged under the deal.

## Decision

### 1 · Care activities are not stages

Sample, POC, demo and site visits are care activities — repeatable, in any
order.

### 2 · Four stages

| Key         | Label            | Meaning                         |
| ----------- | ---------------- | ------------------------------- |
| `new`       | "Khởi tạo"       | created                         |
| `assigned`  | "Đang phân công" | a head accepted the deal (0071) |
| `engaged`   | "Chăm sóc"       | first care activity recorded    |
| `quotation` | "Báo giá"        | a quotation was recorded        |

Then won (a contract) or lost (a stop). Forward-only stays. The board has four
columns.

### 3 · Activity kinds and their door

Kinds: `sample` (Sample), `poc` (POC), `demo` (Demo), `site-visit` (Khảo sát /
gặp tại nhà máy).

They are recorded through the existing milestone door with a date and an
optional note. The date is back-datable within [the deal's acceptance, now].
Allowed from `assigned` until signed or lost; never at `new`.

The FIRST activity on a deal at `assigned` moves it to `engaged`. Later ones
never move a stage.

### 4 · `quotation` stays a stage

It gates signing (0064 §3). Recording a quotation from `assigned` skips
`engaged`; the journey shows it skipped, and the screen confirms before a skip.
The quotation's own date is back-datable within [current stage entry, now].
Repeat quotations are rounds ("Gửi lần n", 0069 §8).

### 5 · Mail templates

A mail template may carry an activity kind `sample` or the stage milestone
`quotation` (0069 §7 narrowed). A sample template records a sample activity
when the letter leaves. At `new` nothing is recorded, and the composer says so
beforehand. No POC by mail.

### 6 · Where activities show

The `engaged` rung's drawer lists the activities (kind, date, who, note).
Counts per kind show on the profile.

### 7 · Migration

- Deals at `sample`/`poc` become `engaged`.
- Stage history rows with sample/poc become `engaged`.
- The old `sample-sent`/`poc-run` touches remain as the activity history.
- New touch kinds are added for demo and site visit.
- Stage-limit config rows are re-keyed to four.
- The `engaged` limit is the larger of the old sample/POC limits. The old POC
  `STAGE` row is deactivated, not deleted.
- Sample → POC stage events are removed, with their days folded into the next
  exit from `engaged`. `engaged`'s `stage_since` is the first entry into
  `engaged`.
- Deals whose old sample/POC entry had no matching touch get one back-filled,
  so no history is lost.

## Superseded

- **0064 §1** — the stage set `new` · `assigned` · `sample` · `poc` ·
  `quotation`. **§3** — the `sample` and `poc` milestone rows and the fixed
  `sample` → `poc` → `quotation` order. **§7** — "five columns". **§8** —
  `sample-sent` and `poc-run` as stage triggers (they stay valid touch kinds).
- **0069 §7** — a template's milestone `sample` as a stage milestone (now an
  activity, §5). **§8** — the sub-rungs placed under sample/poc stages.
- **0071** — the stage label "Nhận PIC" for `assigned`; the accept door
  itself is unchanged.

## Out of scope

- Presales on a deal (presales turn).
- Do-not-contact enforcement (0067 D5, separate turn).
