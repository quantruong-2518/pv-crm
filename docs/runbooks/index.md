# Runbooks

Manual verification procedures for things the repo deliberately does not cover
with automated tests. Architecture and decisions stay in `docs/decisions/`;
these files only say how to check the behavior by hand.

- [`mail-verification.md`](./mail-verification.md) — the manual cases for
  the queued mail pipeline (bulk runs; ADR 0085 retired the internal mails): scratch
  database, running the API + worker, and what each case must show.
- [`mail-pre-launch-checklist.md`](./mail-pre-launch-checklist.md) — what to
  check before flipping `PV_EMAIL_ENABLED=true`: DNS records, Fly secrets, the
  canary send.
- [`mail-dead-letter-recovery.md`](./mail-dead-letter-recovery.md) — how to
  read and release rows stuck in `state='dead'` in `platform.email_delivery`,
  and how to release a wrongly-suppressed recipient.
- [`neon-compute-and-worker.md`](./neon-compute-and-worker.md) — phased
  production runbook for reducing Neon polling/compute waste without weakening
  the mail outbox, scheduled campaigns, worker recovery, or health semantics.
