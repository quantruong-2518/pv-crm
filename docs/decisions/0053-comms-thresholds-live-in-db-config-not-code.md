# 0053 · Comms thresholds and deadlines live in DB config, never hardcoded

Status: accepted
Source: docs/ke-hoach-thi-cong-comms.md §10 ("Four places to stop and ask, no
agent decides alone"), point 4, and §11 ("The four questions in §10, now
answered"), point 4 — a summary of `tam-nhin-giao-tiep-va-noi-dung.md` §17,
locked 14/09/2026

## Context

The comms plan has several numeric thresholds still unset: how long each
sequence step waits, how long a blob is retained, how many days of silence
counts as "first response." These are exactly the kind of number this repo
forbids typing straight into a screen or an engine file.

## Decision

**Every threshold lives in DB configuration, never as a literal in code.**
`config_entry` was the first candidate, but it cannot hold a scalar threshold
as-is (see `tam-nhin-giao-tiep-va-noi-dung.md` §18) — so the exact table this
lives in is still open (see `openDecisions`). The principle itself is not
open: hardcoding even one threshold is a blocking finding in review, not a
style note.

## Consequences

This blocks batches 1–2 (lượt 1–2) of the comms build, which need a working
threshold store, but does not block batch 0 (lượt 0), which has none of these
values yet.
