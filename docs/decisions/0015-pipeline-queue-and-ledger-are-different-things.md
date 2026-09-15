# 0015 · Pipeline, queue and ledger are three different things, and four rules govern every pipeline

Status: accepted
Source: docs/tam-nhin-pipeline-toan-he.md §1 ("Three different things being
called by one name") and §2 ("Four rules that make up 'orderly'")

## Context

"Bring every workstream into order" without separating these three concepts
produces fifteen kanban boards nobody drags a card on.

## Decision

Three categories, not to be conflated:

| Kind         | Definition                                                                                    | Existing example                         |
| ------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Pipeline** | An object moves through ORDERED stages, each stage has a deadline, and it LEAVES for a reason | opportunity's 3 columns · `MailRunState` |
| **Queue**    | Work sorted by PERSON, no stages — it arrives, then it leaves                                 | `E3.pending(actor)` · `outbox`           |
| **Ledger**   | Append-only events, no state to "move toward"                                                 | `touch` · `mail_event`                   |

Market reference point: Margince's daily screen is **not** a pipeline — it is
`Morning brief · CRM updates · Approval inbox`. Users do not walk into a
pipeline, they walk into a **queue**. A pipeline is something to measure and
report on.

Four rules make a pipeline "orderly" — without all four, adding more
pipelines is meaningless:

1. **Every object must be placeable on exactly one pipeline.**
   `pipeline_position` (`tam-nhin-pipeline.md` §6) is a pure function,
   computed at read time. Any object this function cannot return a position
   for does not exist in the system. This is the only forcing function.
2. **Every stage must have a `limitDays`**, living in `config_entry`, not in a
   fixture. A stage with no clock is a stage things get parked in.
3. **Every non-reversible step must go through E3**, never a direct `PATCH`.
4. **No leaving a pipeline without a reason**, and each pipeline **declares
   whether its own list of reasons is CLOSED or OPEN** — no pipeline shares a
   reason list with another. The system currently has exactly two, distinct on
   purpose: `EXIT_REASONS` — 6 values, **closed** (a lead died before becoming
   an opportunity) and `LOSS_REASONS` — 7 values, **open** (a quoted deal was
   lost). Today this rule is **broken** — drop-reason labels still read from
   a fixture (`fix-later.md` §6).
