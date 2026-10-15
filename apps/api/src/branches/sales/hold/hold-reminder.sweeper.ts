import { Inject, Injectable, Logger } from '@nestjs/common'
import { HOLD_DUE, HOLD_DUE_SOON } from '@pv/engines'
import { ENV, type Env } from '@api/platform/config/env'
import { DB, type Db } from '@api/platform/db/db.module'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { HoldReminderRepository } from './hold-reminder.repository'

/** The two hold bells (ADR 0097 §4): half a month before the see-again day,
 *  and on the day. Rides the worker's existing tick (`worker.ts`), throttled
 *  to one pass per `PV_HOLD_REMINDER_MINUTES` the `GmailThreadSweeper` way —
 *  no clock of its own, the reason 0082 §2 refused an always-on poll.
 *
 *  Stamp and ring share one transaction, so a bell commits with its stamp.
 *  The hub swallows its own failure (one-way rule), so a lost bell line does
 *  not un-stamp the row: a reminder is a courtesy and must not ring twice. */
@Injectable()
export class HoldReminderSweeper {
  private readonly log = new Logger('sales.hold')
  private notBefore = 0
  private running = false

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly repo: HoldReminderRepository,
    private readonly hub: NotificationHub,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Called on every worker tick. `null` = this tick was not a pass. The clock
   *  moves BEFORE the pass so a failing database is asked again one interval later. */
  async sweep(now = Date.now()): Promise<number | null> {
    if (this.running || now < this.notBefore) return null
    this.notBefore = now + this.env.PV_HOLD_REMINDER_MINUTES * 60_000
    this.running = true
    try {
      return await this.pass()
    } finally {
      this.running = false
    }
  }

  private pass(): Promise<number> {
    return this.db.transaction(async (tx) => {
      const claimed = await this.repo.claim(tx)
      for (const hold of claimed) {
        await this.hub.announce(tx, {
          event: {
            name: hold.due ? HOLD_DUE : HOLD_DUE_SOON,
            ref: { code: hold.subjectCode },
            audiences: { holders: hold.holders, setter: [hold.setBy] },
            /* A changed date clears the stamps; the new day must ring again. */
            occurrence: `${hold.id}:${hold.untilDay}`,
          },
          subject: { kind: hold.subjectType, code: hold.subjectCode, label: hold.label },
          detail: { until: hold.untilDay },
        })
      }
      if (claimed.length > 0) this.log.log(`Hold reminders rung: ${claimed.length}.`)
      return claimed.length
    })
  }
}
