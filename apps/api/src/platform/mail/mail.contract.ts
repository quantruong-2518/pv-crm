import type { MailEngagementKind } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'

/** THE SHARED VOCABULARY OF THE MAIL PATH.
 *
 *  Four pieces are being built against this file at once — the ledger, the
 *  provider driver, the queue worker, and the webhook door. Everything they
 *  must agree on lives here and nowhere else, so that agreement is a compile
 *  error when it breaks rather than a mail that silently never arrives.
 *
 *  What is deliberately NOT here: SQL, HTTP, and anything that knows Resend
 *  exists. This file is types and constants only. */

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

export const EMAIL_QUEUE = 'email.transactional'
export const EMAIL_QUEUE_DEAD = 'email.transactional.dead'

/** The whole job payload. Two identifiers and nothing else.
 *
 *  No recipient, no company name, no pain text. A job row is readable by
 *  anyone with database access and survives in the queue's history long after
 *  the mail is gone; personal data does not belong in it. The worker reads
 *  what it needs from `platform.email_delivery` when it runs. */
export type EmailJob = {
  deliveryId: string
  eventKey: string
}

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

/** One row of `platform.email_delivery` moves only FORWARD through this list.
 *
 *  A webhook can arrive out of order — Resend retries, and a replayed
 *  `email.sent` can land after `email.delivered`. Comparing rank before
 *  writing is what stops a late duplicate from dragging a delivered mail back
 *  to "sending". */
export const MAIL_STATES = [
  'pending',
  'sending',
  'accepted',
  'delayed',
  'delivered',
  'bounced',
  'complained',
  'suppressed',
  'failed_permanent',
  'dead',
] as const

export type MailState = (typeof MAIL_STATES)[number]

/** Rank, not order of declaration — several states share a rank because they
 *  are all terminal and none of them may overwrite another. */
export const MAIL_STATE_RANK: Record<MailState, number> = {
  pending: 0,
  sending: 1,
  accepted: 2,
  delayed: 3,
  delivered: 4,
  bounced: 5,
  complained: 5,
  suppressed: 5,
  failed_permanent: 5,
  dead: 6,
}

export function advances(from: MailState, to: MailState): boolean {
  return MAIL_STATE_RANK[to] > MAIL_STATE_RANK[from]
}

/** Why an ADDRESS is blocked. Four reasons, and `unsubscribe` is not a polite
 *  synonym for any of the other three.
 *
 *  A hard bounce is the receiving server saying the mailbox does not exist; a
 *  complaint is a person pressing "spam"; `manual` is an operator's decision.
 *  `unsubscribe` is the recipient using the link the letter was legally
 *  required to carry, and it is the only one of the four that must never be
 *  released without the person asking — which is exactly why it needs its own
 *  value rather than arriving as `manual`. A list that cannot tell an operator's
 *  block from a person's own request is a list somebody will eventually
 *  "clean up". */
export type SuppressionReason = 'hard_bounce' | 'complaint' | 'manual' | 'unsubscribe'

// ---------------------------------------------------------------------------
// The message and the provider
// ---------------------------------------------------------------------------

export type MailMessage = {
  from: string
  to: string
  replyTo?: string
  subject: string
  html: string
  /** Always sent. A body with no text part reads as bulk to several filters. */
  text: string
  headers?: Record<string, string>
}

/** Why a send failed, in the only three shapes the worker acts on.
 *
 *  `retry` waits and tries again with the SAME idempotency key. `rate-limit`
 *  additionally parks the whole queue — one job backing off while nine others
 *  keep hammering a 429 is not backoff. `permanent` never tries again. */
export type MailFailure =
  | { kind: 'retry'; code: string; summary: string }
  | { kind: 'rate-limit'; code: string; summary: string; retryAfterSeconds: number }
  | { kind: 'permanent'; code: string; summary: string }

export type MailSendResult = { ok: true; providerEmailId: string } | ({ ok: false } & MailFailure)

/** The one door out of this process.
 *
 *  `idempotencyKey` is a parameter rather than a field of the message because
 *  it identifies the INTENT, not the content: the same key must be reused by
 *  every retry of the same delivery, which is exactly what stops a worker
 *  crash between "Resend accepted" and "database updated" from sending twice. */
export interface MailPort {
  send(message: MailMessage, idempotencyKey: string): Promise<MailSendResult>
}

export const MAIL_PORT = Symbol('pv.mail.port')

// ---------------------------------------------------------------------------
// What a branch writes inside its own transaction
// ---------------------------------------------------------------------------

/** A mail the system intends to send, handed over in the SAME unit of work as
 *  the business change that justified it.
 *
 *  `eventKey` is the anti-duplicate spine: `<flow>/<audience>/v<n>/<code>`,
 *  UNIQUE in the ledger, reused as the Resend idempotency key. Same lead
 *  submitted twice, same worker retrying, same process restarting — one row,
 *  one mail. */
export type MailIntent = {
  eventKey: string
  eventType: string
  aggregateType: string
  aggregateId: string
  template: string
  templateVersion: number
  recipient: string

  /** The batch this letter is posted with, absent for a one-off such as the
   *  lead-intake notification. A `platform.mail_run` id — the composer reads
   *  the letter's subject/body/from off that row at send time. */
  mailRunId?: string

  /** Per-recipient substitution values — `{"company": "…"}`.
   *
   *  Carried on the INTENT rather than looked up later because the branch that
   *  queues the batch is the only half allowed to read `sales.lead`; by the
   *  time the worker composes, that door is shut. See `email_delivery.merge`. */
  merge?: Record<string, string>
}

/** Written by the branch, inside `tx`. Implemented by the ledger repository;
 *  declared here so the branch never has to import the repository's file.
 *
 *  `enqueueBatch` sits HERE and not on `MailLedger` alone, deliberately. It is
 *  the same act as `enqueue` — "N mails are owed" — and a MAS send is exactly
 *  a branch making that promise for two hundred recipients at once. Putting it
 *  on the full ledger instead would force the Sales branch to inject
 *  `MAIL_LEDGER`, which also carries `claim`/`markAccepted`/`suppress`; the
 *  narrow `MAIL_ENQUEUE` token exists precisely so a branch cannot reach those.
 *  A batch write is still a promise, not a send. */
export interface MailEnqueue {
  enqueue(tx: Db, intent: MailIntent): Promise<void>

  /** Many intents, ONE statement, inside the caller's transaction.
   *
   *  Returns HOW MANY ROWS WERE ACTUALLY INSERTED, which is rarely the length
   *  of `intents` and must not be assumed to be: `event_key` is unique, so a
   *  re-run of the same send — a retried request, a double-clicked button —
   *  writes nothing the second time and the honest answer is zero. That number
   *  is what `MasSendResponse.queued` reports, so guessing it here becomes a
   *  lie on somebody's screen.
   *
   *  `opts.nextAttemptAt` is how a SCHEDULED run waits: every row is written
   *  with the run's send time on its retry clock, and `pendingBatch()` already
   *  refuses to sweep a row that is not due. Scheduling therefore needs no
   *  second scanner — see `mail_run.scheduled_at`. */
  enqueueBatch(
    tx: Db,
    intents: MailIntent[],
    opts?: { nextAttemptAt?: Date | null },
  ): Promise<number>
}

export const MAIL_ENQUEUE = Symbol('pv.mail.enqueue')

// ---------------------------------------------------------------------------
// What the worker and the webhook door ask of the ledger
// ---------------------------------------------------------------------------

/** Everything needed to build and send one mail, read fresh at send time.
 *
 *  Read FRESH is the point: between the moment a delivery was queued and the
 *  moment it runs, the recipient may have unsubscribed or hard-bounced. A
 *  payload captured at enqueue time cannot know that. */
export type DeliveryToSend = {
  id: string
  eventKey: string
  eventType: string
  aggregateType: string
  aggregateId: string
  template: string
  templateVersion: number
  recipient: string
  idempotencyKey: string
  attemptCount: number

  /** Which batch posted this letter, or `null` for a one-off. The MAS composer
   *  reads the run to find the subject, the body and the sending address; a
   *  `null` here on a `mas-v1` delivery is a row that cannot be composed, and
   *  it fails loudly rather than going out with a default body. */
  mailRunId: string | null

  /** The substitution values for THIS recipient, or `null` when the template
   *  needs none. Read off the delivery row rather than from the branch's
   *  tables — that is the whole reason the column exists. */
  merge: Record<string, string> | null
}

export type WebhookOutcome = 'applied' | 'ignored-duplicate' | 'ignored-stale' | 'unknown-delivery'

/** WHAT THE RECIPIENT DID — a SECOND, WEAKER axis, deliberately kept off
 *  `email_delivery.state`.
 *
 *  `MailState` above answers "did the letter arrive", is decided by receiving
 *  servers, and only ever moves forward through `advances()`. An open or a
 *  click answers "did a person do something with it" and answers it badly:
 *  Apple Mail Privacy Protection invents opens, Gmail's image proxy hides all
 *  but the first, images-off registers none. Letting either of them touch the
 *  ladder would corrupt a hard signal with a soft one, in a column no screen
 *  could then explain. So these land in `platform.mail_event` as additive rows
 *  and `advances()` never sees them — see `mail.schema.ts`.
 *
 *  Two ways in, and the row is identical either way:
 *   · `providerEmailId` — Resend's webhook names the mail, not the row;
 *   · `deliveryId`      — our own unsubscribe route already holds the row id,
 *                         because it read it out of a signed token.
 *  Both are optional and at least one must be present; neither one present is
 *  `unknown-delivery`, the same answer as an id that matches nothing. */
export type MailEngagement = {
  /** The webhook envelope this arrived in, or `null` for an event this system
   *  raises itself. When present it is inserted as the replay shield FIRST,
   *  before anything is looked up — same order, same reason, as
   *  `applyWebhook`. */
  svixId: string | null
  kind: MailEngagementKind
  providerEmailId?: string | null
  deliveryId?: string | null
  /** The provider's moment, not our receive time — part of the uniqueness key
   *  `mail_event_once`, so a webhook retried an hour later still collapses
   *  onto the row it already wrote. */
  at: Date
  /** CLICK only, and CLICK always. `mail_event_url_matches_kind` refuses both
   *  a click with no destination and an open that carries one. */
  url?: string | null
}

/** `recorded` — a new row exists. `ignored-duplicate` — this exact engagement
 *  is already in the ledger, by envelope or by (delivery, kind, moment).
 *  `unknown-delivery` — nothing here names a row this system sent. None of the
 *  three is an error; all three are ordinary outcomes of a public door. */
export type EngagementOutcome = 'recorded' | 'ignored-duplicate' | 'unknown-delivery'

export interface MailLedger extends MailEnqueue {
  /** Move `pending`/`delayed` → `sending` and bump the attempt counter.
   *  Returns null when the row is gone or already past sending, which is what
   *  makes a redelivered job harmless. */
  claim(deliveryId: string): Promise<DeliveryToSend | null>
  markAccepted(deliveryId: string, providerEmailId: string): Promise<void>
  /** `dead` parks the row for a human; everything else keeps it retryable. */
  markFailure(
    deliveryId: string,
    failure: MailFailure,
    opts: { dead: boolean; nextAttemptAt: Date | null },
  ): Promise<void>
  markSuppressed(deliveryId: string, reason: SuppressionReason): Promise<void>
  isSuppressed(recipient: string): Promise<boolean>
  suppress(
    recipient: string,
    reason: SuppressionReason,
    source: 'resend' | 'operator',
  ): Promise<void>

  /** Idempotent by `svixId`: the same event replayed changes nothing.
   *  State only moves forward — see `advances`. */
  applyWebhook(event: {
    svixId: string
    type: string
    providerEmailId: string | null
    state: MailState | null
    reason?: string
    at: Date
  }): Promise<WebhookOutcome>

  /** Record an open, a click or an unsubscribe. NEVER touches
   *  `email_delivery.state` — see `MailEngagement` for why that separation is
   *  the whole design, and `applyWebhook` for the path that DOES move a row.
   *  Idempotent twice over: by `svixId` when one is given, and by
   *  `mail_event_once` always. */
  recordEngagement(engagement: MailEngagement): Promise<EngagementOutcome>

  /** The address one delivery was written to, or `null` when no such row
   *  exists. The unsubscribe route needs it and has no other way in: a signed
   *  token carries a delivery id, while `email_suppression` is keyed by
   *  address. A read with no decision in it, so it belongs on the ledger
   *  rather than in the controller. */
  recipientOf(deliveryId: string): Promise<string | null>

  /** Rows owed a job, oldest first.
   *
   *  This is the seam that makes the ledger — not the queue — the source of
   *  truth. A row is written inside the branch's transaction and nothing else
   *  happens; the worker sweeps for `pending` rows that are due and puts them
   *  on the queue. So a queue that was down, a `send` that failed, a job the
   *  broker lost, and a machine that died mid-enqueue all converge on the same
   *  recovery: the row is still `pending`, so it is swept again.
   *
   *  Enqueuing the same delivery twice is safe by construction — `claim()`
   *  hands a row to exactly one runner — so the sweep does not need to track
   *  what it has already sent. */
  pendingBatch(limit: number): Promise<EmailJob[]>

  /** For `/healthz/email` and the runbook. */
  queueHealth(): Promise<{ pending: number; oldestPendingSeconds: number | null; dead: number }>
}

export const MAIL_LEDGER = Symbol('pv.mail.ledger')
