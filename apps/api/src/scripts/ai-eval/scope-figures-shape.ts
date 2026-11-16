import {
  lastDayOf,
  OPPORTUNITY_STAGE_LABEL,
  salesPeriodOf,
  type IndustryReportResponse,
  type SalesExitsResponse,
  type SalesMoneyResponse,
  type SalesPerformanceResponse,
} from '@pv/contracts'
import { IndustryReportController } from '@api/branches/sales/industry-report/industry-report.controller'
import { PerformanceController } from '@api/branches/sales/performance/performance.controller'
import { doorId } from './scope-door'
import type { Shape } from './scope-figures-oracle'

/** What `get_performance` hands out, put together again from the door's own body: the same
 *  numbers under their unit's name, a bucket's `key` as `period`, a ratio as a percent out
 *  of 100. The overview's expected revenue and win rate are recomputed here from the door's
 *  values, not read from the tool, so a drift of the tool from the screen shows. */

const ID = {
  figures: doorId([PerformanceController, 'read']),
  exits: doorId([PerformanceController, 'exits']),
  money: doorId([PerformanceController, 'moneyRead']),
  industries: doorId([IndustryReportController, 'read']),
}

/* Typed here, not imported: the cap of the tool is what is under test. */
const INDUSTRY_ROWS = 40
const NOT_GROUPED = 'Chưa phân nhóm'

const bucketRows = <T extends { key: string }>(buckets: readonly T[]) => ({
  rows: buckets.map(({ key, ...figures }) => ({ trusted: { period: key, ...figures } })),
})

/** The overview's win rate: won over every deal closed (won, lost, terminated), as percent. */
const winRate = (f: SalesPerformanceResponse['current']) => {
  const closed = f.wonDeals + f.lostDeals + f.terminatedDeals
  return percentOf(closed > 0 ? f.wonDeals / closed : null)
}

/** `reached` is a week read's only; the other grains hold zeros the tool leaves out. */
const figuresOf = (f: SalesPerformanceResponse['current'], week: boolean) => {
  const { reached, ...rest } = f
  return { ...rest, ...(week && { reached }), winRatePercent: winRate(f) }
}

/** The overview's expected revenue: the installments due in the slice, paid or not. */
const expected = <T extends SalesMoneyResponse['totals']>(m: T) => ({
  ...m,
  expectedVnd: m.settledVnd + m.dueUnpaidVnd + m.upcomingVnd,
})

/** A ratio goes from 0-1 to percent, as the overview prints it. */
const percentOf = (ratio: number | null) =>
  ratio === null ? null : Math.round(ratio * 10_000) / 100

type Counts = IndustryReportResponse['totals']
const countsOf = (n: Counts) => ({
  openNow: n.open,
  fresh: n.fresh,
  deals: n.deals,
  won: n.won,
  conversionPercent: percentOf(n.conversion),
})

const exitRows = (list: readonly { label: string; count: number; stage?: string }[]) => ({
  rows: list.map((e) => ({
    trusted: {
      count: e.count,
      ...(e.stage && {
        stage: OPPORTUNITY_STAGE_LABEL[e.stage as keyof typeof OPPORTUNITY_STAGE_LABEL],
      }),
    },
    untrusted: { label: e.label },
  })),
})

function industriesOf(r: IndustryReportResponse) {
  const all = r.rows.flatMap((c) => {
    const name = c.name ?? NOT_GROUPED
    return [
      { trusted: { level: 'category', ...countsOf(c) }, untrusted: { name } },
      ...c.industries.map((i) => ({
        trusted: { level: 'industry', ...countsOf(i) },
        untrusted: { name: i.name, category: name },
      })),
    ]
  })
  const rows = all.slice(0, INDUSTRY_ROWS)
  const trusted = {
    period: salesPeriodOf(r.period, r.from),
    first: r.from,
    last: lastDayOf({ from: r.from, to: r.to }),
    overlaps: true,
    more: all.length > rows.length,
    totals: countsOf(r.totals),
  }
  return { out: { industries: { trusted, rows } }, rowCount: rows.length }
}

const SHAPES: Record<string, Shape> = {
  figures: (bodies, input) => {
    const r = bodies[ID.figures] as SalesPerformanceResponse
    const week = input.grain === 'week'
    const { period, asOf, span, current, compare, open } = r
    const trusted = {
      period,
      asOf,
      span,
      current: figuresOf(current, week),
      compare: { ...compare, figures: figuresOf(compare.figures, week) },
      openNow: open,
    }
    const rows = r.buckets.map(({ key, open: now, ...b }) => ({
      trusted: { period: key, ...figuresOf(b, week), openNow: now },
    }))
    return { out: { figures: { trusted, buckets: { rows } } }, rowCount: r.buckets.length }
  },
  money: (bodies) => {
    const r = bodies[ID.money] as SalesMoneyResponse
    const { period, asOf, span, totals } = r
    const out = {
      money: {
        trusted: { period, asOf, span, totals: expected(totals) },
        buckets: bucketRows(r.buckets.map(expected)),
      },
    }
    return { out, rowCount: r.buckets.length }
  },
  exits: (bodies) => {
    const r = bodies[ID.exits] as SalesExitsResponse
    const out = {
      exits: {
        trusted: { period: r.period },
        leadExits: exitRows(r.leadExits),
        dealStops: exitRows(r.dealStops),
        contractTerminations: exitRows(r.contractTerminations),
      },
    }
    return {
      out,
      rowCount: r.leadExits.length + r.dealStops.length + r.contractTerminations.length,
    }
  },
  industries: (bodies) => industriesOf(bodies[ID.industries] as IndustryReportResponse),
}

export const shapeOf: Shape = (bodies, input) => {
  const shape = SHAPES[String(input.part)]
  if (!shape) throw new Error(`no shape for part ${String(input.part)}`)
  return shape(bodies, input)
}
