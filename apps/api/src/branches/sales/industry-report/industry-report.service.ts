import { Injectable } from '@nestjs/common'
import {
  IndustryReportResponse,
  type IndustryReportCategory,
  type IndustryReportPeriod,
} from '@pv/contracts'
import { vnDay } from '../opportunity/opportunity-lifecycle'
import { IndustryReportRepository, type IndustryTally } from './industry-report.repository'

type Counts = Omit<IndustryReportCategory, 'id' | 'name' | 'industries'>

/** First day of the period holding `today`, and the first day after it. */
export function periodOf(
  period: IndustryReportPeriod,
  today: string,
): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number) as [number, number]
  const first = period === 'year' ? 1 : period === 'quarter' ? m - ((m - 1) % 3) : m
  const span = period === 'year' ? 12 : period === 'quarter' ? 3 : 1
  const day = (month: number) =>
    `${y + Math.floor((month - 1) / 12)}-${String(((month - 1) % 12) + 1).padStart(2, '0')}-01`
  return { from: day(first), to: day(first + span) }
}

/** `GET /sales/reports/industries` — the category → industry tree.
 *
 *  A row shows while its config entry is on, or while it still counts
 *  something: a retired industry that leads still carry must not vanish from
 *  the sums it is part of. The "no category" row shows only when it has leads
 *  or uncategorised industries to hold. */
@Injectable()
export class IndustryReportService {
  constructor(private readonly repo: IndustryReportRepository) {}

  async read(period: IndustryReportPeriod): Promise<IndustryReportResponse> {
    const { from, to } = periodOf(period, vnDay(new Date()))
    const [entries, tallies] = await Promise.all([
      this.repo.catalogue(),
      this.repo.tallies(from, to),
    ])
    const of = (grain: IndustryTally['grain'], key: string | null) =>
      counts(tallies.find((t) => t.grain === grain && t.key === key))

    const branch = (id: string | null, name: string | null, active: boolean) => {
      const industries = entries
        .filter((e) => e.list === 'INDUSTRY' && e.parentId === id)
        .flatMap((e) => {
          const c = of('industry', e.id)
          return e.active || busy(c) ? [{ id: e.id, name: e.name, ...c }] : []
        })
      const own = of('category', id)
      return active || busy(own) || industries.length > 0 ? [{ id, name, ...own, industries }] : []
    }

    const rows = [
      ...entries
        .filter((e) => e.list === 'CATEGORY')
        .flatMap((e) => branch(e.id, e.name, e.active)),
      ...branch(null, null, false),
    ]
    return IndustryReportResponse.parse({ period, from, to, totals: of('total', null), rows })
  }
}

/** A missing grain is all zeros; conversion is over the period's new leads. */
function counts(t: IndustryTally | undefined): Counts {
  const fresh = t?.fresh ?? 0
  return {
    open: t?.open ?? 0,
    fresh,
    deals: t?.deals ?? 0,
    won: t?.won ?? 0,
    conversion: fresh > 0 ? (t?.converted ?? 0) / fresh : null,
  }
}

const busy = (c: Counts): boolean => c.open + c.fresh + c.deals + c.won > 0
