# 0079 · Lead profile review: meta facts as pills, the primary move on the bar, industry tags

Status: accepted (narrows 0078 §1 and §2 on where the primary move sits)
Source: project owner's decisions, review of the lead profile screen, 05/10/2026

Not to be confused: ADR 0078 (`0078-profiles-share-one-shell-with-a-run-rail.md`)
and the migration `apps/api/drizzle/0078_lead_industries.sql` share a number and
nothing else.

## Decision

### 1 · Meta facts are separate pills

The header of every profile shows its meta facts as separate pills, not one
dot-separated sentence. The reason: each fact must be findable at a glance. This
is the shared header (`apps/web/src/components/record/record-header.tsx`), so it
applies to all profiles. It replaces "one meta line" in 0078 §1.

### 2 · The primary move may live on the floating bar

The record's primary move may live on the floating action bar
(`apps/web/src/components/record/action-bar.tsx`), drawn last, instead of in the
todo card (`apps/web/src/components/record/todo-card.tsx`). Decided for the lead:
"Mở cơ hội".

This **narrows 0078 §1**, which said the primary move sits in the todo card and
not on the bar (and 0078 §2, "the primary move leaves the floating bar for the
'Việc cần làm' card"). The rule that survives: **one action, one place**. A
screen that puts the move on the bar must not also draw it in the card.

The opportunity and contract profiles have not moved: they still draw it as 0078
says. Whether they follow is open (`open-questions.md` 29). A primary move is
still drawn only from a server verdict (0078 §3, 0076 §4).

### 3 · Lead todo card and run strip wording

- The todo card on the lead is titled "Tiến trình lead".
- The run-strip link "Xem cây lượt" is now "Tiến trình tổng"
  (`apps/web/src/components/record/run-strip.tsx`).
- A rung with no date shows a short state word on its second line instead of
  staying empty.
- Rung cells size to their label.

### 4 · "Số nhà máy" leaves the lead and company forms

The field is removed from both forms. The column and the contract field `plants`
were deliberately **left in place**: dropping them is a destructive migration
nobody asked for. Known leftover, not a decision to keep them — see
`open-questions.md` 28.

### 5 · A lead carries free-text industry tags

- **"Ngành"** is a set of free-text tags on the lead. Notes only; never a routing
  input. The fixed list that routes leads is now labelled **"Nhóm ngành"**.
- **Ceilings, the owner's decision of 05/10/2026:** at most 4 tags, at most 20
  characters each. They are a decision, not a derivable number; the ledger is
  `LEAD_NUM.industriesMax` and `LEAD_MAX.industryTag` in
  `packages/contracts/src/sales/lead-fields.ts`.
- **Suggestions.** The tag box (`packages/ui/src/ui/tag-input.tsx`) suggests from
  what other leads already carry, so one industry keeps one spelling.
- **The vocabulary is shared across owners on purpose.** Anyone with `lead.view`
  sees tag strings from leads they do not hold — strings only. Consequence: **a
  tag is not a private field.**
- **Saved once when focus leaves the box**, so one edit is one timeline row.
- **An empty tag box does not count as an unfilled field.**

Storage: `apps/api/drizzle/0078_lead_industries.sql`; the suggestion read is in
`apps/api/src/branches/sales/lead/lead.controller.ts`.

## Amends

- **0078 §1 and §2** — see §1 and §2 here.

## Out of scope

- Any change to the opportunity or contract profile.
- Dropping `plants`.
