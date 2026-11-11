import { Inject, Injectable, Logger } from '@nestjs/common'
import { FxCurrency, vnDayOf } from '@pv/contracts'
import { daysUntil, FX_RATE_MISSING } from '@pv/engines'
import { NotificationHub } from '../notification/notification.hub'
import { FX_FEED, type FxFeed } from './fx-rate.feed'
import { FxRateRepository } from './fx-rate.repository'

const FROM_HOUR = 9
const UNTIL_HOUR = 17
const RETRY_MS = 15 * 60_000
const ALERT_EVERY_MS = 60 * 60_000
/** Older than this many calendar days rings: a long weekend plus a holiday stays quiet. */
const STALE_AFTER_DAYS = 3

/** Hour of the Vietnam day, UTC+7 all year. */
const vnHourOf = (at: number): number => new Date(at + 7 * 60 * 60_000).getUTCHours()

/** Fetches the day's Vietcombank rate and rings when the sheet has gone quiet
 *  (ADR 0149). Rides the worker tick (`worker.ts`), no clock of its own.
 *
 *  The fetch runs from Vietnam 09:00 to 17:00, once per day: the table is the
 *  memory (a fetched or typed row for today ends it), so a restart cannot
 *  fetch twice. A failed try waits 15 minutes, well over the feed's 5-minute
 *  limit. The alert is checked hourly, and only once the day's window has
 *  closed: a holiday gap rings that evening, not at 09:00 while a fetch is still
 *  due. Its event key carries the last good day, so the ledger's UNIQUE keeps it
 *  to one line per person per stale streak. With no fetched or typed row yet the
 *  last good day is the day the backfill row was planted. */
@Injectable()
export class FxRateSweeper {
  private readonly log = new Logger('fx')
  private fetchNotBefore = 0
  private alertNotBefore = 0
  private running = false

  constructor(
    @Inject(FX_FEED) private readonly feed: FxFeed,
    private readonly repo: FxRateRepository,
    private readonly hub: NotificationHub,
  ) {}

  /** Called on every worker tick. `null` = this tick was not a pass. */
  async sweep(now = Date.now()): Promise<number | null> {
    if (this.running) return null
    this.running = true
    try {
      const day = vnDayOf(new Date(now))
      const hour = vnHourOf(now)
      let stored = 0
      if (hour >= FROM_HOUR && hour < UNTIL_HOUR && now >= this.fetchNotBefore) {
        this.fetchNotBefore = now + RETRY_MS
        for (const currency of FxCurrency.options) stored += await this.fetchOne(currency, day)
      }
      if (hour >= UNTIL_HOUR && now >= this.alertNotBefore) {
        this.alertNotBefore = now + ALERT_EVERY_MS
        for (const currency of FxCurrency.options) await this.alertIfStale(currency, day)
      }
      return stored
    } finally {
      this.running = false
    }
  }

  private async fetchOne(currency: FxCurrency, day: string): Promise<number> {
    if (await this.repo.hasDay(currency, day)) return 0
    const rate = await this.feed.transferRate(currency, day)
    if (rate === null) return 0
    await this.repo.putFetched(currency, day, rate)
    this.log.log(`Stored ${currency} ${rate} for ${day}.`)
    return 1
  }

  private async alertIfStale(currency: FxCurrency, today: string): Promise<void> {
    const last = await this.repo.lastRateDay(currency)
    if (last === null || daysUntil(today, last) <= STALE_AFTER_DAYS) return
    await this.repo.run(async (tx) => {
      await this.hub.announce(tx, {
        event: {
          name: FX_RATE_MISSING,
          ref: { code: currency },
          occurrence: last,
          audiences: { holders: await this.hub.holding(tx, 'setting.manage') },
        },
        subject: { kind: 'fx-rate', code: currency, label: null },
        detail: { day: last },
      })
    })
  }
}
