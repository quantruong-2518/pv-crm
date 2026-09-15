# 0047 · `/waves` state table treats `DRAFT`-with-waves as a legitimate reopen path; `/start` is one atomic UPDATE

Status: accepted
Source: docs/ban-giao-campaign.md — section "Lượt 30/08 — soát lại toàn cụm, và ba thứ bịt được nhờ soát chéo", items 1 and 2

## Context

Cross-review (two independent passes, each reading code the other branch had
written) found two defects `pnpm check` stayed green on.

**`RUNNING` is a TRANSIENT state — the original `/waves` rule was wrong from
the start.** The first version of `POST :code/waves` required
`state === 'RUNNING'`. That sounded reasonable until read next to
`CampaignSweeper` (ADR 0045): `closeFinished()` lowers `RUNNING → DONE` the
moment every `mail_run` has settled, on the worker's poll cadence. A
single-wave campaign, fired immediately, is `DONE` within minutes — **no
further wave can ever be added the next day**, meaning this door cannot do
the one job it exists to do. At the same time, a `DRAFT` campaign that
already has waves (a legacy of an old modal bug) was a dead end: `/start`
only leads to `/waves`, `/waves` only leads back to `/start`, `PATCH` never
changes state, and the sweeper never touches `DRAFT`.

## Decision

One rule for both cases:

| `state`   | `waveCount` | `/waves`                                                                   |
| --------- | ----------- | -------------------------------------------------------------------------- |
| `STOPPED` | any         | 409 — stopping is a deliberate decision                                    |
| `DRAFT`   | `0`         | 409 — the FIRST wave goes through `/start`, so the log can tell them apart |
| `DRAFT`   | `> 0`       | ALLOW — the only path that brings a legacy campaign back to normal         |
| `RUNNING` | any         | ALLOW                                                                      |
| `DONE`    | any         | ALLOW — adding a wave REOPENS the campaign                                 |

When allowed while not yet `RUNNING`, the state is raised to `RUNNING`
**before** `mas.send()` — the same logic as decision #5 in ADR 0009. The
sweeper closes it back to `DONE` on its own once the new wave settles; the
lifecycle closes itself, no extra mechanism added.

**`/start` is now one statement, not read-then-write.** `byCode()` → check
`state` → `setState('RUNNING')` was two separate commands. Two overlapping
requests could both see `DRAFT` and **both fire real mail**; `eventKey` only
guards against duplicates WITHIN one `mailRunId`, and the second request
generates a new run, hence a new key.

`startIfDraft(code)` is `UPDATE … WHERE code = $1 AND state = 'DRAFT'
RETURNING code`; 0 rows ⇒ 409. Plus one read-guard ahead of it: reject when
`waveCount > 0`, since a campaign that has already fired but is still
`DRAFT` is exactly the dead-end case above.

## Consequences

Any future route that transitions campaign state must go through this same
table and the same atomic-UPDATE pattern — a read-then-write pair on
`campaign.state` reopens the double-fire race `startIfDraft` was built to
close.
