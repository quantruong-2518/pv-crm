import { Injectable } from '@nestjs/common'
import {
  FxCurrency,
  FxRateRow,
  type FxRateListQuery,
  type FxRateListResponse,
  type FxRatePutBody,
  type FxRatePutParams,
  type FxTodayResponse,
  vnDayOf,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { AuditRepository } from '../audit/audit.repository'
import { invalid } from '../http/problem'
import { FxRateRepository, type FxRateJoined } from './fx-rate.repository'

/** Owner decision 11/11/2026: a typed rate may not stray further than this from the previous stored one. */
const MAX_MANUAL_JUMP = 0.2

const toRow = (r: FxRateJoined): FxRateRow =>
  FxRateRow.parse({
    currency: r.currency,
    day: r.day,
    rate: Number(r.rate),
    source: r.source,
    setBy: r.setBy && r.setByName ? { id: r.setBy, name: r.setByName } : null,
    fetchedAt: r.fetchedAt.toISOString(),
  })

/** The rate sheet's doors (ADR 0149). Figures do not come through here: the
 *  money SQL (`branches/sales/money.ts`) joins `platform.fx_rate` itself, so a
 *  list of rows converts in one statement. This service lists, corrects, and
 *  answers `today` for the client's provisional previews. */
@Injectable()
export class FxRateService {
  constructor(
    private readonly repo: FxRateRepository,
    private readonly audit: AuditRepository,
  ) {}

  async list(query: FxRateListQuery): Promise<FxRateListResponse> {
    return { rows: (await this.repo.list(query)).map(toRow) }
  }

  /** What applies today, per currency; a day with no row takes the nearest earlier one. */
  async today(now = Date.now()): Promise<FxTodayResponse> {
    const day = vnDayOf(new Date(now))
    const found = await Promise.all(
      FxCurrency.options.map(async (currency) => ({
        currency,
        row: await this.repo.onOrBefore(currency, day),
      })),
    )
    return found.flatMap(({ currency, row }) =>
      row
        ? [{ currency, rate: Number(row.rate), day: row.day, legacy: row.source === 'legacy' }]
        : [],
    )
  }

  /** A typed rate wins over the fetched one for its day. A day after today is
   *  refused: "nearest earlier" would let it override every day before it. A day
   *  before the first real row is refused too: filling that gap would reprice every
   *  later day up to the next stored row, and move months already closed. A rate more
   *  than MAX_MANUAL_JUMP off the nearest earlier row is refused as a likely typo. */
  async put(
    who: Actor,
    { currency, day }: FxRatePutParams,
    { rate }: FxRatePutBody,
  ): Promise<FxRateRow> {
    const today = vnDayOf(new Date())
    if (day > today) {
      throw invalid({ day: ['Không đặt tỷ giá cho ngày chưa tới.'] })
    }
    const written = await this.repo.run(async (tx) => {
      const first = (await this.repo.firstRealDay(tx, currency)) ?? today
      if (day < first)
        throw invalid({ day: ['Không đặt tỷ giá cho ngày trước ngày đã có tỷ giá.'] })
      const earlier = await this.repo.earlierThan(tx, currency, day)
      if (earlier && Math.abs(rate / Number(earlier.rate) - 1) > MAX_MANUAL_JUMP) {
        const [, m, d] = earlier.day.split('-')
        const pct = Math.round(MAX_MANUAL_JUMP * 100)
        throw invalid({
          rate: [
            `Tỷ giá lệch quá ${pct}% so với ngày ${d}-${m} (${Number(earlier.rate).toLocaleString('vi-VN')}). Kiểm lại số.`,
          ],
        })
      }
      const before = await this.repo.lock(tx, currency, day)
      const row = await this.repo.putManual(tx, { currency, day, rate, setBy: who.id })
      const was = before ? `${before.rate} (${before.source})` : 'no row'
      const note = `platform.fx_rate ${currency} ${day} · ${was} → ${row.rate} (manual)`
      const code = `${currency}/${day}`
      await this.audit.write({ actorId: who.id, action: 'edit', code, note }, tx)
      return row
    })
    return toRow(written)
  }
}
