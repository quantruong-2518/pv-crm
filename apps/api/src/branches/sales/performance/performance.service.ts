import { Injectable } from '@nestjs/common'
import {
  lastDayOf,
  salesGrainOf,
  SalesExitsResponse,
  SalesPerformanceResponse,
  type SalesPeriodKey,
} from '@pv/contracts'
import { OpportunityService } from '../opportunity/opportunity.service'
import { spansOf, type PeriodSpan } from './performance-period'
import { PerformanceExitsRepository } from './performance-exits.repository'
import { PerformanceRepository } from './performance.repository'

/** The overview's period figures — read only, and it holds no engine.
 *
 *  No `Actor` and no scope axis, the call the three scorecards made: these are
 *  the desk's numbers, and cutting them by who owns what makes everyone read a
 *  different figure under one label. */
@Injectable()
export class PerformanceService {
  constructor(
    private readonly repo: PerformanceRepository,
    private readonly exitsRepo: PerformanceExitsRepository,
    private readonly opportunities: OpportunityService,
  ) {}

  async read(period: SalesPeriodKey): Promise<SalesPerformanceResponse> {
    /* `open` is ASKED of the opportunity book, not re-derived: the tile sits
       beside that book's scorecard and must print the same three numbers. */
    const [asOf, card] = await Promise.all([this.repo.today(), this.opportunities.scorecard()])
    const { current, previous, compare, months, buckets } = spansOf(period, asOf)
    /* One key is one span (`spansOf` keys a cut compare apart), so a month
       that is also a bucket or one of `months` is asked for once. */
    const spans = new Map(
      [current, previous, compare, ...months, ...buckets].map((s) => [s.key, s]),
    )
    const [figures, openSpans] = await Promise.all([
      this.repo.figures([...spans.values()], { reached: salesGrainOf(period) === 'week' }),
      this.repo.openBySpan(buckets),
    ])
    const placed = [...openSpans.values()]
    const unplaced = {
      count: card.open - placed.reduce((n, o) => n + o.count, 0),
      amountVnd: card.openAmountVnd - placed.reduce((n, o) => n + o.amountVnd, 0),
    }
    const range = (s: PeriodSpan) => ({ first: s.from, last: lastDayOf(s) })

    /* Parsed rather than returned raw, like the books: a span the query dropped
       or a column that changed type trips here and not on a screen. */
    return SalesPerformanceResponse.parse({
      period,
      asOf,
      span: range(current),
      current: figures.get(current.key),
      previous: figures.get(previous.key),
      compare: { ...range(compare), figures: figures.get(compare.key) },
      open: { count: card.open, amountVnd: card.openAmountVnd, blank: card.openBlank, unplaced },
      buckets: buckets.map((b) => ({
        key: b.key,
        ...range(b),
        ...figures.get(b.key),
        open: openSpans.get(b.key),
      })),
      months: months.map((m) => ({ key: m.key, ...figures.get(m.key) })),
    })
  }

  /** The selected period only: a reasons chart compares nothing with before. */
  async exits(period: SalesPeriodKey): Promise<SalesExitsResponse> {
    const { current } = spansOf(period)
    const [leadExits, dealStops, contractTerminations] = await Promise.all([
      this.exitsRepo.leadExits(current),
      this.exitsRepo.dealStops(current),
      this.exitsRepo.contractTerminations(current),
    ])
    return SalesExitsResponse.parse({ period, leadExits, dealStops, contractTerminations })
  }
}
