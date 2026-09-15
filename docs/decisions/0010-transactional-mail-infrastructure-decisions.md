# 0010 · Seven transactional mail infrastructure decisions — outbox, poll, pure E4

Status: accepted
Source: docs/ban-giao-mail.md — table "Seven decisions locked in"

## Context

Scope — one letter, no more: build the shared send ledger
(`platform.email_delivery`) and the transport for EVERY transactional mail,
before MAS mail (bulk send) plugs into it.

## Decision

| #   | Decision                                                                      | Reason                                                                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **One** `platform.email_delivery` table, no split outbox/delivery             | A shared send ledger for both transactional and MAS. `campaign_run_id` is already there, nullable. Two send-log tables is two places answering the same question, and they will drift apart one day                                                                                                                                                        |
| 2   | **The send ledger IS the outbox**; a relay in the worker turns rows into jobs | Putting pg-boss inside the HTTP process is a standing connection per API machine — on Neon that is compute that never sleeps. And the dependency direction would flip: the branch would need the queue, the queue would need the mail module                                                                                                               |
| 3   | **4s poll** (`PV_QUEUE_POLL_SECONDS`) + `batchSize: 2` to enable burst        | Still a cost, not just latency — but now paid ONCE, for the wait before the first letter. The speed ceiling used to be `batchSize: 1`: pg-boss skips `burstWhenBatchFull` at batch size 1, so the worker sends one mail then sleeps a full cycle — 2 mails/12s through one door for 4 mails/second. The real send pace is still `PV_EMAIL_RATE_PER_SECOND` |
| 4   | **E4 becomes a pure decision set** — `plan()` replaces `emit()`               | An in-RAM dedup log dies with the process, and two machines are two separate copies. Dedup moves down to `UNIQUE(event_key)`, where it actually holds                                                                                                                                                                                                      |
| 5   | **Templates live in their own package `@pv/mail-templates`**                  | `eslint.config.js` block 3b bans `apps/api` from importing react. A separate package keeps that rule intact; the server only calls a pure function                                                                                                                                                                                                         |
| 6   | **The branch supplies the mailbox, E4 keeps the channel + template**          | The engine must not read env, yet the mailbox is deployment data: staging and production run the same rule table against two addresses                                                                                                                                                                                                                     |
| 7   | **No test files; a runbook instead**                                          | The repo's rule, and the project owner decided on manual verification. 15 cases live in `docs/runbooks/mail-verification.md`                                                                                                                                                                                                                               |

## Dedup, in three layers

Decision #4 moves dedup out of RAM, but the guarantee is three mechanisms, each
covering a failure the others cannot see:

| Layer         | Mechanism                                                                     | Stops                                                                             |
| ------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1 · Postgres  | `UNIQUE(event_key)` · `UNIQUE(idempotency_key)` · `UNIQUE(provider_email_id)` | A form submitted twice · the relay sweeping the same row twice · a webhook replay |
| 2 · `claim()` | `UPDATE … WHERE state IN ('pending','delayed')`                               | A job handed out again after a worker died                                        |
| 3 · Resend    | `Idempotency-Key = event_key`, valid 24 hours                                 | A worker dying AFTER Resend accepted the send but BEFORE the ledger recorded it   |

`event_key` is `<flow>/<recipient>/v<n>/<code>` — for example
`lead-intake/internal/v1/LD-0233`. One string reused by all three layers, and
that is exactly why it is generated nowhere except `plan()`.

State only moves **forward**, never back: `advances()` compares rank before
writing, so an `email.sent` replayed after `email.delivered` cannot pull the row
backwards.

Source: `docs/ban-giao-mail.md` § "Ba lớp chống trùng" — recovered before that
file was deleted.
