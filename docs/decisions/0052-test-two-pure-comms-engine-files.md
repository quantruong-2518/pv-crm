# 0052 · Write tests for `comms-rollup.ts` and `sequence.ts` — an explicit exception to the no-self-generated-test rule

Status: accepted
Source: docs/ke-hoach-thi-cong-comms.md §10 ("Four places to stop and ask, no
agent decides alone"), point 3, and §11 ("The four questions in §10, now
answered"), point 3 — a summary of `tam-nhin-giao-tiep-va-noi-dung.md` §17,
locked 14/09/2026

## Context

The repo's rule is no self-generated tests. But the sequence engine's exit
condition (`sequence.ts`) and the comms rollup (`comms-rollup.ts`) are two
pure engine files whose failure mode is silent — a wrong exit condition does
not throw, it just sends (or fails to send) the wrong step. An agent is not
allowed to grant itself this exception; it needs the project owner to say so
explicitly.

## Decision

**Yes** — write tests for `comms-rollup.ts` and `sequence.ts`, and only those
two files. No other screen or engine file built in the comms project gets a
self-generated test on this basis.

## Consequences

Any prompt directing an agent to build against the comms plan must carry this
exception by name; without it, the repo's default (no self-generated tests)
applies and these two files would ship unverified.
