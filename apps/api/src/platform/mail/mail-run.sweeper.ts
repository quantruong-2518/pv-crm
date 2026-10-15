import { Inject, Injectable, Logger } from '@nestjs/common'
import { NOTIFICATION_DETAIL_FAILED } from '@pv/contracts'
import { MAIL_RUN_CANCELLED, MAIL_RUN_FINISHED } from '@pv/engines'
import { ENV, type Env } from '@api/platform/config/env'
import type { Db } from '@api/platform/db/db.module'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { MailRunRepository, type RunClosed, type RunEnded } from './mail-run.repository'

/** THE BATCH-LEVEL PASS OF THE WORKER LOOP — the sibling of `MailRelay`.
 *
 *  `MailRelay` walks one letter at a time: a `pending` row becomes a job. This
 *  walks the BATCH those letters belong to, and answers the two questions
 *  nothing else in the system is positioned to answer, because both are
 *  predicates over the whole of `email_delivery` rather than over one row:
 *
 *   1 · has this run finished, or has a scheduled one started (`sweepStates`)
 *   2 · has this run gone bad enough to stop itself (`tripBounced`)
 *
 *  Neither can live in the HTTP process: a request that creates a run is gone
 *  seconds later, while both of these are true only minutes to hours after it.
 *  They ride the relay's own interval for the reason that interval already
 *  states — two poll clocks over one queue are two numbers to explain and
 *  nothing to buy with them.
 *
 *  ------------------------------------------------------------------
 *  THE BREAKER RUNS FIRST, AND THE ORDER IS NOT COSMETIC
 *  ------------------------------------------------------------------
 *  `sweepStates()` moves `SENDING` → `SENT` the moment no attempt is
 *  outstanding. A run whose bounce rate is already over the ceiling but whose
 *  last few letters happen to have settled would therefore be filed as `SENT`
 *  by the state sweep — and the breaker only ever looks at `SENDING`, so it
 *  would never get its turn, and the run would end its life reported as a
 *  normal send. Tripping first means a condemned run is `CANCELLED` before
 *  anything can call it finished, and `sweepStates()` then skips it because it
 *  is no longer `SENDING`.
 *
 *  ------------------------------------------------------------------
 *  ONE LINE PER TRIP, AT `error`, AND NO ADDRESS IN IT
 *  ------------------------------------------------------------------
 *  `error` because a cancelled run is an incident: two hundred letters that
 *  someone composed and reviewed are not going out, and the reason is a list
 *  that is damaging the sending account. It has to be visible in whatever
 *  reads the log, not buried at `log`.
 *
 *  What the line carries is the run id and three numbers. Not one recipient —
 *  the breaker fires precisely on the runs whose audience is worst, so this is
 *  the exact moment a mailing list would leak into the log stream if the line
 *  were written the obvious way. The run id is enough to find every row. */
@Injectable()
export class MailRunSweeper {
  private readonly log = new Logger('mail.run')

  constructor(
    private readonly runs: MailRunRepository,
    private readonly hub: NotificationHub,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** One pass. Returns what it did, for the caller that wants to assert on it.
   *
   *  Not wrapped in a try/catch: the worker's interval already swallows a
   *  failed pass (`void … .catch`), and a pass that dies leaves every row and
   *  every run exactly as it found them, so the next tick retries the whole
   *  thing. That is the same recovery story the ledger-as-outbox buys
   *  everywhere else. */
  async sweep(): Promise<{ tripped: number; held: number; moved: number }> {
    const trips = await this.runs.tripBounced(
      {
        ceilingPercent: this.env.PV_MAS_BOUNCE_CEILING_PERCENT,
        minSample: this.env.PV_MAS_BOUNCE_MIN_SAMPLE,
      },
      (tx, tripped) =>
        this.tell(
          tx,
          MAIL_RUN_CANCELLED,
          tripped.map((t) => ({ ...t, id: t.run_id })),
        ),
    )

    for (const trip of trips) {
      const rate = ((trip.bounced / trip.sent) * 100).toFixed(1)
      this.log.error(
        `Cầu dao bounce: lô ${trip.run_id} bị huỷ · ${trip.bounced}/${trip.sent} bounce (${rate}%, ` +
          `trần ${this.env.PV_MAS_BOUNCE_CEILING_PERCENT}%) · ${trip.held} thư chưa gửi đã bị giữ lại.`,
      )
    }

    /* A group run is one letter its sender just pressed Send on; telling them it
       left is noise. Only a bulk run is news when it ends. */
    const moved = await this.runs.sweepStates((tx, runs) =>
      this.tell(
        tx,
        MAIL_RUN_FINISHED,
        runs.filter((run) => run.kind === 'bulk'),
      ),
    )

    return {
      tripped: trips.length,
      held: trips.reduce((sum, trip) => sum + trip.held, 0),
      moved,
    }
  }

  /** A person stopped a run through `MailRunRepository.cancel` — call on that
   *  same transaction with what it returned. Bulk only: a group run's one letter
   *  already rang `mail-failed` itself. Same key as the breaker's line, so a
   *  run gets one closing line whichever path stopped it; the canceller is the
   *  actor, so a sender who stops their own run hears nothing. Only when a
   *  letter was lost: stopping a campaign's unsent waves rings nobody. */
  async cancelledByHand(tx: Db, run: RunClosed, actorId: string): Promise<void> {
    if (run.kind === 'bulk' && run.failed > 0) {
      await this.tell(tx, MAIL_RUN_CANCELLED, [run], actorId)
    }
  }

  /** The sender's bell, on the transaction that closed the run (ADR 0085). No
   *  `actorId` from the worker, so the sender is told about their own run.
   *  Keyed by run id alone — a run ends once. Its letters rang nothing one
   *  by one, so this line carries how many failed (ADR 0093 §4). */
  private async tell(tx: Db, name: string, runs: RunEnded[], actorId?: string): Promise<void> {
    for (const run of runs) {
      await this.hub.announce(tx, {
        event: { name, ref: { code: run.id }, actorId, audiences: { sender: [run.created_by] } },
        subject: { kind: 'mail-run', code: run.id, label: run.label },
        detail: run.failed > 0 ? { [NOTIFICATION_DETAIL_FAILED]: run.failed } : null,
      })
    }
  }
}
