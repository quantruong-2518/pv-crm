import { Inject, Injectable, Logger } from '@nestjs/common'
import type { JobWithMetadata } from 'pg-boss'
import { ENV, type Env } from '../config/env'
import {
  EMAIL_QUEUE,
  MAIL_LEDGER,
  MAIL_PORT,
  type DeliveryToSend,
  type EmailJob,
  type MailFailure,
  type MailLedger,
  type MailPort,
} from '../mail/mail.contract'
import { MAIL_SENT_HOOK, type MailSentHook, type MailTrouble } from '../mail/mail-sent.hook'
import { MAIL_COMPOSER, type MailComposer } from './mail-composer'
import { MailQueue } from './mail-queue'
import { MailRateGate, acquireToken } from './mail-rate'

/** WHAT ONE JOB DOES, IN THE ONE ORDER THAT IS CORRECT.
 *
 *  ------------------------------------------------------------------
 *  THE WHOLE FEATURE IS THIS SEQUENCE
 *  ------------------------------------------------------------------
 *  Every other file here is plumbing; the order below is the actual promise
 *  the system makes ("one lead, at most one mail, even if the worker dies").
 *  Read it as a list of things that must not be swapped:
 *
 *   1 · CLAIM. `pending`/`delayed` → `sending`, atomically. `null` back means
 *       another runner has it or it is already sent, and the honest response
 *       is to do nothing. This is anti-duplicate layer one, and it is what
 *       makes a redelivered job — pg-boss's whole recovery mechanism —
 *       harmless rather than a second mail.
 *
 *   2 · IS THE GATE PARKED. Before anything expensive: if the provider told
 *       some other worker to stop, this worker stops too, without spending a
 *       token and without a request that is already known to fail.
 *
 *   3 · IS THE RECIPIENT SUPPRESSED — checked NOW, not at enqueue time.
 *       Between the lead landing and this job running, that address may have
 *       hard-bounced or complained. A payload captured at enqueue could not
 *       know; a fresh read can. Sending anyway is how a domain's reputation is
 *       spent.
 *
 *   4 · TAKE A TOKEN from the shared pace. See `mail-rate.ts`.
 *
 *   5 · COMPOSE, through an injected interface — the worker never imports the
 *       template package. See `mail-composer.ts`.
 *
 *   6 · SEND WITH THE LEDGER ROW'S OWN `idempotencyKey`. Never a fresh one.
 *       This is the step that survives the worst crash in the feature: the
 *       provider has accepted the mail, the process dies before the database
 *       hears about it, the job is redelivered. Same key, same 24-hour window
 *       — the provider returns the first result instead of sending twice.
 *
 *   7 · ACCEPTED → write the provider id, and in the same transaction tell
 *       the subject's branch the letter went out (`MAIL_SENT_HOOK`), done.
 *
 *   8 · FAILED → branch on the KIND, because the three kinds want three
 *       different things: `permanent` must never be tried again, `rate-limit`
 *       (and a `wide` retry: the provider is down) must stop the whole queue
 *       and spend no attempt, `retry` is an ordinary backoff. A letter given
 *       up on is reported to its subject and, if the address is to blame, banned.
 *
 *   9 · OUT OF ATTEMPTS, or older than the provider's idempotency window →
 *       mark `dead` and park it for a person. Past 24 hours the key no longer
 *       deduplicates anything, so "try once more" has quietly become "send a
 *       second mail and hope"; that is a decision for a human, not a retry
 *       policy.
 *
 *  ------------------------------------------------------------------
 *  THE INVARIANT THAT IS EASY TO BREAK LATER
 *  ------------------------------------------------------------------
 *  Step 1 moved the row to `sending`, and `claim()` only ever picks up
 *  `pending`/`delayed`. So a row left in `sending` is a row no future attempt
 *  can reach. EVERY path out of this handler after a successful claim must
 *  therefore end in `markAccepted`, `markSuppressed` or `markFailure` — there
 *  is no "just throw and let pg-boss sort it out". That is why the failure
 *  path below settles the ledger first and only then rethrows. */
@Injectable()
export class MailConsumer {
  private readonly log = new Logger('mail.consumer')

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(MAIL_LEDGER) private readonly ledger: MailLedger,
    @Inject(MAIL_PORT) private readonly port: MailPort,
    @Inject(MAIL_COMPOSER) private readonly composers: MailComposer[],
    private readonly gate: MailRateGate,
    private readonly queue: MailQueue,
    @Inject(MAIL_SENT_HOOK) private readonly sent: MailSentHook,
  ) {}

  /** pg-boss hands the handler a BATCH, always — one job here, because
   *  `batchSize` is 1 and pacing is per-message anyway. */
  async handle(jobs: JobWithMetadata<EmailJob>[]): Promise<void> {
    for (const job of jobs) await this.runOne(job)
  }

  private async runOne(job: JobWithMetadata<EmailJob>): Promise<void> {
    const delivery = await this.ledger.claim(job.data.deliveryId)
    if (!delivery) return

    let failure: MailFailure

    try {
      const outcome = await this.attempt(job, delivery)
      if (outcome === null) return
      failure = outcome
    } catch (error) {
      /* The composer threw, the network stack threw, the driver threw. The
         ledger row is in `sending` and unreachable until it is settled, so
         settle it BEFORE letting the error out. */
      const verdict = await this.settle(job, delivery, {
        kind: 'retry',
        code: 'worker-error',
        summary: describe(error),
      })
      /* Rethrow only when a retry is still wanted: if `settle` just parked the
         row as dead, throwing would ask pg-boss to run a delivery that has
         already been taken away from it. */
      if (verdict === 'retry') throw error
      return
    }

    const verdict = await this.settle(job, delivery, failure)
    if (verdict === 'retry') {
      /* pg-boss reads a thrown error as "failed, retry per queue policy". The
         message is what shows up in the job's output for the runbook. */
      throw new Error(`${failure.code}: ${failure.summary}`)
    }
  }

  /** Steps 2–7. Returns `null` when the delivery is finished with (sent, or
   *  deliberately withheld), otherwise the failure to be settled. */
  private async attempt(
    job: JobWithMetadata<EmailJob>,
    claimed: DeliveryToSend,
  ): Promise<MailFailure | null> {
    /* Past the provider's idempotency window a resend may be a second letter. */
    if (Date.now() - claimed.sendableFrom.getTime() >= IDEMPOTENCY_WINDOW_MS) {
      return {
        kind: 'permanent',
        code: EXPIRED,
        summary: 'Quá cửa sổ chống trùng — không gửi lại.',
      }
    }
    const delivery = await this.frozen(claimed)
    if (!delivery) return null

    const parkedMs = await this.gate.parkedFor(EMAIL_QUEUE)
    if (parkedMs > 0) {
      return {
        kind: 'retry',
        code: 'queue-parked',
        summary: `Cửa hàng đợi đang đóng thêm ${Math.ceil(parkedMs / 1_000)}s.`,
      }
    }

    /* The locked sales@ copy (`role='run_copy'`) is never suppression-checked —
       an archive line addressed to the shared inbox, not a recipient whose
       mailbox can burn out from under it (`mail.repository.ts` matches this). */
    const checkable = delivery.addresses.length === 0 && delivery.role !== 'run_copy'
    if (checkable && (await this.ledger.isSuppressed(delivery.recipient))) {
      /* `isSuppressed` answers yes/no and deliberately does not carry the
         reason — the authoritative one is on the suppression list row, written
         when the bounce or complaint arrived. `manual` here means "withheld by
         the list", not "an operator did it"; the list is where to look. */
      await this.ledger.markSuppressed(delivery.id, 'manual')
      this.log.log(`Giữ lại ${delivery.eventKey}: người nhận đang trong danh sách chặn.`)
      return null
    }

    const paced = await acquireToken(
      this.gate,
      EMAIL_QUEUE,
      this.env.PV_EMAIL_RATE_PER_SECOND,
      job.signal,
    )
    if (!paced) {
      return {
        kind: 'retry',
        code: 'rate-window',
        summary: `Hết token nhịp trong cửa sổ hiện tại (${this.env.PV_EMAIL_RATE_PER_SECOND}/giây).`,
      }
    }

    const message = await this.composerFor(delivery.template).compose(delivery)
    const result = await this.port.send(message, delivery.idempotencyKey)

    if (result.ok) {
      const missed = await this.ledger.markAccepted(delivery.id, result.providerEmailId, {
        run: (tx) => this.sent.afterSent(tx, delivery),
        attempts: HOOK_ATTEMPTS,
      })
      /* The mail is out either way — failing the job would retry a letter the
         provider already took. Only the subject's move is lost: say so, twice. */
      if (missed) {
        this.log.error(`Sent ${delivery.eventKey}, subject not moved: ${describe(missed)}`)
        await this.report(delivery, { kind: 'sync-failed' })
      }
      return null
    }

    if (result.kind === 'rate-limit' || result.wide) {
      /* Not this job's problem — the account's or the provider's. Shut the
         gate for every worker; a broken key or sender waits the longest. */
      const seconds =
        result.kind === 'rate-limit'
          ? result.retryAfterSeconds
          : result.kind === 'retry'
            ? this.env.PV_EMAIL_RETRY_DELAY_SECONDS
            : this.env.PV_EMAIL_RETRY_DELAY_MAX_SECONDS
      await this.gate.park(EMAIL_QUEUE, seconds, result.code)
    }

    return result
  }

  /** Step 3 for a GROUP letter, run before anything else can fail the attempt.
   *
   *  The first claim checks every address and freezes the survivors in the
   *  ledger; every later claim sends exactly that set, because a retry under
   *  the same idempotency key must carry the same payload. No To left → the
   *  letter is `suppressed` (a CC alone is not a letter). The locked sales@ CC
   *  is on the run, not an address row, so it is never checked. */
  private async frozen(delivery: DeliveryToSend): Promise<DeliveryToSend | null> {
    if (delivery.addresses.length === 0) return delivery

    let addresses = delivery.addresses
    if (!delivery.addressesFrozen) {
      const blocked = new Set(await this.ledger.suppressedAmong(addresses.map((a) => a.address)))
      await this.ledger.settleAddresses(delivery.id, [...blocked])
      addresses = addresses.filter((a) => !blocked.has(a.address))
    }

    if (!addresses.some((a) => a.role === 'to')) {
      await this.ledger.markSuppressed(delivery.id, 'manual')
      this.log.log(`Held ${delivery.eventKey}: every To address is on the suppression list.`)
      return null
    }
    return { ...delivery, addresses }
  }

  /** Step 5's lookup. FIRST match wins — see `mail-composer.ts`.
   *
   *  No match THROWS, and the message names the template, because the two ways
   *  this can happen both need a person: a delivery row written with a typo in
   *  `template`, or a composer whose provider was left out of the worker's
   *  wiring. Falling back to any other composer would send a mass mail with the
   *  wrong body, which cannot be recalled. The throw lands in `runOne`'s catch,
   *  which settles the ledger row before letting it out — a delivery is never
   *  abandoned in `sending`. */
  private composerFor(template: string): MailComposer {
    const found = this.composers.find((composer) => composer.supports(template))
    if (!found) throw new Error(`Không có bộ dựng thân mail cho template "${template}".`)
    return found
  }

  /** Steps 8–9. Writes the ledger and says whether pg-boss should try again. */
  private async settle(
    job: JobWithMetadata<EmailJob>,
    delivery: DeliveryToSend,
    failure: MailFailure,
  ): Promise<'settled' | 'retry'> {
    if (failure.code === EXPIRED) {
      await this.ledger.markFailure(delivery.id, failure, { dead: true, nextAttemptAt: null })
      await this.gaveUp(delivery, failure, true)
      await this.queue.park(job.data)
      return 'settled'
    }

    if (queueWide(failure)) {
      /* The account or the pace stopped, not this letter: hand back the
         attempt and leave the row to the relay until the gate reopens — never
         a budget spent, never a death, so never a ban. */
      const reopens = Date.now() + (await this.gate.parkedFor(EMAIL_QUEUE))
      await this.ledger.markFailure(delivery.id, failure, {
        dead: false,
        nextAttemptAt: new Date(Math.max(this.nextAttemptAt(job).getTime(), reopens)),
        refund: true,
      })
      return 'settled'
    }

    if (failure.kind === 'permanent') {
      /* A rejected address does not become valid by waiting. `dead` is for
         mails a person still has to decide about; this is not one, so the row
         goes to `failed_permanent` and the job completes normally. */
      await this.ledger.markFailure(delivery.id, failure, { dead: false, nextAttemptAt: null })
      this.log.warn(`Bỏ hẳn ${delivery.eventKey}: ${failure.code} · ${failure.summary}`)
      await this.gaveUp(delivery, failure, false)
      return 'settled'
    }

    if (this.exhausted(job, delivery)) {
      await this.ledger.markFailure(delivery.id, failure, { dead: true, nextAttemptAt: null })
      this.log.error(`Chết hẳn ${delivery.eventKey}: ${failure.code} · ${failure.summary}`)
      await this.gaveUp(delivery, failure, false)
      await this.queue.park(job.data)
      return 'settled'
    }

    await this.ledger.markFailure(delivery.id, failure, {
      dead: false,
      nextAttemptAt: this.nextAttemptAt(job),
    })
    return 'retry'
  }

  /** A letter given up on. The address is banned only when the provider named
   *  it (`blamesRecipient`) on a customer letter to one recipient — a group
   *  letter cannot name the culprit. `unknown`: it may have arrived after all. */
  private async gaveUp(
    delivery: DeliveryToSend,
    failure: MailFailure,
    unknown: boolean,
  ): Promise<void> {
    const blamesAddress =
      failure.kind === 'permanent' &&
      failure.blamesRecipient === true &&
      delivery.role === 'recipient' &&
      delivery.mailRunId !== null &&
      delivery.addresses.length === 0
    try {
      if (blamesAddress) await this.ledger.suppress(delivery.recipient, 'send_failed', 'resend')
    } catch (error) {
      this.log.error(`Could not suppress ${delivery.recipient}: ${describe(error)}`)
    }
    await this.report(delivery, { kind: 'failed', address: delivery.recipient, unknown })
  }

  /** Tell the subject's branch; a report that fails is logged, never thrown —
   *  the ledger row is already settled and must stay so. */
  private async report(delivery: DeliveryToSend, trouble: MailTrouble): Promise<void> {
    try {
      await this.sent.afterTrouble(delivery, trouble)
    } catch (error) {
      this.log.error(`Could not report ${trouble.kind} on ${delivery.eventKey}: ${describe(error)}`)
    }
  }

  /** The attempt budget. `job.retryCount` and the ledger's `attemptCount`
   *  should agree; the larger wins, so neither a re-enqueued job nor a
   *  redelivered one can quietly restart it. The AGE limit is not here: it is
   *  checked before any send (`attempt`), against the ledger row. */
  private exhausted(job: JobWithMetadata<EmailJob>, delivery: DeliveryToSend): boolean {
    return Math.max(job.retryCount, delivery.attemptCount - 1) >= this.env.PV_EMAIL_RETRY_LIMIT
  }

  /** When pg-boss will next run this job, as the ledger records it.
   *
   *  Mirrors pg-boss's own exponential backoff so `/healthz/email` and the
   *  runbook show the same moment the queue is actually waiting for. It is a
   *  reflection, not a decision: the delay lives on the queue, and the job is
   *  active while this is written, which is the wrong time to be rewriting its
   *  schedule.
   *
   *  A queue-wide stop is settled differently: the row waits for the later of
   *  this backoff and the gate reopening, and its attempt is refunded. */
  private nextAttemptAt(job: JobWithMetadata<EmailJob>): Date {
    const step = this.env.PV_EMAIL_RETRY_DELAY_SECONDS * 2 ** Math.min(16, job.retryCount)
    const seconds = Math.min(this.env.PV_EMAIL_RETRY_DELAY_MAX_SECONDS, step)
    return new Date(Date.now() + seconds * 1_000)
  }
}

/** The first try plus two, each on a fresh savepoint (owner decision, ADR 0068). */
const HOOK_ATTEMPTS = 3

/** A stop of the pace, the gate or the provider, never of one letter: the
 *  attempt is refunded (`settle`). `rate-window`/`queue-parked` are this file's. */
const queueWide = (f: MailFailure): boolean =>
  f.kind === 'rate-limit' ||
  f.wide === true ||
  f.code === 'queue-parked' ||
  f.code === 'rate-window'

/** A letter too old to resend safely — see `attempt`. */
const EXPIRED = 'idempotency-expired'

/** 23 hours, not 24: the provider deduplicates a key for 24, and the margin
 *  keeps the last send inside the window rather than on its edge. */
const IDEMPOTENCY_WINDOW_MS = 23 * 60 * 60 * 1_000

function describe(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.length > 500 ? `${raw.slice(0, 497)}...` : raw
}
