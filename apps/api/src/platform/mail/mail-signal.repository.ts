import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import {
  advances,
  type EngagementOutcome,
  type GroupLetter,
  type MailEngagement,
  type MailReply,
  type MailSignals,
  type MailState,
  type ReplyOutcome,
  type WebhookApplied,
  type WebhookOutcome,
} from './mail.contract'
import { normalAddress, pinBlame } from './mail-address'
import type { MailSent } from './mail-sent.hook'
import {
  emailDelivery,
  emailDeliveryAddress,
  emailWebhookEvent,
  mailEvent,
  mailReply,
} from './mail.schema'
import { mailRun } from './mail-run.schema'

/** THE INBOUND-SIGNAL HALF OF THE LEDGER — what the provider and the recipient
 *  tell us after a letter left. Split out of `MailRepository` unchanged, which
 *  keeps the outbox/claim/settle half under the file-size cap. */
@Injectable()
export class MailSignalRepository implements MailSignals {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Three steps, each one a possible early exit — order matters.
   *
   *  (1) The dedupe insert runs FIRST and unconditionally: a replayed
   *  `svix_id` must be recognised before anything is written, or a retried
   *  webhook could be applied twice. It is still READ (`attributed`), which
   *  writes nothing — see `MailLedger.applyWebhook`.
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
    to: string[]
  }): Promise<WebhookApplied> {
    const inserted = await this.db
      .insert(emailWebhookEvent)
      .values({ svixId: event.svixId, type: event.type, emailId: event.providerEmailId })
      .onConflictDoNothing({ target: emailWebhookEvent.svixId })
      .returning({ svixId: emailWebhookEvent.svixId })

    const [delivery] = event.providerEmailId
      ? await this.db
          .select({
            id: emailDelivery.id,
            state: emailDelivery.state,
            recipient: emailDelivery.recipient,
            role: emailDelivery.role,
          })
          .from(emailDelivery)
          .where(eq(emailDelivery.providerEmailId, event.providerEmailId))
          .limit(1)
      : []

    /* The locked sales@ copy (`role='run_copy'`) is never blamed and never
       suppressed — an archive line, not a recipient the counterparty can
       complain about; `MailConsumer` never suppression-checks it either. */
    const runCopy = delivery?.role === 'run_copy'
    const blames = !runCopy && (event.state === 'bounced' || event.state === 'complained')
    const rows = delivery && blames ? await this.sentAddressesOf(delivery.id) : []
    /* A letter with no address rows (bulk, copy, one-off) blames its one
       recipient, which stands in as the sole To; a delivery we never sent can
       only be read off `data.to`, which Resend documents as To-only. */
    const candidates = delivery
      ? rows.length > 0
        ? rows
        : [{ address: delivery.recipient, role: 'to' as const }]
      : event.to.map((address) => ({ address, role: 'to' as const }))
    const attributed = blames ? pinBlame(candidates, event.reason) : []

    const deliveryId = delivery?.id ?? null
    if (inserted.length === 0) return { outcome: 'ignored-duplicate', attributed, deliveryId }
    if (!delivery) return { outcome: 'unknown-delivery', attributed, deliveryId }

    const outcome =
      rows.length > 0
        ? await this.blameInGroup(delivery, event, attributed)
        : await this.advance(delivery, event)
    return { outcome, attributed, deliveryId }
  }

  /** A bounce/complaint on a group letter lands on the pinned address row;
   *  the letter moves only once no To is left standing (re-read AFTER the
   *  write, so two webhooks racing on two To cannot both miss the last one).
   *  Unpinned: nothing is suppressed, the reason is noted, the state stays. */
  private async blameInGroup(
    delivery: { id: string; state: MailState },
    event: { type: string; reason?: string; at: Date; state: MailState | null },
    attributed: string[],
  ): Promise<WebhookOutcome> {
    if (attributed.length === 0) {
      await this.db
        .update(emailDelivery)
        .set({
          lastErrorCode: event.type,
          lastErrorSummary: `chưa rõ địa chỉ nào: ${event.reason ?? event.type}`.slice(0, 500),
          updatedAt: sql`now()`,
        })
        .where(eq(emailDelivery.id, delivery.id))
      return 'applied'
    }

    await this.db
      .update(emailDeliveryAddress)
      .set({
        outcome: event.state === 'complained' ? 'complained' : 'bounced',
        outcomeReason: event.reason?.slice(0, 500) ?? null,
        outcomeAt: event.at,
      })
      .where(
        and(
          eq(emailDeliveryAddress.deliveryId, delivery.id),
          inArray(emailDeliveryAddress.address, attributed),
          eq(emailDeliveryAddress.outcome, 'queued'),
        ),
      )

    const [standing] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(emailDeliveryAddress)
      .where(
        and(
          eq(emailDeliveryAddress.deliveryId, delivery.id),
          eq(emailDeliveryAddress.role, 'to'),
          eq(emailDeliveryAddress.outcome, 'queued'),
        ),
      )
    if ((standing?.n ?? 0) > 0) return 'applied'
    return this.advance(delivery, event)
  }

  /** See `MailLedger.applyAddressBounce`. The marking is `blameInGroup`, the
   *  webhook's own step; the strike count runs AFTER it and on every call, so
   *  a crash between the two is healed by the next read of the same thread. */
  async applyAddressBounce(
    deliveryId: string,
    bounce: { addresses: string[]; reason: string; at: Date },
  ): Promise<number> {
    const [delivery] = await this.db
      .select({ id: emailDelivery.id, state: emailDelivery.state })
      .from(emailDelivery)
      .where(eq(emailDelivery.id, deliveryId))
      .limit(1)
    const named = [...new Set(bounce.addresses.map(normalAddress))]
    if (!delivery || named.length === 0) return 0

    const standing = await this.db
      .select({ address: emailDeliveryAddress.address })
      .from(emailDeliveryAddress)
      .where(
        and(
          eq(emailDeliveryAddress.deliveryId, deliveryId),
          inArray(emailDeliveryAddress.address, named),
          eq(emailDeliveryAddress.outcome, 'queued'),
        ),
      )
    const attributed = standing.map((row) => row.address)
    if (attributed.length > 0) {
      const event = { type: 'gmail.bounced', state: 'bounced' as const, ...bounce }
      await this.blameInGroup(delivery, event, attributed)
    }

    /* Strikes are DISTINCT letters, so re-reading this letter's DSN never adds
       one. A letter without address rows (bulk, Resend) counts by its recipient.
       DO NOTHING: an existing block keeps its own reason and its release. */
    await this.db.execute(sql`
      INSERT INTO "platform"."email_suppression" ("recipient", "reason", "source")
      SELECT a."address", 'hard_bounce', 'gmail'
        FROM "platform"."email_delivery_address" a
       WHERE a."delivery_id" = ${deliveryId}::uuid
         AND a."outcome" = 'bounced'
         AND a."address" IN (${sql.join(named, sql`, `)})
         AND (SELECT count(*) FROM (
                SELECT b."delivery_id" AS id
                  FROM "platform"."email_delivery_address" b
                 WHERE b."address" = a."address" AND b."outcome" = 'bounced'
                UNION
                SELECT d."id"
                  FROM "platform"."email_delivery" d
                 WHERE d."recipient" = a."address"
                   AND d."state" = 'bounced'
                   AND d."role" = 'recipient'
                   AND NOT EXISTS (SELECT 1 FROM "platform"."email_delivery_address" x
                                    WHERE x."delivery_id" = d."id")
              ) strikes) >= ${GMAIL_BOUNCE_STRIKES}::int
      ON CONFLICT ("recipient") DO NOTHING
    `)
    return attributed.length
  }

  async lostGroupLetter(deliveryId: string): Promise<GroupLetter | null> {
    const [row] = await this.db
      .select({
        id: emailDelivery.id,
        aggregateType: emailDelivery.aggregateType,
        aggregateId: emailDelivery.aggregateId,
        mailRunId: emailDelivery.mailRunId,
        role: emailDelivery.role,
        sender: mailRun.createdBy,
      })
      .from(emailDelivery)
      .innerJoin(mailRun, eq(mailRun.id, emailDelivery.mailRunId))
      .where(
        and(
          eq(emailDelivery.id, deliveryId),
          eq(mailRun.kind, 'group'),
          inArray(emailDelivery.state, ['bounced', 'failed_permanent']),
        ),
      )
      .limit(1)
    return row ?? null
  }

  /** The ladder step itself — `advances()`, imported, never re-derived. */
  private async advance(
    delivery: { id: string; state: MailState },
    event: { type: string; state: MailState | null; reason?: string; at: Date },
  ): Promise<WebhookOutcome> {
    if (!event.state || !advances(delivery.state, event.state)) return 'ignored-stale'

    await this.db
      .update(emailDelivery)
      .set({
        state: event.state,
        deliveredAt: event.state === 'delivered' ? event.at : undefined,
        /* Keep the provider's own sentence: it alone tells "mailbox full" from
           "domain does not exist". Written only when present, so a later
           `delivered` cannot blank a bounce's reason. */
        ...(event.reason
          ? { lastErrorCode: event.type, lastErrorSummary: event.reason.slice(0, 500) }
          : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(emailDelivery.id, delivery.id))

    return 'applied'
  }

  /** The addresses a group letter actually went to — a row the first attempt
   *  dropped as suppressed was never sent, so no bounce can be about it. */
  private async sentAddressesOf(
    deliveryId: string,
  ): Promise<Array<{ address: string; role: 'to' | 'cc' }>> {
    return this.db
      .select({ address: emailDeliveryAddress.address, role: emailDeliveryAddress.role })
      .from(emailDeliveryAddress)
      .where(
        and(
          eq(emailDeliveryAddress.deliveryId, deliveryId),
          ne(emailDeliveryAddress.outcome, 'dropped_suppressed'),
        ),
      )
  }

  /** THE OTHER DOOR INTO THE LEDGER, AND IT WRITES A DIFFERENT TABLE.
   *
   *  Deliberately NOT a branch of `applyWebhook`: that one moves
   *  `email_delivery.state` through `advances()`, this one must never touch
   *  that column, so the statement that could is simply not in this method.
   *
   *  (1) The envelope shield goes in FIRST, so a replayed `svix_id` is
   *  recognised before any lookup; a row failing below is not retried into a
   *  second attempt, trading a lost event for double counting (the worse one).
   *  (2) The delivery is found by row id (our signed unsubscribe token) or by
   *  the provider's mail id, which is all a webhook carries.
   *  (3) `mail_event_once` shields two envelopes describing the same open;
   *  `mail_event_url_matches_kind` is left free to throw on a CLICK with no
   *  URL, which is a caller bug. */
  async recordEngagement(engagement: MailEngagement): Promise<EngagementOutcome> {
    if (engagement.svixId) {
      const seen = await this.db
        .insert(emailWebhookEvent)
        .values({
          svixId: engagement.svixId,
          /* The KIND, not a Resend event name: the row may not have come from
             a provider at all. */
          type: engagement.kind,
          emailId: engagement.providerEmailId ?? null,
        })
        .onConflictDoNothing({ target: emailWebhookEvent.svixId })
        .returning({ svixId: emailWebhookEvent.svixId })

      if (seen.length === 0) return 'ignored-duplicate'
    }

    const target = await this.deliveryIdFor(engagement)
    if (!target) return 'unknown-delivery'

    /* Batch said no watching: write no row, or counter and events disagree.
       Only OPEN and CLICK; delivery events and UNSUBSCRIBE are other axes. */
    if (!target.trackEngagement && (engagement.kind === 'OPEN' || engagement.kind === 'CLICK')) {
      return 'ignored-untracked'
    }

    const written = await this.db
      .insert(mailEvent)
      .values({
        deliveryId: target.id,
        kind: engagement.kind,
        at: engagement.at,
        url: engagement.url ?? null,
        svixId: engagement.svixId,
      })
      /* No `target`: the table has two unique rules (`mail_event_once`,
         `mail_event_unsub_once`); naming one would throw on the other instead
         of answering `ignored-duplicate`. */
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
  async recordReply(
    reply: MailReply,
    then?: (tx: Db, sent: MailSent, replyId: string) => Promise<void>,
  ): Promise<ReplyOutcome> {
    return this.db.transaction(async (tx) => {
      const [delivery] = await tx
        .select({
          aggregateType: emailDelivery.aggregateType,
          aggregateId: emailDelivery.aggregateId,
          mailRunId: emailDelivery.mailRunId,
          role: emailDelivery.role,
        })
        .from(emailDelivery)
        .where(eq(emailDelivery.id, reply.deliveryId))
        .limit(1)
      if (!delivery) return 'unknown-delivery'

      const [written] = await tx
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
      if (!written) return 'ignored-duplicate'

      /* Only a NEW row reaches here, so a redelivered signal tells nobody twice. */
      await then?.(tx, delivery, written.id)
      return 'recorded'
    })
  }

  /** Recipient letters only: a run copy's footer link would otherwise let a
   *  colleague reading the archive unsubscribe the shared sales inbox. */
  async recipientOf(deliveryId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ recipient: emailDelivery.recipient })
      .from(emailDelivery)
      .where(and(eq(emailDelivery.id, deliveryId), eq(emailDelivery.role, 'recipient')))
      .limit(1)
    return row?.recipient ?? null
  }

  /** Row id by either road, plus the batch's recording flag, or `null`.
   *  `deliveryId` is trusted only as far as "a row with this id exists" — it is
   *  still read back rather than used blind, so an id whose delivery was
   *  deleted cannot leave a `mail_event` pointing at nothing.
   *
   *  The flag rides the SAME query as a LEFT JOIN rather than a second lookup:
   *  the door already pays for this round trip, and a separate read would
   *  double the DB cost of every open a campaign generates. The join is left
   *  because `mail_run_id` is NULL for a one-off (lead-intake notification),
   *  which has no batch to read a flag off and keeps the recorded behaviour. */
  private async deliveryIdFor(
    engagement: MailEngagement,
  ): Promise<{ id: string; trackEngagement: boolean } | null> {
    const where = engagement.deliveryId
      ? eq(emailDelivery.id, engagement.deliveryId)
      : engagement.providerEmailId
        ? eq(emailDelivery.providerEmailId, engagement.providerEmailId)
        : null

    if (!where) return null

    const [row] = await this.db
      .select({ id: emailDelivery.id, trackEngagement: mailRun.trackEngagement })
      .from(emailDelivery)
      .leftJoin(mailRun, eq(mailRun.id, emailDelivery.mailRunId))
      .where(where)
      .limit(1)
    if (!row) return null
    return { id: row.id, trackEngagement: row.trackEngagement ?? true }
  }
}

/** Under `gmail.metadata` a Failure DSN cannot say WHY: a dead address, a full
 *  mailbox and a spam rejection read the same. One may be the letter's fault;
 *  the same address failing on a second letter is the address's. */
const GMAIL_BOUNCE_STRIKES = 2
