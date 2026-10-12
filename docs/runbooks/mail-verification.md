# Runbook — verifying the mail pipeline

Scope: the queued mail path — `platform.email_delivery` → relay → worker →
provider. Since ADR 0085 no lead intake or opportunity event sends an internal
mail; the bell replaced them. The mail that still goes through the ledger is
the bulk (MAS) run sent from a campaign's "Gửi đợt" action. The set-password
letter is posted inline, off the ledger, so it does not exercise this pipeline.

For why the pipeline is shaped this way (ledger-as-outbox, poll interval, the
three dedup layers, `event_key` format), see
[`docs/decisions/0010-transactional-mail-infrastructure-decisions.md`](../decisions/0010-transactional-mail-infrastructure-decisions.md).
That decision is why this file exists: decision #7 there is "no test files, a
runbook instead" — this is the runbook.

---

## Set up a disposable database

```bash
cd apps/api
SCRATCH=/tmp/pv-mail-check && rm -rf $SCRATCH
DATABASE_URL="pglite://$SCRATCH" npx drizzle-kit migrate
```

`.env` points **directly at Neon production** — every command below spells out
`DATABASE_URL` inline. Missing that once writes into real data.

## Run the API and the worker

Two commands, two terminals. On PGlite they must run **one at a time** (one
connection at a time); on Postgres/Neon they can run side by side.

```bash
COMMON='NODE_ENV=development PV_EMAIL_ENABLED=false'

# terminal 1 — HTTP
env $COMMON DATABASE_URL="pglite://$SCRATCH" PORT=4223 \
  node -r ts-node/register -r tsconfig-paths/register src/main.ts

# terminal 2 — worker
env $COMMON DATABASE_URL="pglite://$SCRATCH" PV_QUEUE_POLL_SECONDS=3 \
  node -r ts-node/register -r tsconfig-paths/register src/worker.ts
```

`PV_EMAIL_ENABLED=false` selects the console driver: the mail goes through the
whole pipeline and stops one step short of actually leaving the machine.

## The cases

| #   | Case                                       | How to trigger                                                              | Must show                                                                                 |
| --- | ------------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | One-recipient MAS run → exactly one mail   | send a run to one recipient, see below                                      | ledger has **1** row for that recipient · worker prints **1** `[console]` line            |
| 2   | Resend slow/down → the run still queues    | pull the network, then send a run                                           | the request succeeds as usual · row stays `pending`, `attempt_count` keeps incrementing   |
| 3   | _retired_ — was the duplicate-email intake | —                                                                           | intake no longer sends mail and no longer refuses a duplicate (ADR 0070, 0085)            |
| 4   | _retired_ — was the honeypot intake        | —                                                                           | the honeypot still writes its attempt row, but sends nothing now (ADR 0085)               |
| 5   | Worker dies before calling Resend          | `kill -9` mid-run                                                           | job gets handed back out, mail still goes exactly once                                    |
| 6   | Worker dies AFTER Resend accepted the send | `kill -9` between `send` and `markAccepted`                                 | retry with the same `Idempotency-Key` → Resend returns the old result, **no** second mail |
| 7   | 429 → honor `Retry-After`                  | force `PV_EMAIL_RATE_PER_SECOND=1` then burst                               | log shows the gate closed; no job calls Resend during that window                         |
| 8   | 400/401/403/422 → no endless retry         | set `RESEND_API_KEY` wrong                                                  | `state='failed_permanent'`, `attempt_count` does **not** keep climbing                    |
| 9   | Webhook with the wrong signature           | `curl` with no svix header                                                  | **401**, no row in `platform.email_webhook_event`                                         |
| 10  | Webhook with a duplicate `svix-id`         | resend the exact same payload                                               | second time returns `ignored-duplicate`, state unchanged                                  |
| 11  | Bounce/complaint → suppress                | webhook `email.bounced` type `Permanent`                                    | `platform.email_suppression` gets that address                                            |
| 12  | Backlog does not slow down HTTP            | queue a large run then time `/healthz`                                      | response time unchanged — HTTP never touches the queue                                    |
| 13  | DNS                                        | `dig`, see [`mail-pre-launch-checklist.md`](./mail-pre-launch-checklist.md) | SPF · DKIM · DMARC all return records                                                     |
| 14  | Worker restart does not lose a job         | `fly apps restart`                                                          | the `pending` row gets picked up by the next poll                                         |
| 15  | Controlled dead-letter replay              | see [`mail-dead-letter-recovery.md`](./mail-dead-letter-recovery.md)        | exactly one mail goes out, after a human has reviewed it                                  |

Case 1: start the API and worker on the scratch database, then use the
"Gửi đợt" action on a campaign profile with a single test recipient (test
mailboxes: `apps/api/src/seed-mail-leads.ts`). The old lead-intake `curl` no
longer produces a mail.

Check the ledger at any point:

```bash
curl -s http://127.0.0.1:4223/healthz/email
# {"status":"ok","ledger":true,"pending":0,"dead":0,"oldestPendingSeconds":null}
```
