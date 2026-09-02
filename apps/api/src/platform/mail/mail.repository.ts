import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import {
  type EmailJob,
  advances,
  type DeliveryToSend,
  type EngagementOutcome,
  type MailEngagement,
  type MailFailure,
  type MailIntent,
  type MailLedger,
  type MailReply,
  type MailState,
  type ReplyOutcome,
  type SuppressionReason,
  type WebhookOutcome,
} from './mail.contract'
import {
  emailDelivery,
  emailSuppression,
  emailWebhookEvent,
  mailEvent,
  mailReply,
} from './mail.schema'

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
      .values(rowOf(intent, null))
      .onConflictDoNothing({ target: emailDelivery.eventKey })
  }

  /** The same insert as `enqueue`, N rows at a time — and the return value is
   *  the whole reason it is a separate method.
   *
   *  ------------------------------------------------------------------
   *  TWO KINDS OF DUPLICATE, AND ONLY ONE OF THEM IS POSTGRES' JOB
   *  ------------------------------------------------------------------
   *  `ON CONFLICT (event_key) DO NOTHING` catches a key that is ALREADY IN THE
   *  TABLE — the retried request, the double-pressed button. It is not the
   *  right tool for two rows carrying the same key inside ONE statement: that
   *  case rests on speculative-insertion behaviour that differs between
   *  `DO NOTHING` and `DO UPDATE` and is not something a send count should
   *  depend on. So the batch is deduplicated here first, first occurrence wins,
   *  and the clause is left to do only the job it is good at.
   *
   *  `RETURNING` is what makes the count honest. Neither `intents.length` nor
   *  the driver's `rowCount` answers "how many letters will actually be
   *  attempted" — the first ignores conflicts entirely, the second is spelled
   *  differently by node-postgres and PGlite. A returned row is a row that
   *  exists.
   *
   *  Chunked because one statement carrying ten thousand rows is one statement
   *  Postgres plans, parses and locks as a unit; `MAS_MAX_RECIPIENTS` is 200
   *  today, so the chunk only ever matters for an import-sized batch, and it
   *  costs nothing to already be right for one. Same `tx` throughout: the
   *  chunks are not independent, they are one promise. */
  async enqueueBatch(
    tx: Db,
    intents: MailIntent[],
    opts: { nextAttemptAt?: Date | null } = {},
  ): Promise<number> {
    const unique = new Map<string, MailIntent>()
    for (const intent of intents)
      if (!unique.has(intent.eventKey)) unique.set(intent.eventKey, intent)

    const rows = [...unique.values()].map((intent) => rowOf(intent, opts.nextAttemptAt ?? null))
    if (rows.length === 0) return 0

    let inserted = 0
    for (let at = 0; at < rows.length; at += INSERT_CHUNK) {
      const written = await tx
        .insert(emailDelivery)
        .values(rows.slice(at, at + INSERT_CHUNK))
        .onConflictDoNothing({ target: emailDelivery.eventKey })
        .returning({ id: emailDelivery.id })
      inserted += written.length
    }

    return inserted
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
        /* THE PROVIDER'S OWN SENTENCE, KEPT — it used to be accepted as a
           parameter and then thrown away here.
           `mail-webhook.controller.ts` builds it carefully ("Permanent/General:
           mailbox does not exist"), and it is the only thing in the system that
           can tell "mailbox full" from "domain does not exist" — two words that
           call for opposite actions. Without this line `email_delivery` held a
           `bounced` row with a NULL summary, so `LeadMailTimelineRow.failReason`
           had nothing to print on precisely the rows it exists for, and the
           screen could only say "hỏng" to someone who needed to know why.
           Written only when the event carries a reason, so a `delivered`
           webhook cannot blank a summary a bounce left behind — and it never
           happens the other way round anyway, since `advances()` refuses any
           transition back down the ladder. */
        ...(event.reason
          ? { lastErrorCode: event.type, lastErrorSummary: event.reason.slice(0, 500) }
          : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(emailDelivery.id, delivery.id))

    return 'applied'
  }

  /** THE OTHER DOOR INTO THE LEDGER, AND IT WRITES A DIFFERENT TABLE.
   *
   *  Deliberately NOT a branch of `applyWebhook`, even though the first step is
   *  the same insert. That method exists to move `email_delivery.state` and
   *  every line in it is about `advances()`; this one must never reach that
   *  column, and the cheapest way to guarantee "never" is that the statement
   *  which could do it is not in this method. `mail_event` only ever grows.
   *
   *  Three exits, in order, and the order is the design:
   *
   *  (1) The envelope shield goes in FIRST and unconditionally, exactly as in
   *      `applyWebhook` — a replayed `svix_id` has to be recognised before a
   *      lookup, or a webhook redelivered after its effect landed gets
   *      evaluated twice. It also means a row that fails BELOW this point is
   *      not retried by Resend into a second attempt; that is the same trade
   *      `applyWebhook` already makes, and the failure it protects against
   *      (double counting) is the worse one here.
   *  (2) The delivery is found by row id when the caller has one — our own
   *      unsubscribe route does, out of a signed token — and otherwise by the
   *      provider's mail id, which is all a webhook carries.
   *  (3) `mail_event_once` is the second shield: two DIFFERENT envelopes can
   *      still describe the same open. `onConflictDoNothing` on that exact
   *      triple turns it into an answer instead of a thrown constraint, while
   *      leaving `mail_event_url_matches_kind` free to throw — a CLICK with no
   *      destination is a bug in the caller, not an ordinary input. */
  async recordEngagement(engagement: MailEngagement): Promise<EngagementOutcome> {
    if (engagement.svixId) {
      const seen = await this.db
        .insert(emailWebhookEvent)
        .values({
          svixId: engagement.svixId,
          /* The KIND, not a Resend event name. This column is a diagnostic
             beside a replay guard, and spelling `email.opened` here would be
             this file inventing provider vocabulary for a row that may not
             have come from a provider at all. */
          type: engagement.kind,
          emailId: engagement.providerEmailId ?? null,
        })
        .onConflictDoNothing({ target: emailWebhookEvent.svixId })
        .returning({ svixId: emailWebhookEvent.svixId })

      if (seen.length === 0) return 'ignored-duplicate'
    }

    const deliveryId = await this.deliveryIdFor(engagement)
    if (!deliveryId) return 'unknown-delivery'

    const written = await this.db
      .insert(mailEvent)
      .values({
        deliveryId,
        kind: engagement.kind,
        at: engagement.at,
        url: engagement.url ?? null,
        svixId: engagement.svixId,
      })
      /* No `target`, deliberately. `mail_event` now carries TWO uniqueness
         rules — `mail_event_once` on (delivery, kind, at) for provider events,
         and the partial `mail_event_unsub_once` on (delivery) for unsubscribes,
         which have no provider timestamp to dedupe on. Naming one of them here
         would make a conflict on the OTHER throw instead of reporting
         `ignored-duplicate`, turning the ordinary one-click-then-click-the-link
         sequence into a 500. Any unique conflict on this table means the same
         thing: this engagement is already recorded. */
      .onConflictDoNothing()
      .returning({ id: mailEvent.id })

    return written.length === 0 ? 'ignored-duplicate' : 'recorded'
  }

  /** A THIRD DOOR, WRITING A THIRD TABLE — see `mail_reply` in `mail.schema.ts`
   *  for why this is not a branch of `recordEngagement`.
   *
   *  No envelope shield here: `mail_reply.provider_email_id` is unique and
   *  named the INBOUND message, one row per reply by construction, so the
   *  `onConflictDoNothing` below is the only replay guard this needs — a
   *  second `email_webhook_event` insert keyed by the SAME `svixId` column
   *  used for outbound events would conflate two different envelope streams
   *  under one guard for no benefit. */
  async recordReply(reply: MailReply): Promise<ReplyOutcome> {
    const [delivery] = await this.db
      .select({ id: emailDelivery.id })
      .from(emailDelivery)
      .where(eq(emailDelivery.id, reply.deliveryId))
      .limit(1)
    if (!delivery) return 'unknown-delivery'

    const written = await this.db
      .insert(mailReply)
      .values({
        deliveryId: reply.deliveryId,
        fromAddress: reply.fromAddress,
        subject: reply.subject,
        receivedAt: reply.at,
        providerEmailId: reply.providerEmailId,
        svixId: reply.svixId,
      })
      .onConflictDoNothing({ target: mailReply.providerEmailId })
      .returning({ id: mailReply.id })

    return written.length === 0 ? 'ignored-duplicate' : 'recorded'
  }

  async recipientOf(deliveryId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ recipient: emailDelivery.recipient })
      .from(emailDelivery)
      .where(eq(emailDelivery.id, deliveryId))
      .limit(1)
    return row?.recipient ?? null
  }

  /** The whole decision is in `MailLedger.reapStuckSending` — this is its SQL.
   *
   *  ONE statement, two branches of the same `CASE`, for the reason
   *  `sweepStates()` already states: selecting the stuck rows and then updating
   *  them leaves a window in which a worker that was merely slow finishes its
   *  send between the read and the write, and the reaper then drags a row that
   *  is already `accepted` back to `pending`. The WHERE clause pins `sending`,
   *  so a row that moved on in the meantime simply does not match.
   *
   *  `updated_at` is the clock, and it is the right one: every writer of this
   *  table stamps it, so it means "when did anything last happen to this row",
   *  which is exactly the question. `next_attempt_at` is cleared on the
   *  requeued branch rather than set — the row is due NOW, and a retry clock
   *  copied from before the crash would park it for another backoff window it
   *  has already served.
   *
   *  The comparison is `attempt_count - 1`, not `attempt_count`, matching
   *  `MailConsumer.exhausted()` exactly: `claim()` increments BEFORE the
   *  attempt, so a row that has been claimed once has made zero completed
   *  attempts. Spelling it differently here would park mail one retry early or
   *  one retry late, and nothing would say which. */
  async reapStuckSending(opts: {
    olderThanSeconds: number
    retryLimit: number
  }): Promise<{ requeued: number; parked: number }> {
    const r = (await this.db.execute(sql`
      WITH reaped AS (
        UPDATE "platform"."email_delivery" d
           SET "state" = CASE
                           WHEN d."attempt_count" - 1 >= ${opts.retryLimit}::int THEN 'dead'
                           ELSE 'pending'
                         END,
               "next_attempt_at" = NULL,
               "last_error_code" = 'worker-stalled',
               "last_error_summary" = 'dòng kẹt ở sending: tiến trình gửi chết giữa chừng',
               "updated_at" = now()
         WHERE d."state" = 'sending'
           AND d."updated_at" < now() - make_interval(secs => ${opts.olderThanSeconds}::int)
        RETURNING d."state" AS new_state
      )
      SELECT count(*) FILTER (WHERE new_state = 'pending')::int AS requeued,
             count(*) FILTER (WHERE new_state = 'dead')::int    AS parked
        FROM reaped
    `)) as { rows: { requeued: number; parked: number }[] }

    return r.rows[0] ?? { requeued: 0, parked: 0 }
  }

  /** Row id by either road, or `null`. `deliveryId` is trusted only as far as
   *  "a row with this id exists" — it is still read back rather than used
   *  blind, so an id whose delivery was deleted cannot leave a `mail_event`
   *  pointing at nothing. */
  private async deliveryIdFor(engagement: MailEngagement): Promise<string | null> {
    const where = engagement.deliveryId
      ? eq(emailDelivery.id, engagement.deliveryId)
      : engagement.providerEmailId
        ? eq(emailDelivery.providerEmailId, engagement.providerEmailId)
        : null

    if (!where) return null

    const [row] = await this.db
      .select({ id: emailDelivery.id })
      .from(emailDelivery)
      .where(where)
      .limit(1)
    return row?.id ?? null
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
      mailRunId: row.mailRunId,
      merge: row.merge,
    }
  }
}

/** One intent → one row, in the ONE spelling both enqueue paths use.
 *
 *  A module-level function rather than a private method so the single-row and
 *  the batch path cannot drift: the day a column is added to the ledger, the
 *  compiler points at one place. `recipient` is normalised here and only here —
 *  `isSuppressed()` and `email_suppression.recipient` compare against this same
 *  normal form, so a batch that skipped the lower-casing would be a batch the
 *  block list silently fails to stop. */
function rowOf(intent: MailIntent, nextAttemptAt: Date | null): typeof emailDelivery.$inferInsert {
  return {
    eventKey: intent.eventKey,
    eventType: intent.eventType,
    aggregateType: intent.aggregateType,
    aggregateId: intent.aggregateId,
    template: intent.template,
    templateVersion: intent.templateVersion,
    recipient: intent.recipient.trim().toLowerCase(),
    state: 'pending',
    idempotencyKey: intent.eventKey,
    mailRunId: intent.mailRunId ?? null,
    merge: intent.merge ?? null,
    nextAttemptAt,
  }
}

/** Rows per INSERT. See `enqueueBatch`. */
const INSERT_CHUNK = 1_000
