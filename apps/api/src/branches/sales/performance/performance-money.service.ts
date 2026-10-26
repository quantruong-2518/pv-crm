import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  lastDayOf,
  SalesMoneyEntriesResponse,
  SalesMoneyResponse,
  type SalesMoneyEntriesQuery,
  type SalesMoneyFigures,
  type SalesPeriodKey,
} from '@pv/contracts'
import { denied, invalid } from '@api/platform/http/problem'
import { spansOf } from './performance-period'
import { PerformanceMoneyRepository, type MovedFigures } from './performance-money.repository'
import { PerformanceRepository } from './performance.repository'

/** The overview's money — read only. Buckets come from `spansOf`, so keys and
 *  order match `GET /sales/performance/:period` one for one.
 *
 *  Money is the whole contract book's (owner's call): `contract.view` at the
 *  door, and an `ownOnly` reader — who opens only the contracts they hold —
 *  is refused here rather than handed a figure cut to their own slice. */
@Injectable()
export class PerformanceMoneyService {
  constructor(
    private readonly repo: PerformanceMoneyRepository,
    private readonly performance: PerformanceRepository,
  ) {}

  async read(who: Actor, period: SalesPeriodKey): Promise<SalesMoneyResponse> {
    assertWholeBook(who)
    const { current, buckets } = spansOf(period)
    const [asOf, figures] = await Promise.all([
      this.performance.today(),
      this.repo.figures(current, buckets),
    ])
    const each = buckets.map((b) => ({ key: b.key, ...withActual(figures.get(b.key)!) }))
    return SalesMoneyResponse.parse({
      period,
      asOf,
      span: { first: current.from, last: lastDayOf(current) },
      buckets: each,
      totals: each.reduce(add, ZERO),
    })
  }

  async entries(
    who: Actor,
    period: SalesPeriodKey,
    q: SalesMoneyEntriesQuery,
  ): Promise<SalesMoneyEntriesResponse> {
    assertWholeBook(who)
    const { current, buckets } = spansOf(period)
    const bucket = buckets.find((b) => b.key === q.bucket)
    if (!bucket) throw invalid({ bucket: ['Khoảng này không thuộc kỳ đã chọn.'] })
    const entries = await this.repo.entries(current, bucket, q.kind)
    return SalesMoneyEntriesResponse.parse({
      entries,
      totalVnd: entries.reduce((n, e) => n + e.amountVnd, 0),
    })
  }
}

/** Axis 3 is `Actor.ownOnly` (`e2-access.ts`), the flag the contract book cuts on. */
function assertWholeBook(who: Actor): void {
  if (who.ownOnly) {
    throw denied('out-of-scope', 'Bạn không xem được số tiền của toàn bộ hợp đồng.')
  }
}

/** Kept money (owner's call): collected, less penalties paid out, plus penalties
 *  owed in — pending or not, since the contract counts them on termination day. */
const withActual = (f: MovedFigures): SalesMoneyFigures => ({
  ...f,
  actualVnd: f.collectedVnd - f.penaltyOut.amountVnd + f.penaltyIn.amountVnd,
})

const NO_PENALTY = { amountVnd: 0, count: 0, pending: 0, fromEarlier: 0 }
const ZERO: SalesMoneyFigures = {
  collectedVnd: 0,
  actualVnd: 0,
  dueUnpaidVnd: 0,
  penaltyIn: NO_PENALTY,
  penaltyOut: NO_PENALTY,
}
const addPenalty = (a: SalesMoneyFigures['penaltyIn'], b: SalesMoneyFigures['penaltyIn']) => ({
  amountVnd: a.amountVnd + b.amountVnd,
  count: a.count + b.count,
  pending: a.pending + b.pending,
  fromEarlier: a.fromEarlier + b.fromEarlier,
})
const add = (a: SalesMoneyFigures, b: SalesMoneyFigures): SalesMoneyFigures => ({
  collectedVnd: a.collectedVnd + b.collectedVnd,
  actualVnd: a.actualVnd + b.actualVnd,
  dueUnpaidVnd: a.dueUnpaidVnd + b.dueUnpaidVnd,
  penaltyIn: addPenalty(a.penaltyIn, b.penaltyIn),
  penaltyOut: addPenalty(a.penaltyOut, b.penaltyOut),
})
