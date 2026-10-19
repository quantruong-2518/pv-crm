import { and, asc, eq, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import {
  type EmailJob,
  type DeliveryToSend,
  type MailFailure,
  type MailAddressIntent,
  type MailIntent,
  type MailLedger,
  MAIL_QUEUE_STUCK_SECONDS,
  type MailState,
  type QueueHealth,
  type SuppressionReason,
} from './mail.contract'
import { letterAddresses, normalAddress } from './mail-address'
import { emailDelivery, emailDeliveryAddress, emailSuppression } from './mail.schema'
import { mailRun } from './mail-run.schema'

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
    if (intent.addresses?.length) {
      await this.enqueueLetter(tx, { ...intent, addresses: intent.addresses })
      return
    }
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
    if (intents.some((intent) => intent.addresses?.length)) {
      throw new Error(
        'enqueueBatch does not write To/CC addresses — a group letter goes through enqueueLetter.',
      )
    }
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

  /** One group letter — see `MailEnqueue.enqueueLetter`. The address rows are
   *  written only when the delivery row was: a replay returns `null` before
   *  touching them, so the second run of the same send inserts nothing. */
  async enqueueLetter(
    tx: Db,
    intent: MailIntent & { addresses: MailAddressIntent[] },
    opts: { nextAttemptAt?: Date | null } = {},
  ): Promise<string | null> {
    const addresses = letterAddresses(intent.addresses)
    const firstTo = addresses.find((a) => a.role === 'to')
    if (!firstTo) throw new Error(`Group letter ${intent.eventKey} has no To address.`)

    const [row] = await tx
      .insert(emailDelivery)
      .values(rowOf({ ...intent, recipient: firstTo.address }, opts.nextAttemptAt ?? null))
      .onConflictDoNothing({ target: emailDelivery.eventKey })
      .returning({ id: emailDelivery.id })
    if (!row) return null

    await tx.insert(emailDeliveryAddress).values(
      addresses.map((a, position) => ({
        deliveryId: row.id,
        role: a.role,
        position,
        address: a.address,
        displayName: a.displayName,
        ref: a.ref,
      })),
    )
    return row.id
  }

  /** Due, unsent, oldest first — see `MailLedger.pendingBatch`.
   *
   *  `next_attempt_at` is the retry clock the consumer writes on a failure;
   *  a row waiting out its backoff is not due yet, and sweeping it early would
   *  turn a paced retry into a hot loop. */
  async pendingBatch(limit: number, after?: string): Promise<EmailJob[]> {
    return this.db
      .select({ deliveryId: emailDelivery.id, eventKey: emailDelivery.eventKey })
      .from(emailDelivery)
      .where(
        and(
          eq(emailDelivery.state, 'pending'),
          or(isNull(emailDelivery.nextAttemptAt), lte(emailDelivery.nextAttemptAt, new Date())),
          notHeld,
          /* Keyset past the last row of the previous page; `id` breaks created_at ties. */
          after
            ? sql`(${emailDelivery.createdAt}, ${emailDelivery.id}) > (
                SELECT p."created_at", p."id" FROM "platform"."email_delivery" p
                 WHERE p."id" = ${after}::uuid)`
            : undefined,
        ),
      )
      .orderBy(asc(emailDelivery.createdAt), asc(emailDelivery.id))
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
        and(
          eq(emailDelivery.id, deliveryId),
          inArray(emailDelivery.state, ['pending', 'delayed']),
          notHeld,
        ),
      )
      .returning()
    if (!row) return null

    /* Independent reads on the pool, not in one transaction, so they overlap. */
    const [rows, [run]] = await Promise.all([
      this.db
        .select({
          role: emailDeliveryAddress.role,
          address: emailDeliveryAddress.address,
          displayName: emailDeliveryAddress.displayName,
          ref: emailDeliveryAddress.ref,
          outcomeAt: emailDeliveryAddress.outcomeAt,
        })
        .from(emailDeliveryAddress)
        .where(
          and(
            eq(emailDeliveryAddress.deliveryId, row.id),
            ne(emailDeliveryAddress.outcome, 'dropped_suppressed'),
          ),
        )
        .orderBy(asc(emailDeliveryAddress.position)),
      row.mailRunId
        ? this.db.select().from(mailRun).where(eq(mailRun.id, row.mailRunId))
        : Promise.resolve([]),
    ])

    return {
      ...this.toDeliveryToSend(
        row,
        rows.map(({ outcomeAt: _, ...a }) => a),
      ),
      addressesFrozen: rows.some((a) => a.outcomeAt !== null),
      run: run ?? null,
      sender: run?.createdBy ?? null,
      runKind: run?.kind ?? null,
      /* Each of these precedes any send, so the latest is a safe lower bound. */
      sendableFrom: new Date(
        Math.max(
          ...[row.createdAt, run?.scheduledAt, run?.releasedAt].map((d) => d?.getTime() ?? 0),
        ),
      ),
    }
  }

  async markAccepted(
    deliveryId: string,
    providerEmailId: string,
    then?: { run: (tx: Db) => Promise<void>; attempts: number },
    threadId?: string,
  ): Promise<unknown> {
    return this.db.transaction(async (tx) => {
      await tx
        .update(emailDelivery)
        .set({
          state: 'accepted',
          acceptedAt: sql`now()`,
          providerEmailId,
          /* Both or neither: `email_delivery_thread_needs_gmail` refuses a
             thread id on a row whose provider is not gmail. */
          ...(threadId ? { provider: 'gmail' as const, providerThreadId: threadId } : {}),
          updatedAt: sql`now()`,
        })
        .where(eq(emailDelivery.id, deliveryId))
      let error: unknown = null
      for (let i = 0; then && i < then.attempts; i++) {
        error = await tx
          .transaction((sp) => then.run(sp))
          .then(
            () => null,
            (failed: unknown) => failed ?? new Error('hook failed'),
          )
        if (error === null) break
      }
      return error
    })
  }

  /** `dead` beats `failure.kind`: a worker that has decided to park a row for
   *  a human is stating that no further retry is coming, regardless of
   *  whether THIS particular attempt looked retryable. Otherwise `permanent`
   *  is terminal (`failed_permanent`) unless refunded; anything else goes back to
   *  `pending` for the next attempt at `opts.nextAttemptAt`. The 500-char cut
   *  on the summary is defensive: a provider error string is free text from
   *  outside this process and this column is not the place for it to grow
   *  unbounded. */
  async markFailure(
    deliveryId: string,
    failure: MailFailure,
    opts: { dead: boolean; nextAttemptAt: Date | null; refund?: boolean },
  ): Promise<void> {
    const state: MailState = opts.dead
      ? 'dead'
      : failure.kind === 'permanent' && !opts.refund
        ? 'failed_permanent'
        : 'pending'

    /* `sending` only: a row withheld while in the worker's hands stays held. */
    await this.db
      .update(emailDelivery)
      .set({
        state,
        nextAttemptAt: opts.nextAttemptAt,
        lastErrorCode: failure.code,
        lastErrorSummary: failure.summary.slice(0, 500),
        updatedAt: sql`now()`,
        ...(opts.refund ? { attemptCount: sql`${emailDelivery.attemptCount} - 1` } : {}),
      })
      .where(and(eq(emailDelivery.id, deliveryId), eq(emailDelivery.state, 'sending')))
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

  async suppressedAmong(addresses: string[]): Promise<string[]> {
    const keys = [...new Set(addresses.map(normalAddress))]
    if (keys.length === 0) return []
    const rows = await this.db
      .select({ recipient: emailSuppression.recipient })
      .from(emailSuppression)
      .where(and(inArray(emailSuppression.recipient, keys), isNull(emailSuppression.releasedAt)))
    return rows.map((r) => r.recipient)
  }

  /** `outcome = 'queued'` in the WHERE so a settle can never overwrite a
   *  bounce or a complaint the webhook already wrote. */
  async settleAddresses(deliveryId: string, dropped: string[]): Promise<void> {
    const drop = new Set(dropped.map(normalAddress))
    await this.db
      .update(emailDeliveryAddress)
      .set({
        outcome: sql`CASE WHEN ${inArray(emailDeliveryAddress.address, [...drop, ''])}
                          THEN 'dropped_suppressed' ELSE 'queued' END`,
        outcomeAt: sql`now()`,
      })
      .where(
        and(
          eq(emailDeliveryAddress.deliveryId, deliveryId),
          eq(emailDeliveryAddress.outcome, 'queued'),
        ),
      )
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
    source: 'resend' | 'operator' | 'gmail',
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
               "last_error_summary" = 'Gửi bị gián đoạn giữa chừng.',
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

  /** One round trip, not three: `/healthz/email` and the runbook both want
   *  all three numbers together, and `FILTER` lets Postgres compute them off
   *  a single scan instead of the app issuing three separate counts.
   *  `oldest_pending_seconds` is measured from `created_at`, i.e. when the row
   *  first entered the queue — a row `markFailure()` sends back to `pending`
   *  keeps its original age rather than resetting the clock on every retry.
   *  The WHERE names the two states reported, so the settled bulk of the ledger
   *  is never read. */
  async queueHealth(): Promise<QueueHealth> {
    const r = (await this.db.execute(sql`
      SELECT
        count(*) FILTER (WHERE "state" = 'pending')::int AS pending,
        count(*) FILTER (WHERE "state" = 'dead')::int AS dead,
        EXTRACT(epoch FROM now() - min("created_at") FILTER (WHERE "state" = 'pending'))::int
          AS oldest_pending_seconds,
        (SELECT count(*)::int FROM "platform"."mail_run" r
          WHERE r."awaits_release" AND r."released_at" IS NULL
            AND r."state" IN ('SCHEDULED', 'SENDING')
            AND COALESCE(r."scheduled_at", r."created_at")
                < now() - make_interval(secs => ${MAIL_QUEUE_STUCK_SECONDS}::int)) AS gated_overdue
      FROM "platform"."email_delivery"
      WHERE "state" IN ('pending', 'dead')
    `)) as {
      rows: {
        pending: number
        dead: number
        oldest_pending_seconds: number | null
        gated_overdue: number
      }[]
    }

    const row = r.rows[0]
    return {
      pending: row?.pending ?? 0,
      dead: row?.dead ?? 0,
      oldestPendingSeconds: row?.oldest_pending_seconds ?? null,
      gatedOverdue: row?.gated_overdue ?? 0,
    }
  }

  private toDeliveryToSend(
    row: typeof emailDelivery.$inferSelect,
    addresses: MailAddressIntent[],
  ): Omit<DeliveryToSend, 'addressesFrozen' | 'sendableFrom' | 'sender' | 'runKind' | 'run'> {
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
      role: row.role,
      addresses,
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
    role: intent.role ?? 'recipient',
    merge: intent.merge ?? null,
    nextAttemptAt,
  }
}

/** A later wave whose release gate has not opened (`mail_run.awaits_release`,
 *  ADR 0068). Spliced into BOTH `pendingBatch` and `claim`: a gate the Sales
 *  sweeper never opens sends nothing — it fails closed, not open. */
const notHeld = sql`NOT EXISTS (
  SELECT 1 FROM "platform"."mail_run" gate
   WHERE gate."id" = ${emailDelivery.mailRunId}
     AND gate."awaits_release"
     AND gate."released_at" IS NULL
)`

/** Rows per INSERT. See `enqueueBatch`. */
const INSERT_CHUNK = 1_000
