import {
  lastDayOf,
  salesGrainOf,
  OPPORTUNITY_STAGE_LABEL,
  salesPeriodOf,
  type IndustryReportCategory,
  type IndustryReportResponse,
  type SalesExitReason,
  type SalesExitsResponse,
  type SalesMoneyResponse,
  type SalesPerformanceResponse,
  type SalesPeriodFigures,
  type SalesStopReason,
} from '@pv/contracts'
import type { ToolRead } from '@api/platform/assistant/assistant-tools'

/** What `get_performance` hands the model: the overview's own numbers, reshaped for the binder.
 *
 *  Every number sits under `trusted` and carries its unit in its key (`…Vnd`, `…Percent`).
 *  A bucket's `key` becomes `period`, so the binder prints it as a label, or as a date when
 *  the bucket is a day. Config text (exit labels, industry names) goes under `untrusted`;
 *  config ids and keys are dropped. `months` is dropped: `buckets` supersedes it. */

/** Industry rows per call, categories and industries counted together. */
export const INDUSTRY_ROWS = 40

const NOT_GROUPED = 'Chưa phân nhóm'

const bucketRows = <T extends { key: string }>(buckets: readonly T[]) => ({
  rows: buckets.map(({ key, ...figures }) => ({ trusted: { period: key, ...figures } })),
})

/** The door's ratio is 0-1; null when the period has no new lead. */
const percentOf = (ratio: number | null): number | null =>
  ratio === null ? null : Math.round(ratio * 10_000) / 100

/** Closed deals as the overview counts them (`apps/web/src/pages/home-tiles.tsx`: won over
 *  won + lost + terminated); null while none closed, where the tile shows a dash. */
const winRatePercent = (f: SalesPeriodFigures): number | null => {
  const closed = f.wonDeals + f.lostDeals + f.terminatedDeals
  return percentOf(closed > 0 ? f.wonDeals / closed : null)
}

/** `reached` is filled by a week read only: other grains hold zeros, so it is left out. */
const figuresOf = <T extends SalesPeriodFigures>(f: T, week: boolean) => {
  const { reached, ...rest } = f
  return { ...rest, ...(week && { reached }), winRatePercent: winRatePercent(f) }
}

const read = (data: object, rowCount: number): ToolRead => ({
  data,
  codes: [],
  rowCount,
  hidden: null,
  revealsContent: true,
})

export function figuresRead(r: SalesPerformanceResponse): ToolRead {
  const { period, asOf, span, current, compare, open } = r
  const week = salesGrainOf(period) === 'week'
  const withOpenNow = ({ open: now, ...b }: SalesPerformanceResponse['buckets'][number]) => ({
    ...figuresOf(b, week),
    openNow: now,
  })
  return read(
    {
      figures: {
        trusted: {
          period,
          asOf,
          span,
          current: figuresOf(current, week),
          compare: { ...compare, figures: figuresOf(compare.figures, week) },
          openNow: open,
        },
        buckets: bucketRows(r.buckets.map(withOpenNow)),
      },
    },
    r.buckets.length,
  )
}

/** The overview's expected revenue: installments due in the slice, paid or not
 *  (`apps/web/src/pages/home-revenue-model.ts`, `revenueOf`). */
const withExpected = <T extends SalesMoneyResponse['totals']>(m: T) => ({
  ...m,
  expectedVnd: m.settledVnd + m.dueUnpaidVnd + m.upcomingVnd,
})

export function moneyRead(r: SalesMoneyResponse): ToolRead {
  const { period, asOf, span, totals } = r
  return read(
    {
      money: {
        trusted: { period, asOf, span, totals: withExpected(totals) },
        buckets: bucketRows(r.buckets.map(withExpected)),
      },
    },
    r.buckets.length,
  )
}

/** A deal stop also says at which column the deal stood. */
const exitRows = (
  list: readonly (SalesExitReason & Partial<Pick<SalesStopReason, 'stage'>>)[],
) => ({
  rows: list.map((e) => ({
    trusted: { count: e.count, ...(e.stage && { stage: OPPORTUNITY_STAGE_LABEL[e.stage] }) },
    untrusted: { label: e.label },
  })),
})

export function exitsRead(r: SalesExitsResponse): ToolRead {
  const { leadExits, dealStops, contractTerminations } = r
  return read(
    {
      exits: {
        trusted: { period: r.period },
        leadExits: exitRows(leadExits),
        dealStops: exitRows(dealStops),
        contractTerminations: exitRows(contractTerminations),
      },
    },
    leadExits.length + dealStops.length + contractTerminations.length,
  )
}

type Counts = Pick<IndustryReportCategory, 'open' | 'fresh' | 'deals' | 'won' | 'conversion'>

const countsOf = ({ open, fresh, deals, won, conversion }: Counts) => ({
  openNow: open,
  fresh,
  deals,
  won,
  conversionPercent: percentOf(conversion),
})

export function industriesRead(r: IndustryReportResponse): ToolRead {
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
  return read(
    {
      industries: {
        trusted: {
          period: salesPeriodOf(r.period, r.from),
          first: r.from,
          last: lastDayOf({ from: r.from, to: r.to }),
          /* One lead with several industries counts in each: rows never add up to the total. */
          overlaps: true,
          more: all.length > rows.length,
          totals: countsOf(r.totals),
        },
        rows,
      },
    },
    rows.length,
  )
}
