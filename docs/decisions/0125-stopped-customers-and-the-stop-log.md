# 0125 · "Khách đã dừng": the nurturing page gets a re-contact tab and a stop log

Status: accepted (supersedes 0109 §5; refines 0109 §2 for the date chosen at park; reads 0097 for "Tạm hoãn")
Source: project owner's decisions in chat and on the design canvas, 23/10/2026

## Context

0109 §5 put "Nhóm chờ chăm sóc" at `/sales/nurturing` beside "Tạm hoãn", with
three tabs that reuse the existing lists. Nothing said when to call a parked
customer again, and nobody could see why deals and contracts stop. The owner
approved a page of two tabs and a menu that follows the customer, not the
state. This record is the decisions, not the implementation. Migration 0149.

## Decision

### 1 · Menus

- The menu "Đang chờ" is removed.
- "Tạm hoãn" (`/sales/holds`) becomes a sub item of "Lead".
- The nurturing page (`/sales/nurturing`, route unchanged) is renamed "Khách đã
  dừng" and sits in the "Khách hàng" menu after "Khách đã mua".
- "Báo cáo" is unchanged.

### 2 · The page: two tabs

`/sales/nurturing?tab=recare|log`, default `recare`. The old deal and contract
tabs are removed.

- **"Cần liên hệ lại"** — nurturing leads, grouped by
  `group=replied|due|later|none`; default `replied` when it has rows, else
  `due`. A row prints company and contact, the last park reason with "vào nhóm
  dd/mm", the re-contact badge and the button "Nhận lead".
- **"Nhật ký dừng"** — one row per stop decision (§3).

### 3 · The stop log

Rows are manual lead parks (including a hold ended toward waiting), deal stops
and contract terminations. The automatic parks EX-08 and EX-09 are not rows:
they repeat the deal or contract stop, and 0109's double count is avoided.

- **Row:** time, kind (`lead|deal|contract`), code, company, stage at the stop,
  actor, reason, note, and where it stands now. A lead is `waiting` while still
  nurturing and `reclaimed` after; a deal or contract is `ended`.
- **Stage at the stop:** a lead shows its state at the moment of park ("Chưa
  có" for parks before 0149); a deal shows the stage it stopped at; a contract
  shows the share collected, "Đã thu N%" of the contract value.
- **Counts for the same filter:** by reason, by stage and by actor, each sorted
  descending; the web shows the top 3 and "Khác".
- **Filters:** kind (all, lead, deal, contract), from/to date (default the
  current month), page.
- **Visibility:** each kind needs its own view permission (`lead.view`,
  `opportunity.view`, `contract.view`). An `ownOnly` actor sees only the stops
  they acted on; everyone else sees all.

### 4 · New data

- `touch.parked_from` — the lead state at the moment of park; only on
  `kind='nurtured'`.
- `lead.recontact_on` — only while `state='nurturing'`; cleared with
  `exit_reason` and `exited_at` on every exit from the pool.
- `lead.replied_from_pool_at` — set when a customer reply moves a nurturing
  lead to `new`; cleared as soon as the lead gets an owner or leaves `new`.
  "Vừa phản hồi" is state `new` with this set, newest first. Scope stays as
  0109 §4.
- A partial index on `touch (at DESC) WHERE kind = 'nurtured'` for the log.

### 5 · Re-contact date

Chosen when parking: in the lead park dialog (including the hold ended toward
waiting) and in the deal stop dialog. In the deal stop dialog it applies to the
lead only when that stop parks it (last live deal, nothing signed); otherwise
the field is hidden.

- Choices: 1 tháng · 3 tháng (default) · 6 tháng · Chọn ngày · Không hẹn.
- The date must be after today; absent means none.
- No bell rings when the date arrives: the lead moves to "Đến hạn".

### 6 · Groups

All three on `state='nurturing'`. `due` is the re-contact date on or before
today (Asia/Ho_Chi_Minh), `later` after today, `none` with no date. Due and
later sort by date ascending; none by time of entering the pool, newest first.

### 7 · Not changed

The lead state label `nurturing` ("Nhóm chờ chăm sóc") is not renamed; only the
page, menu and link strings change. No notification kind or setting key
changes in 0149.

## Defaults taken

The owner has not ruled on these; they are accepted defaults.

- **(a)** The automatic EX-08 and EX-09 parks are not stop-log rows.
- **(b)** An `ownOnly` actor sees only their own stops in the log, and the
  "Vừa phản hồi" group is empty for them, because pool leads in `new` are
  outside their scope (0109 §4).
- **(c)** The state label "Nhóm chờ chăm sóc" is not renamed.
- **(d)** The re-contact date defaults to 3 months and rings no bell.
- **(e)** Clicking "Lead" in the header still opens the lead book; only the
  chevron opens its menu (`AppHeader` in `@pv/ui` renders an app with both
  `items` and `onClick` as a split button).

## What this supersedes

- **0109 §5** — the page with three tabs; replaced by §2 here.
- **0097** — the header placement of "Tạm hoãn" (0097 text does not state it); now a sub item of
  "Lead" (§1).

## Consequences and known limits

- Parks before 0149 have no stage at the stop and print "Chưa có".
- A parked lead with no date never reaches "Đến hạn" and nobody is told.
- Law 12/13 on the new tabs have not been checked in a browser.
- An automatic park is told apart by having no actor, not by its reason: a person may pick EX-08 or
  EX-09 by hand, and that park is a row.
- The note of a lead park is cut from the timeline sentence on `touch.note`; rewording that sentence
  turns the notes of older parks into "Chưa có".
- In the stage bar every contract counts as one slice, "Hợp đồng đã ký"; the row keeps the share
  collected.
