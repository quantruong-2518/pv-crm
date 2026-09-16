# 0014 · Reduce system scope to a Sales-only CRM; payment installments stay under Sales

Status: superseded by 0054 (payment-installments ruling below stands, see 0054)
Source: docs/tam-nhin-pipeline-toan-he.md §0 ("SCOPE CUT — locked in 15/09,
read before every other section"), §4·3, §8·1

## Context

The system was originally sketched across five branches: `One · Sales ·
Supply · Factory · Finance`, with eleven pipelines. As of 15/09/2026 the
project owner cut scope.

## Decision

**This system is a sales-department CRM. Everything outside Sales is
dropped.** Four pipelines leave the plan: **purchasing** (#6 `PR·PO·L`),
**production & handover** (#7 `SO·WO`), **equipment & maintenance** (#8
`CNC·BT`), and **Finance as a branch** (#9 — the payment-installment cluster
STAYS, because it is the next life of a contract, not an accounting ledger;
see below). The **post-sale service** area goes with them, staying a
completely empty slot.

Four previously open questions close as a result, not because anyone answered
them but because they stop being questions: is Finance in scope · does
post-sale get a new `ObjectKind` · do Supply and Factory get built for real or
just drawn · do `SO`/`WO` share one ladder or get separate ones.

**The cost paid in code is close to zero**, and that is worth recording, not
just celebrating — it proves the four dropped branches never really left
paper. `apps/api/src/branches/` only ever had one folder, `sales`; the
`sao-do.ts` fixture — the only place carrying the `SO → WO → PR → PO → L` and
`CNC → BT` chains — is imported by no screen; `das-vina`, the scenario every
live screen actually reads, only has `OP` `CT` `BG` `AC`. No ContextRail is
printing an object from a branch that was never going to be built.

**What stays, and why.** `Branch` still declares all five values, `ObjectKind`
still declares all thirteen, `PIPELINE_OF_KIND` still exhausts them. They are
compile-time guard rails: adding a kind and forgetting to declare its pipeline
is a build error, and `KIND_DOMAIN` missing eight kinds makes E2 **reject
every write** to them (patched 14/09, see ADR 0016). Deleting them trades a
guard rail already blocking something for an empty slot. Declared-but-unused
reads as "not built yet"; delete-then-rebuild is where bugs are born. The day
real cleanup is warranted, that is its own pass with someone reading the diff.

**Payment installments stay under Sales, `Finance` stops being a branch to
build.** Collecting installment payments against ONE contract is that
contract's next life: it reads the installment's `conditions[]`, it requires
`contract.record-payment`, and the person clicking the button is the
salesperson, not an accountant. Invoicing and receivables — which
`tam-nhin-bao-gia-hop-dong.md` §12 already placed out of scope — stay out of
scope. Where the installment cluster already sits is its correct place; what
is withdrawn is the ambition to build a fifth branch around it. `Branch` keeps
the `'Finance'` value for the compile-time-guard-rail reason above.

## Consequences

Building Supply/Factory screens before the runtime graph layer (E1 writing
edges at request time, not only in seed data) exists would be building a
house with no foundation — see ADR 0016.
