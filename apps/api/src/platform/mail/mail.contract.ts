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

export type SuppressionReason = 'hard_bounce' | 'complaint' | 'manual'

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
}

/** Written by the branch, inside `tx`. Implemented by the ledger repository;
 *  declared here so the branch never has to import the repository's file. */
export interface MailEnqueue {
  enqueue(tx: Db, intent: MailIntent): Promise<void>
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
}

export type WebhookOutcome = 'applied' | 'ignored-duplicate' | 'ignored-stale' | 'unknown-delivery'

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
