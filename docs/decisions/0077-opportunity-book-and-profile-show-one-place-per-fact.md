# 0077 · The deal shows its signed value and its contracts; the book gains forecast and last activity; the profile keeps one place per fact and per action

Status: accepted (amends 0076 §4 single `edit` verdict; amends the sign drawer's earlier wording that the deal value "stays unchanged / is not accumulated", see 0022 context)
Source: project owner's decisions, design review of the opportunity book and profile, 02/10/2026

## Context

0022 is deferred by 0069 until the quote object exists, so each sign request
carries its own amount, currency and contract kind. The sign drawer read that as
"the deal value does not change, not accumulated", which leaves a deal with
three contracts still showing one pre-signing number. The profile also grew
several places for the same fact (Email tab, History tab, inline read panel,
care-activity card, an always-open edit form).

## Decision

### 1 · Deal value

Before any signed contract the deal shows its own amount as "Giá trị dự kiến".
Once contracts are signed it shows "Giá trị đơn": the sum of signed contracts in
the deal's currency, computed on read, display only. The deal's amount is never
overwritten. Contracts in another currency are not summed; they are listed
separately. Pending sign requests do not count.

### 2 · Many contracts per deal

A deal may sign many contracts. The profile lists them: code or "Chưa có mã",
kind, date and person, amount, status. "Ký thêm hợp đồng" sits in the header of
that card on a won deal and is hidden while a sign request is pending. The first
contract still goes through "Chốt thắng".

### 3 · No forecast column

A forecast column (buckets of `probability`) was drawn and then dropped by the
owner the same day: the book shows no forecast. `probability` stays a field the
seller enters with the terms ("Sửa phiếu").

### 3b · The book's deal cell

As the lead book's company cell: the deal's title over `contact · email`,
the address opening the system's mail composer. No separate Email column.
No quick-filter row: "overdue in stage" stays in the filter menu.

### 4 · "Hoạt động cuối" on the book

Latest of customer-facing comms (call, meeting, mail, Zalo), care activities and
quotations. System events do not count. Colour thresholds are set in sales
configuration; default amber from 6 days, red from 9.

### 5 · The edit verdict is split

- Terms (amount, expected close date, products): locked while a sign request is
  pending and on won or lost deals.
- Details (contacts, description, attachments): editable until lost.
- Owners: their own "Sửa" on the owners card edits the BD lane until lost. The
  seller changes only through "Giao Sale" (open deals past `new`, no sign
  request waiting); on a signed deal the seller is read-only, as the code
  already enforces.

### 6 · Profile layout

One place per fact, one place per action.

- No Email tab and no History tab. History lives in the workstream drawer,
  opened by "Xem workstream".
- Contact timeline cards open the comm detail screen, not an inline read panel.
- Gọi / Zalo / Gửi mail live only in a floating action bar and ask which deal
  contact.
- The care-activity card is removed; activities appear in the workstream drawer.
- The always-open edit form and its save bar are removed.
- Activity and quotation buttons follow the server's acts (0076), so they
  remain on won deals and while signing is pending.
- A won deal has no next step: 0069 §10 stands, signing drops it.

## Amends

- **0076 §4** — `edit` splits into terms and details (§5 here).
- **Sign drawer wording** — "deal value unchanged, not accumulated" is replaced
  by §1: the stored amount is untouched, the displayed "Giá trị đơn" is derived.

## Out of scope

- Real attachment upload: attachments stay name-only until a storage decision.
- Do-not-contact enforcement (0067 D5).
