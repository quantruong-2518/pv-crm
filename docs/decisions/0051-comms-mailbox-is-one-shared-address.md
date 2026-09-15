# 0051 · Comms mailbox is one shared `contact@` address, not one per person

Status: accepted
Source: docs/ke-hoach-thi-cong-comms.md §10 ("Four places to stop and ask, no
agent decides alone"), point 2, and §11 ("The four questions in §10, now
answered"), point 2 — a summary of `tam-nhin-giao-tiep-va-noi-dung.md` §17,
locked 14/09/2026

## Context

Whether the email capture door syncs one mailbox per salesperson or one
shared mailbox changes both §5a of the vision doc and the size of the OAuth
work.

## Decision

**One shared mailbox, `contact@`** — not a mailbox connected per person.
`comm.connect` (per-person mailbox connection) is deferred. Mail that cannot
be matched to an object keeps its full body, held until a deadline, instead
of being reduced to a count immediately. Catching the BCC address is done in
batch 2 (lượt 2) of the comms build.

## Consequences

This changes the shape of privacy wall (a) in ADR 0011 — the "no matching
`comms.identity` → count only, no body" rule now has a grace window before it
applies, held by a deadline, rather than applying at capture time.
