# 0041 · Resend AUP risk on purchased leads — no hard block, four automated guardrails instead

Status: accepted
Source: docs/ban-giao-mas-mail.md — section "AUP của Resend — và vì sao nó đổi thiết kế"

## Context

Resend's [Acceptable Use Policy](https://resend.com/legal/acceptable-use),
checked 28/08 and updated 27/08/2026, bans "cold outreach, purchased lists, or
scraped contact data" and requires recipients to have explicitly opted in.
Two hard ceilings apply: bounce < 4%, complaint < 0.08% — crossing either
means the **account** may be shut down without warning, not just the sending
domain.

The `APOLLO` lead source is purchased data. A purchased B2B list typically
carries 10–30% dead addresses, so a 200-row batch can produce 20–60 bounces —
5–7× the ceiling. The risk is not whether anyone notices the source label; it
is that the number reports itself after exactly one batch.

## Decision

**The project owner considered this and decided NOT to hard-block** sending
to purchased-source leads. The source label is internal data and never
travels inside the letter — Resend does not detect by label, it measures
bounce and complaint rate.

Instead of a ban, four machine guardrails:

| Guardrail                        | What it does                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| Preflight **warning**            | Shows "N/M leads from Apollo". Does not block the click — the decision stays with the human |
| **Circuit breaker** mid-run      | Bounce rate crossing `PV_MAS_BOUNCE_CEILING_PERCENT` (default 4.0) → the run TRIPS itself   |
| `PV_MAS_RESEND_API_KEY`          | Left blank = shares the current key. Filling it in separates the account, no code change    |
| Batch ceiling `PV_MAS_BATCH_MAX` | Default 200                                                                                 |

The circuit breaker is the one that matters most while still on **one**
account: it is the only thing stopping a bad list from firing all 200 rows
before a human looks at the screen.

## Consequences

**Still open, not decided:** which source counts as "opted in".
`LANDING_PAGE` is treated as opted-in today, but a visitor filling a contact
form only consents to _being answered_, not to _receiving a marketing
sequence_ — cutting this properly needs a separate opt-in checkbox on the
form. `IMPORT` cannot be told apart by the machine between a conference list
and a purchased list — cutting this properly needs a `consent_at` column on
`lead`, filled in by whoever imports the file.
