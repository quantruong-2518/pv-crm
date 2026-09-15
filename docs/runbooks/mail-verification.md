# Runbook — verifying the lead-intake notification email

Phase 1 scope: **one** internal email when `POST /sales/leads/intake` receives
a real lead. No customer-facing email yet, no campaign send.

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
COMMON='NODE_ENV=development PV_INTAKE_LANDING_PAGES=lien-he
        PV_LEAD_NOTIFICATION_TO=contact@pebblevina.com PV_EMAIL_ENABLED=false'

# terminal 1 — HTTP
env $COMMON DATABASE_URL="pglite://$SCRATCH" PORT=4223 \
  node -r ts-node/register -r tsconfig-paths/register src/main.ts

# terminal 2 — worker
env $COMMON DATABASE_URL="pglite://$SCRATCH" PV_QUEUE_POLL_SECONDS=3 \
  node -r ts-node/register -r tsconfig-paths/register src/worker.ts
```

`PV_EMAIL_ENABLED=false` selects the console driver: the mail goes through the
whole pipeline and stops one step short of actually leaving the machine.

## The 15 cases

| #   | Case                                        | How to trigger                                                              | Must show                                                                                 |
| --- | ------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | New lead → immediate 202, exactly one mail  | `curl` below                                                                | `{"accepted":true}` · ledger has **1** row · worker prints **1** `[console]` line         |
| 2   | Resend slow/down → intake still returns 202 | pull the network, then send                                                 | 202 as usual · row stays `pending`, `attempt_count` keeps incrementing                    |
| 3   | Duplicate email → NO new mail               | send the same `email` again                                                 | `lead_intake.status='duplicate'` · ledger **still 1 row**                                 |
| 4   | Honeypot → no mail                          | `"website":"http://spam.io"`                                                | `status='honeypot'` · no ledger row at all                                                |
| 5   | Worker dies before calling Resend           | `kill -9` mid-run                                                           | job gets handed back out, mail still goes exactly once                                    |
| 6   | Worker dies AFTER Resend accepted the send  | `kill -9` between `send` and `markAccepted`                                 | retry with the same `Idempotency-Key` → Resend returns the old result, **no** second mail |
| 7   | 429 → honor `Retry-After`                   | force `PV_EMAIL_RATE_PER_SECOND=1` then burst                               | log shows the gate closed; no job calls Resend during that window                         |
| 8   | 400/401/403/422 → no endless retry          | set `RESEND_API_KEY` wrong                                                  | `state='failed_permanent'`, `attempt_count` does **not** keep climbing                    |
| 9   | Webhook with the wrong signature            | `curl` with no svix header                                                  | **401**, no row in `platform.email_webhook_event`                                         |
| 10  | Webhook with a duplicate `svix-id`          | resend the exact same payload                                               | second time returns `ignored-duplicate`, state unchanged                                  |
| 11  | Bounce/complaint → suppress                 | webhook `email.bounced` type `Permanent`                                    | `platform.email_suppression` gets that address                                            |
| 12  | Backlog does not slow down intake           | fire 100 leads then time `/healthz`                                         | response time unchanged — HTTP never touches the queue                                    |
| 13  | DNS                                         | `dig`, see [`mail-pre-launch-checklist.md`](./mail-pre-launch-checklist.md) | SPF · DKIM · DMARC all return records                                                     |
| 14  | Worker restart does not lose a job          | `fly apps restart`                                                          | the `pending` row gets picked up by the next poll                                         |
| 15  | Controlled dead-letter replay               | see [`mail-dead-letter-recovery.md`](./mail-dead-letter-recovery.md)        | exactly one mail goes out, after a human has reviewed it                                  |

Case 1's `curl` — note `from` is a **query param**, not part of the body:

```bash
curl -s -X POST 'http://127.0.0.1:4223/sales/leads/intake?from=landingpage&landingPage=lien-he&utm_source=google' \
  -H 'Content-Type: application/json' \
  -d '{"company":"Công ty A","contactName":"Nguyễn Văn A","email":"a@x.vn","website":""}'
```

Check the ledger at any point:

```bash
curl -s http://127.0.0.1:4223/healthz/email
# {"status":"ok","ledger":true,"pending":0,"dead":0,"oldestPendingSeconds":null}
```

`NODE_ENV=production` requires the `fly-client-ip` header — `lead-intake.guard.ts`
rejects with 500 if it is missing. Fly Proxy sets that header; hitting the
machine directly with `curl` needs it added by hand:

```bash
curl … -H 'fly-client-ip: 203.0.113.44' -H 'Origin: https://…'
```
