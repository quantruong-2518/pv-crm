import { Injectable, Logger, Module } from '@nestjs/common'
import { MeetingCalendar } from './meeting-calendar'
import { MeetingCancel } from './meeting-cancel'
import { MeetingModule } from './meeting.module'

const PASS_EVERY_MS = 60_000
const CANCELLED_EVERY_MS = 60 * 60_000

/** Finishes the Google work a commit left behind (0127): dirty meetings to push,
 *  tombstones of dropped meetings to remove, cancelled meetings whose event is
 *  still up. Each read is one batch (`CALENDAR_BATCH`); a backlog drains over passes.
 *
 *  Rides the worker's existing tick (`worker.ts`), no clock of its own (ADR
 *  0082 §2), throttled the `HoldReminderSweeper` way: one pass a minute (the
 *  first push backoff), the cancelled pass hourly. Only the worker calls it, so
 *  adding API machines adds no Google calls. A second worker repeating a pass
 *  is safe: the stable event id, the mark's compare-and-set, a 404 on delete. */
@Injectable()
export class MeetingCancelSweeper {
  private readonly log = new Logger('meeting.calendar')
  private notBefore = 0
  private cancelledNotBefore = 0
  private running = false

  constructor(
    private readonly calendar: MeetingCalendar,
    private readonly cancel: MeetingCancel,
  ) {}

  /** Called on every worker tick. `null` = this tick was not a pass. The clock
   *  moves BEFORE the pass so a failing database is asked again one interval later. */
  async sweep(now = Date.now()): Promise<number | null> {
    if (this.running || now < this.notBefore) return null
    this.notBefore = now + PASS_EVERY_MS
    this.running = true
    try {
      const pushed = await this.calendar.retryDue()
      const dropped = await this.calendar.retryDropped()
      let cancelled = 0
      if (now >= this.cancelledNotBefore) {
        this.cancelledNotBefore = now + CANCELLED_EVERY_MS
        cancelled = await this.cancel.retryForget()
      }
      const tried = pushed + dropped + cancelled
      if (tried > 0) {
        this.log.log(
          `Calendar retries: ${pushed} pushed, ${dropped} dropped, ${cancelled} cancelled.`,
        )
      }
      return tried
    } finally {
      this.running = false
    }
  }
}

/** Its own module, mounted by `SalesModule`: the one-off scripts load
 *  `MeetingModule` alone, and a dry run must never call Google or write. The
 *  API process mounts it too, but only `worker.ts` ever calls `sweep`. */
@Module({ imports: [MeetingModule], providers: [MeetingCancelSweeper] })
export class MeetingCancelSweepModule {}
