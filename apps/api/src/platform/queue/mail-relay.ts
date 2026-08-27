import { Inject, Injectable, Logger } from '@nestjs/common'
import { ENV, type Env } from '../config/env'
import { MAIL_LEDGER, type MailLedger } from '../mail/mail.contract'
import { MailQueue } from './mail-queue'

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
 *  So the ledger row IS the outbox, exactly as `docs/ban-giao-db.md` drew it,
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
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** One pass. Returns how many rows were handed to the queue. */
  async sweep(): Promise<number> {
    const due = await this.ledger.pendingBatch(BATCH)
    if (due.length === 0) return 0

    for (const job of due) {
      await this.queue.enqueue(job, { singletonSeconds: this.env.PV_QUEUE_POLL_SECONDS * 4 })
    }

    this.log.log(`Relay: ${due.length} thư vào hàng đợi.`)
    return due.length
  }
}

/** Bounded so one sweep cannot become a thousand `send` round trips while the
 *  worker holds everything else. A backlog is drained over several passes, in
 *  age order — which is also the order the ledger returns them. */
const BATCH = 100
