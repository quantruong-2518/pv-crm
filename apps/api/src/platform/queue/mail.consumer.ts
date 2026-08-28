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
 *   7 · ACCEPTED → write the provider id, done.
 *
 *   8 · FAILED → branch on the KIND, because the three kinds want three
 *       different things: `permanent` must never be tried again, `rate-limit`
 *       must stop the whole queue and not just this job, `retry` is an
 *       ordinary backoff.
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
    delivery: DeliveryToSend,
  ): Promise<MailFailure | null> {
    const parkedMs = await this.gate.parkedFor(EMAIL_QUEUE)
    if (parkedMs > 0) {
      return {
        kind: 'retry',
        code: 'queue-parked',
        summary: `Cửa hàng đợi đang đóng thêm ${Math.ceil(parkedMs / 1_000)}s.`,
      }
    }

    if (await this.ledger.isSuppressed(delivery.recipient)) {
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
      await this.ledger.markAccepted(delivery.id, result.providerEmailId)
      return null
    }

    if (result.kind === 'rate-limit') {
      /* Not this job's problem — the account's. Shut the gate for every worker
         before handing the failure back. */
      await this.gate.park(EMAIL_QUEUE, result.retryAfterSeconds, result.code)
    }

    return result
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
    if (failure.kind === 'permanent') {
      /* A rejected address does not become valid by waiting. `dead` is for
         mails a person still has to decide about; this is not one, so the row
         goes to `failed_permanent` and the job completes normally. */
      await this.ledger.markFailure(delivery.id, failure, { dead: false, nextAttemptAt: null })
      this.log.warn(`Bỏ hẳn ${delivery.eventKey}: ${failure.code} · ${failure.summary}`)
      return 'settled'
    }

    if (this.exhausted(job, delivery)) {
      await this.ledger.markFailure(delivery.id, failure, { dead: true, nextAttemptAt: null })
      await this.queue.park(job.data)
      this.log.error(`Chết hẳn ${delivery.eventKey}: ${failure.code} · ${failure.summary}`)
      return 'settled'
    }

    await this.ledger.markFailure(delivery.id, failure, {
      dead: false,
      nextAttemptAt: this.nextAttemptAt(job),
    })
    return 'retry'
  }

  /** Two ways a delivery stops being worth retrying.
   *
   *  The attempt count is the obvious one. The AGE is the one that matters:
   *  the provider's idempotency key only deduplicates for 24 hours, so a retry
   *  after that no longer has the guarantee the whole design rests on — it is
   *  a coin flip between "delivers" and "delivers again". The margin below 24
   *  keeps the last retry inside the window rather than on its edge.
   *
   *  `job.retryCount` and the ledger's `attemptCount` should agree; the larger
   *  wins, so neither a re-enqueued job nor a redelivered one can quietly
   *  restart the budget. */
  private exhausted(job: JobWithMetadata<EmailJob>, delivery: DeliveryToSend): boolean {
    const attempts = Math.max(job.retryCount, delivery.attemptCount - 1)
    if (attempts >= this.env.PV_EMAIL_RETRY_LIMIT) return true
    return Date.now() - job.createdOn.getTime() >= IDEMPOTENCY_WINDOW_MS
  }

  /** When pg-boss will next run this job, as the ledger records it.
   *
   *  Mirrors pg-boss's own exponential backoff so `/healthz/email` and the
   *  runbook show the same moment the queue is actually waiting for. It is a
   *  reflection, not a decision: the delay lives on the queue, and the job is
   *  active while this is written, which is the wrong time to be rewriting its
   *  schedule.
   *
   *  Consequence worth knowing before reading a 429 in the logs: a park longer
   *  than the current backoff will wake this job early, and it will spend an
   *  attempt discovering the gate is still shut (step 2, before any provider
   *  call). The park protects the PROVIDER, not the retry budget. */
  private nextAttemptAt(job: JobWithMetadata<EmailJob>): Date {
    const step = this.env.PV_EMAIL_RETRY_DELAY_SECONDS * 2 ** Math.min(16, job.retryCount)
    const seconds = Math.min(this.env.PV_EMAIL_RETRY_DELAY_MAX_SECONDS, step)
    return new Date(Date.now() + seconds * 1_000)
  }
}

/** 23 hours, not 24 — see `exhausted`. */
const IDEMPOTENCY_WINDOW_MS = 23 * 60 * 60 * 1_000

function describe(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.length > 500 ? `${raw.slice(0, 497)}...` : raw
}
