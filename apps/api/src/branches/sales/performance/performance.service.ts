import { Injectable } from '@nestjs/common'
import { SalesPerformanceResponse, type SalesPeriodKey } from '@pv/contracts'
import { OpportunityService } from '../opportunity/opportunity.service'
import { spansOf } from './performance-period'
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
    private readonly opportunities: OpportunityService,
  ) {}

  async read(period: SalesPeriodKey): Promise<SalesPerformanceResponse> {
    const { current, previous, months } = spansOf(period)
    /* A month period is also one of its quarter's months: asked for once. */
    const spans = new Map([current, previous, ...months].map((s) => [s.key, s]))

    /* `open` is ASKED of the opportunity book, not re-derived: the tile sits
       beside that book's scorecard and must print the same three numbers. */
    const [figures, card] = await Promise.all([
      this.repo.figures([...spans.values()]),
      this.opportunities.scorecard(),
    ])

    /* Parsed rather than returned raw, like the books: a span the query dropped
       or a column that changed type trips here and not on a screen. */
    return SalesPerformanceResponse.parse({
      period,
      current: figures.get(current.key),
      previous: figures.get(previous.key),
      open: { count: card.open, amountVnd: card.openAmountVnd, blank: card.openBlank },
      months: months.map((m) => ({ key: m.key, ...figures.get(m.key) })),
    })
  }
}
