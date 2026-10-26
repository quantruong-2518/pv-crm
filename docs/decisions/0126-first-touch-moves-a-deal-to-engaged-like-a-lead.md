# 0126 · The first real touch moves a deal to `engaged`, as it moves a lead to `working`

Status: accepted (amends 0072 §3: a care activity is no longer the only way into `engaged`)
Source: project owner's decision in chat, 26/10/2026 — "lead và cơ hội phải giống nhau"

## Context

A lead leaves `assigned` at its first real touch (0068 §1, 0123). A deal at
`assigned` left only through a care activity (0072 §3), so a call or a letter to
the customer left the deal's column unchanged while the lead beside it moved.

## Decision

- A call or message logged on a deal, and a letter that went out to it, move a
  deal standing at `assigned` to `engaged`, once. Later touches move nothing.
- A logged turn moves it only for someone `opportunity.edit` lets act on THIS
  deal (scoped). A letter moves it whoever sent it, as on a lead, written in the
  holder's name; a deal with no holder stays put.
- Held, lost and signed deals are untouched. Care activities still move it as
  before (0072 §3).

## Not done

A meeting marked held on a deal does not move it yet: the meeting module sits
below the deal module, so it needs its own hook.
