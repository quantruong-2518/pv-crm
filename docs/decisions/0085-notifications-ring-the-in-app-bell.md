# 0085 · Notifications ring the in-app bell; the three internal mails are dropped

Status: accepted (partially supersedes 0010 on the internal lead-intake mail and its mailbox, 0069 §13)
Source: owner decisions 27/09/2026 (flow H, `.claude/HANDOFF-workstream-loop.md`) and 11/10/2026 (wave 1 scope; session notes)

## Context

E4 today decides three internal mails: lead intake accepted, opportunity
opened, opportunity lost. Each goes to one shared mailbox from env, so nobody
is told personally and nothing opens the thing it is about. ADR 0067 already
said the lead-intake mail gives way to the bell; ADR 0069 §13 kept the two
opportunity mails and deferred the bell "for every object". This is that turn.

## Decision

### 1 · The bell only

A notification is a row a person sees in the app, with an unread count, and a
click opens the object it is about. The three internal mails are dropped; no
second channel is added in their place.

### 2 · Wave 1 scope

Wave 1 is the hub plus every moment whose recipient the data can already name.
Clock-driven reminders (due, overdue, meeting today) are wave 2: no pg-boss
schedule and no clock-driven reminder in wave 1. The one new sweep is a
purge, not a reminder: it deletes READ rows older than 90 days, hourly, in
both the API and the worker process. Unread rows are never purged.

### 3 · Audience

A role audience is every active holder of the matching permission
(`lead.assign`, `opportunity.accept`) in the `Sales` branch licence,
EXCLUDING `own_only` actors: someone who may only see their own could not open
what nobody holds yet. The owner confirmed the exclusion.
There is no recipient table to maintain: the permission is the list.

### 4 · No switch

No on/off switch, per person or org-wide. Every kind is on.

### 5 · Browser delivery

The browser refetches every 60 seconds and on window focus, like
`pendingApprovalsQuery`. No SSE, no websocket, no push.

### 6 · Defaults

An actor is never told about their own action · a REPEAT of the same
happening (a retry, a redelivered webhook, a second sweep) collapses to one row
· read rows are deleted after 90 days. The same kind on the same thing does not
collapse: event keys carry an occurrence (reply id, delivery id, approval chain
turn, the touch id of a hand-over), so a second hand-over or a second reply
rings again.

A customer reply always leaves an activity row: the touch kind
`customer-replied`, written by the system with no actor on every new reply, on a
lead in any state and on an opportunity. A reply that moves a lead
`assigned`/`verifying` → `working` writes a second, different fact beside it:
the system `exchange-logged` rung row, because without it park-then-resume
loses the rung. A reply never un-parks a `nurturing` lead and never moves an
opportunity's stage. A switched-off lead gets nothing. No KPI or rung reader
counts `customer-replied` as the holder's own contact.

Subjects are of eight kinds, including `lead-pool`. A file import that pools
leads rings ONE batched line; an opportunity import rings once per deal (known
gap).

`mail-run-sent` rings only for bulk runs; a 1-to-1 group letter does not ring
its sender. `mail-failed` rings when the worker gives up on a letter. A bounce
reported after the provider accepted the letter rings `mail-failed` only for a
1-to-1 group letter (`mail_run.kind = 'group'`) AND only once the ledger itself
holds the letter as lost (its delivery state is bounced or permanently failed),
to the sender and the subject's holder; one bounced address among several
recipients rings nobody, and a bulk run's bounces ring nobody individually.
Known limit: on the Gmail road a worker crash between recording the bounce and
ringing loses that line.

A screen "Tài khoản của tôi" at `/account` is open to every signed-in person:
identity and what the role allows, change password, Google connection, and the
requests the person has sent (`GET /approvals/mine`). It is where the bell
sends access-changed, password-reset, Google-link-broken and decided-approval
rows; a mail-run row opens the mail-run book at that run (`?run=`). The
`lead-removed` and `opportunity-unassigned` rows deliberately open nothing (the
record is no longer the reader's). The screen refreshes the session store on
arrival, so menu, gates and the screen change together; a dead session goes
through the normal expiry. The requests list is cut at the server's cap, with a
sentence on screen. Known limit: connecting Google from `/account` returns to
the home page (the server's callback target is fixed).

### 7 · The full list

`/notifications` is the bell's list: a press on the bell goes there, and the
drawer of the first wave is gone. The same `GET /notifications` takes
`unread=1`, `group` (one of six, from `NOTIFICATION_KIND_GROUP`, a total map so
a new kind cannot ship without a group) and `q`, all inside
`recipient_id = caller`. Search reads
the subject label, plus the printed sentence for rows that have no label
(account and Google rows); the actor and the reason are not searched, and
accents are not folded, as in every book. Filters live in the address, rows
arrive by scroll, and no migration or index was added. "Đánh dấu đã đọc hết" is
global, so the page hides it under a group or a search. Ship the API before the
web: an old API drops the three parameters without error.

## Shape

- E4 stays the pure decider (ADR 0010 #4): `plan()` turns an event and the
  rule table into intents. It reads no env and no database.
- A module reports WHAT HAPPENED under its own event name and resolves each
  audience to actor ids itself. It never picks a kind; the rule table does.
- The intents are written to ONE ledger, `platform.notification`, inside the
  caller's own transaction: if the fact rolls back, so does the bell.
  The other direction is a rule: a bell failure never rolls back the fact. The
  write runs under a SAVEPOINT and a failure is logged and dropped; the audience
  read (`NotificationHub.holding`) runs under its own savepoint and returns
  nobody on failure. On the reply path the branch hooks write facts (the lead's
  move, the activity rows), so they ride the `mail_reply` insert's own
  transaction: if a hook throws, the reply row rolls back with it and the signal
  is retried (Resend retries the webhook; the Gmail pass re-reads the thread and
  catches the failure per message, so later bounces in that thread are still
  read). Only the bell line is droppable.
  `UNIQUE (recipient, event key)` makes a second write a no-op, the same
  dedup place as ADR 0010 layer 1.
- No domain-event table. The facts already live in audit, touch, `mail_reply`,
  `mail_run`, the scan batch and `approval`; a third copy would be a place to
  drift. One known exception: when Google revokes a link the row is deleted and
  the bell line is the only trace. The notification row is only the
  pointer a person reads.
- By the ADR 0015 split this is a per-person queue (work arrives, then
  leaves), not a ledger of facts. Facts stay where they are.

## What this supersedes

- **0010** — the internal lead-intake mail, and decision #6's use of it: the
  branch no longer supplies a mailbox for internal mail. The send ledger,
  poll, `plan()`, templates and dedup layers stand; they still carry
  transactional and MAS mail.
- **0069 §13** — "This turn keeps the internal `opportunity-opened` /
  `opportunity-lost` mails" and the deferral of the bell. Both mails go.

Env `PV_LEAD_NOTIFICATION_TO` and `PV_OPS_NOTIFICATION_TO` are removed from
`env.ts`, `.env.example` and `fly.toml`, together with the rule that required
`PV_LEAD_NOTIFICATION_TO` whenever `PV_EMAIL_ENABLED=true`. Nothing replaces
them: a bell has no mailbox.

The two mail composers and three templates of the dropped internal mails are
deliberately KEPT so queued `email_delivery` rows can drain. Removing them is a
follow-up after the Neon queue is checked.

## Not in wave 1

- Clock-driven reminders (wave 2).
- Per-user preferences.
- Push delivery.
- Notifications whose recipient the data cannot name: the campaign owner is
  free text, and "operator" does not exist as a role. Open question 62.
- Contract instalment and milestone events: their tables have no writer.
  Open question 63.

## Alternatives rejected

| Alternative                    | Why not                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Keep the mails beside the bell | Two channels for one fact; the shared mailbox tells no one in particular     |
| Per-person on/off switch       | Owner: every kind is on; a switch is config nobody asked for                 |
| A domain-event table           | Audit and touch already hold the facts                                       |
| Push (SSE / websocket)         | A standing connection per API machine is compute that never sleeps (0010 #2) |

## Rollout

Hazards no file in git records.

1. Migration `0101_notification` must reach a database BEFORE the code deploys.
   Every emitter writes to that table; failures are swallowed by the savepoint,
   but the bell stays empty. Replies are worse: code deployed first would have a
   reply's activity row refused by the touch CHECK, so the reply rolls back and
   is retried until the migration lands. It ALSO widens `sales.touch`'s kind CHECK, so it
   takes a brief exclusive lock on a live table, and code that writes
   `customer-replied` must not deploy before it.
2. Drizzle skips by timestamp, and `0101` rewrites the touch-kind CHECK that
   `0097` (ADR 0084) also rewrote: a database must already hold `0097`/`0098`
   before `0101` runs. `0101` keeps `re-entered` in the list.
3. Replies only arrive when reply tracking is on: on the Gmail path, the worker
   running with mail enabled and the Google link configured; on Resend inbound,
   `PV_MAS_REPLY_TRACKING_ENABLED` and its webhook secret.
4. `GET /approvals/mine` has no index on `raised_by_id` yet (a later migration).
