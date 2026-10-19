import { Inject, Injectable, Logger } from '@nestjs/common'
import { ENV, type Env } from '../config/env'
import { EMAIL_QUEUE, MAIL_LEDGER, type MailLedger } from '../mail/mail.contract'
import { MailQueue } from './mail-queue'
import { MailRateGate } from './mail-rate'

/** THE ONE STEP BETWEEN "A MAIL IS OWED" AND "A JOB EXISTS".
 *
 *  ------------------------------------------------------------------
 *  WHY A SWEEP AND NOT A SEND INSIDE THE TRANSACTION
 *  ------------------------------------------------------------------
 *  pg-boss can enqueue inside an existing transaction (`fromDrizzle`), and on
 *  paper that is tidier: commit the lead and its job together, no polling, no
 *  latency. It was the first design here, and it was dropped for two concrete
 *  reasons, both about this deployment rather than about taste.
 *
 *  First, it would put a pg-boss instance inside the HTTP process — a live
 *  connection per API machine, plus the install/migration check at every boot.
 *  On Neon a connection that never goes idle is a compute that never sleeps,
 *  and that is a monthly bill, not a style preference.
 *
 *  Second, it inverts the dependency the wrong way round: the branch would
 *  need the queue, the queue needs the mail module, and the mail module is
 *  what the branch was reaching for in the first place. The way out is a
 *  second pg-boss instance in the worker's tree, which is worse than the thing
 *  it fixes.
 *
 *  So the ledger row IS the outbox — decision #2 of
 *  `docs/decisions/0010-transactional-mail-infrastructure-decisions.md` —
 *  and this class is the relay. The branch writes one row inside its own
 *  transaction and touches nothing else. The cost is latency bounded by
 *  `PV_QUEUE_POLL_SECONDS`; the gain is that every failure mode — queue down,
 *  broker lost the job, machine died between commit and enqueue — recovers by
 *  itself, because the row is still `pending` and the next sweep finds it.
 *
 *  Enqueuing the same delivery twice is harmless: `claim()` gives the row to
 *  exactly one runner and the loser exits quietly. `singletonSeconds` keeps a
 *  row that stays `pending` (worker down, gate parked) from growing a pile of
 *  jobs, one per sweep, without ever being the thing that guarantees
 *  correctness. */
@Injectable()
export class MailRelay {
  private readonly log = new Logger('queue')

  constructor(
    @Inject(MAIL_LEDGER) private readonly ledger: MailLedger,
    private readonly queue: MailQueue,
    private readonly gate: MailRateGate,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** One pass. Returns how many rows were handed to the queue.
   *
   *  The reaper runs FIRST, and the order is the same argument `MailRunSweeper`
   *  makes about its own two passes: a row rescued out of `sending` is due
   *  immediately, so rescuing it before the read means it leaves in THIS pass
   *  instead of waiting a full poll interval for the next one. It also costs
   *  nothing when there is nothing stuck — the `WHERE` matches no row and the
   *  statement returns two zeroes.
   *
   *  Its result is logged only when it did something. A reaped row means a
   *  worker died mid-send, which is worth a line in the log; printing "0 rows
   *  rescued" every twelve seconds forever is how a log stops being read. */
  async sweep(): Promise<number> {
    const reaped = await this.ledger.reapStuckSending({
      olderThanSeconds: STUCK_SENDING_SECONDS,
      retryLimit: this.env.PV_EMAIL_RETRY_LIMIT,
    })

    if (reaped.requeued > 0 || reaped.parked > 0) {
      this.log.warn(
        `Vớt dòng kẹt: ${reaped.requeued} thư trả lại hàng đợi · ${reaped.parked} thư hết lượt thử, đã parking.`,
      )
    }

    /* A parked gate turns every job into an immediate `queue-parked` retry, so
       handing rows over now only churns the queue; the ledger keeps them. */
    if ((await this.gate.parkedFor(EMAIL_QUEUE)) > 0) return 0

    const singletonSeconds = this.env.PV_QUEUE_POLL_SECONDS * 4
    const deadline = Date.now() + DRAIN_BUDGET_MS
    /* What the gate can send before the next pass; rows beyond it would only
       become one more job per singleton slot. Never below one page. */
    const cap = Math.max(
      BATCH,
      Math.ceil(this.env.PV_EMAIL_RATE_PER_SECOND * this.env.PV_QUEUE_POLL_SECONDS),
    )
    let handed = 0
    let after: string | undefined
    for (;;) {
      const limit = Math.min(BATCH, cap - handed)
      const due = await this.ledger.pendingBatch(limit, after)
      await this.queue.enqueueMany(due, { singletonSeconds })
      handed += due.length
      after = due.at(-1)?.deliveryId
      if (due.length < limit || handed >= cap || Date.now() >= deadline) break
    }

    if (handed > 0) this.log.log(`Relay: ${handed} thư vào hàng đợi.`)
    return handed
  }
}

/** How long a row may sit in `sending` before it is treated as orphaned.
 *
 *  Five minutes, and the number is chosen from the two clocks it has to clear
 *  rather than picked for roundness. A live send is bounded by
 *  `SEND_TIMEOUT_MS` (15s in `resend.driver.ts`) plus the rate gate's wait; a
 *  worker being shut down gracefully gets `SHUTDOWN_TIMEOUT_MS` (90s in
 *  `worker.ts`) to finish what it holds. Five minutes is comfortably past both,
 *  which is the direction that has to be safe: reaping too early hands a row a
 *  second worker is still holding to a third, and two concurrent requests are
 *  not what an idempotency key promises to collapse. Reaping too late merely
 *  means a stuck letter waits a few more minutes for a rescue that used to
 *  never come at all.
 *
 *  A constant rather than an environment variable on purpose — it is derived
 *  from two other constants in this repository, and a deployment free to set it
 *  to 10 seconds is a deployment free to send everything twice. */
const STUCK_SENDING_SECONDS = 300

/** One round trip per batch. A backlog is drained within one pass, in age
 *  order, by paging past the last row handed over. */
const BATCH = 100

/** Far under the tick (`PV_QUEUE_POLL_SECONDS` is 30 in production), so a long
 *  drain never overlaps the next pass; what is left waits in the ledger. */
const DRAIN_BUDGET_MS = 10_000
