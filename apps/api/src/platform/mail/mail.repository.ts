import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import {
  type EmailJob,
  advances,
  type DeliveryToSend,
  type MailFailure,
  type MailIntent,
  type MailLedger,
  type MailState,
  type SuppressionReason,
  type WebhookOutcome,
} from './mail.contract'
import { emailDelivery, emailSuppression, emailWebhookEvent } from './mail.schema'

/** SQL only, per `apps/api/CLAUDE.md` — every branch below is a mechanical
 *  translation of a decision `mail.contract.ts` already wrote down
 *  (`MAIL_STATES`, `advances()`), never a new one made here. */
@Injectable()
export class MailRepository implements MailLedger {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** `ON CONFLICT (event_key) DO NOTHING`, not `DO UPDATE`: a branch re-running
   *  the same business event (retry after crash, the same lead submitted
   *  twice) must find the row already there and leave it exactly as the
   *  first writer left it. `tx`, never `this.db` — this call lives inside the
   *  caller's transaction, so an enqueue only survives if the business change
   *  beside it also commits. */
  async enqueue(tx: Db, intent: MailIntent): Promise<void> {
    await tx
      .insert(emailDelivery)
      .values({
        eventKey: intent.eventKey,
        eventType: intent.eventType,
        aggregateType: intent.aggregateType,
        aggregateId: intent.aggregateId,
        template: intent.template,
        templateVersion: intent.templateVersion,
        recipient: intent.recipient.trim().toLowerCase(),
        state: 'pending',
        idempotencyKey: intent.eventKey,
      })
      .onConflictDoNothing({ target: emailDelivery.eventKey })
  }

  /** Due, unsent, oldest first — see `MailLedger.pendingBatch`.
   *
   *  `next_attempt_at` is the retry clock the consumer writes on a failure;
   *  a row waiting out its backoff is not due yet, and sweeping it early would
   *  turn a paced retry into a hot loop. */
  async pendingBatch(limit: number): Promise<EmailJob[]> {
    return this.db
      .select({ deliveryId: emailDelivery.id, eventKey: emailDelivery.eventKey })
      .from(emailDelivery)
      .where(
        and(
          eq(emailDelivery.state, 'pending'),
          or(isNull(emailDelivery.nextAttemptAt), lte(emailDelivery.nextAttemptAt, new Date())),
        ),
      )
      .orderBy(asc(emailDelivery.createdAt))
      .limit(limit)
  }

  /** `pending`/`delayed` → `sending`, and only those two — a row already
   *  `sending`, terminal, or gone matches no row and comes back `null`. That
   *  is what makes a job the queue redelivers after a worker crash harmless
   *  instead of a second mail: the redelivered attempt claims nothing and the
   *  worker has nothing to send. */
  async claim(deliveryId: string): Promise<DeliveryToSend | null> {
    const [row] = await this.db
      .update(emailDelivery)
      .set({
        state: 'sending',
        attemptCount: sql`${emailDelivery.attemptCount} + 1`,
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(emailDelivery.id, deliveryId), inArray(emailDelivery.state, ['pending', 'delayed'])),
      )
      .returning()

    return row ? this.toDeliveryToSend(row) : null
  }

  async markAccepted(deliveryId: string, providerEmailId: string): Promise<void> {
    await this.db
      .update(emailDelivery)
      .set({ state: 'accepted', acceptedAt: sql`now()`, providerEmailId, updatedAt: sql`now()` })
      .where(eq(emailDelivery.id, deliveryId))
  }

  /** `dead` beats `failure.kind`: a worker that has decided to park a row for
   *  a human is stating that no further retry is coming, regardless of
   *  whether THIS particular attempt looked retryable. Otherwise `permanent`
   *  is terminal (`failed_permanent`) and anything else goes back to
   *  `pending` for the next attempt at `opts.nextAttemptAt`. The 500-char cut
   *  on the summary is defensive: a provider error string is free text from
   *  outside this process and this column is not the place for it to grow
   *  unbounded. */
  async markFailure(
    deliveryId: string,
    failure: MailFailure,
    opts: { dead: boolean; nextAttemptAt: Date | null },
  ): Promise<void> {
    const state: MailState = opts.dead
      ? 'dead'
      : failure.kind === 'permanent'
        ? 'failed_permanent'
        : 'pending'

    await this.db
      .update(emailDelivery)
      .set({
        state,
        nextAttemptAt: opts.nextAttemptAt,
        lastErrorCode: failure.code,
        lastErrorSummary: failure.summary.slice(0, 500),
        updatedAt: sql`now()`,
      })
      .where(eq(emailDelivery.id, deliveryId))
  }

  /** `reason` has nowhere else to live: `email_delivery` carries no
   *  suppression-reason column of its own, and the address-level reason on
   *  `email_suppression` explains why the ADDRESS is blocked, not why THIS
   *  row stopped. Writing it into `last_error_*` — the same pair
   *  `markFailure()` uses — keeps that answer next to the row instead of
   *  discarding an argument the interface asked the caller to pass. */
  async markSuppressed(deliveryId: string, reason: SuppressionReason): Promise<void> {
    await this.db
      .update(emailDelivery)
      .set({
        state: 'suppressed',
        lastErrorCode: reason,
        lastErrorSummary: `recipient suppressed: ${reason}`,
        updatedAt: sql`now()`,
      })
      .where(eq(emailDelivery.id, deliveryId))
  }

  /** `released_at IS NULL` is the entire predicate — a released address reads
   *  as not-suppressed, on purpose; see the column's comment in
   *  `mail.schema.ts`. */
  async isSuppressed(recipient: string): Promise<boolean> {
    const key = recipient.trim().toLowerCase()
    const [row] = await this.db
      .select({ one: sql`1` })
      .from(emailSuppression)
      .where(and(eq(emailSuppression.recipient, key), isNull(emailSuppression.releasedAt)))
      .limit(1)
    return row !== undefined
  }

  /** `released_at` is deliberately absent from the `DO UPDATE SET` list below,
   *  same trick as `ObjectMirror.putMany`'s excluded columns: a second
   *  `suppress()` call for an address a human already released must update
   *  `reason`/`source` without dragging `released_at` back to NULL and
   *  silently un-releasing them. `created_at` is left alone for the same
   *  reason — it names the FIRST time this address was suppressed, not the
   *  most recent. */
  async suppress(
    recipient: string,
    reason: SuppressionReason,
    source: 'resend' | 'operator',
  ): Promise<void> {
    const key = recipient.trim().toLowerCase()
    await this.db
      .insert(emailSuppression)
      .values({ recipient: key, reason, source })
      .onConflictDoUpdate({
        target: emailSuppression.recipient,
        set: { reason: sql`excluded.reason`, source: sql`excluded.source` },
      })
  }

  /** Three steps, each one a possible early exit — order matters.
   *
   *  (1) The dedupe insert runs FIRST and unconditionally: a replayed
   *  `svix_id` must be recognised before anything else is even looked up, or
   *  a retried webhook that arrives after its own effect was already applied
   *  could be evaluated a second time.
   *  (2) `provider_email_id` is how a delivery is found; no id, no delivery.
   *  (3) `advances()` — imported, not re-derived — is the single source for
   *  "does this move the row forward." A `null` incoming state cannot advance
   *  anything by definition, so it lands in the same `ignored-stale` bucket as
   *  a state that fails the rank check. */
  async applyWebhook(event: {
    svixId: string
    type: string
    providerEmailId: string | null
    state: MailState | null
    reason?: string
    at: Date
  }): Promise<WebhookOutcome> {
    const inserted = await this.db
      .insert(emailWebhookEvent)
      .values({ svixId: event.svixId, type: event.type, emailId: event.providerEmailId })
      .onConflictDoNothing({ target: emailWebhookEvent.svixId })
      .returning({ svixId: emailWebhookEvent.svixId })

    if (inserted.length === 0) return 'ignored-duplicate'
    if (!event.providerEmailId) return 'unknown-delivery'

    const [delivery] = await this.db
      .select({ id: emailDelivery.id, state: emailDelivery.state })
      .from(emailDelivery)
      .where(eq(emailDelivery.providerEmailId, event.providerEmailId))
      .limit(1)

    if (!delivery) return 'unknown-delivery'
    if (!event.state || !advances(delivery.state, event.state)) return 'ignored-stale'

    await this.db
      .update(emailDelivery)
      .set({
        state: event.state,
        deliveredAt: event.state === 'delivered' ? event.at : undefined,
        updatedAt: sql`now()`,
      })
      .where(eq(emailDelivery.id, delivery.id))

    return 'applied'
  }

  /** One round trip, not three: `/healthz/email` and the runbook both want
   *  all three numbers together, and `FILTER` lets Postgres compute them off
   *  a single scan instead of the app issuing three separate counts.
   *  `oldest_pending_seconds` is measured from `created_at`, i.e. when the row
   *  first entered the queue — a row `markFailure()` sends back to `pending`
   *  keeps its original age rather than resetting the clock on every retry. */
  async queueHealth(): Promise<{
    pending: number
    oldestPendingSeconds: number | null
    dead: number
  }> {
    const r = (await this.db.execute(sql`
      SELECT
        count(*) FILTER (WHERE "state" = 'pending')::int AS pending,
        count(*) FILTER (WHERE "state" = 'dead')::int AS dead,
        EXTRACT(epoch FROM now() - min("created_at") FILTER (WHERE "state" = 'pending'))::int
          AS oldest_pending_seconds
      FROM "platform"."email_delivery"
    `)) as { rows: { pending: number; dead: number; oldest_pending_seconds: number | null }[] }

    const row = r.rows[0]
    return {
      pending: row?.pending ?? 0,
      dead: row?.dead ?? 0,
      oldestPendingSeconds: row?.oldest_pending_seconds ?? null,
    }
  }

  private toDeliveryToSend(row: typeof emailDelivery.$inferSelect): DeliveryToSend {
    return {
      id: row.id,
      eventKey: row.eventKey,
      eventType: row.eventType,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      template: row.template,
      templateVersion: row.templateVersion,
      recipient: row.recipient,
      idempotencyKey: row.idempotencyKey,
      attemptCount: row.attemptCount,
    }
  }
}
