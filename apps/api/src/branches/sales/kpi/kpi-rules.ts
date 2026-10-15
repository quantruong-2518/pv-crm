import {
  KPI_METRIC_LABEL,
  type KpiMetricDef,
  type KpiMetricKey,
  type KpiPeriodKey,
} from '@pv/contracts'
import { conflict, invalid } from '@api/platform/http/problem'
import { spansOf } from '../performance/performance-period'
import { elapsedOf, phaseOf } from './kpi-verdict'

/** The month clock and the value rules every KPI door shares — one copy, so
 *  the scorecard, the allocation doors and the forecast cannot drift apart.
 *  The clock is read here and handed to `kpi-verdict.ts` as a number, which
 *  is what keeps the verdict pure. */

/** Vietnam is UTC+7 all year, so its calendar day is a fixed shift. */
export const vietnamToday = (): string =>
  new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)

/** Where a month stands today; shared with the allocation doors so both read one clock. */
export function monthClock(period: KpiPeriodKey): {
  elapsed: number
  phase: ReturnType<typeof phaseOf>
} {
  const { from, to } = spansOf(period).current
  const today = vietnamToday()
  return { elapsed: elapsedOf(from, to, today), phase: phaseOf(from, to, today) }
}

/** A closed month is read-only: its targets are what the month was judged
 *  against. The running month and every future one stay open — a target is
 *  meant to be agreed before its month starts. */
export function stillOpen(period: KpiPeriodKey): void {
  if (monthClock(period).phase === 'closed') {
    throw conflict('Tháng này đã kết thúc, không đổi được chỉ tiêu.')
  }
}

/** What a target value may be, for a role target and a personal line alike:
 *  a metric the role carries in the EFFECTIVE catalog (`catalog[role]` — a
 *  switched-off one takes no new target), and a ratio no higher than 1 (0–1
 *  on the wire — 40 where 0.4 was meant can never be met). */
export function assertTargetValues(
  roleDefs: readonly KpiMetricDef[],
  entries: readonly { metricKey: KpiMetricKey; value: number }[],
  field: string,
): void {
  const defs = new Map(roleDefs.map((d) => [d.key, d]))
  const names = (list: readonly { metricKey: KpiMetricKey }[]) =>
    [...new Set(list.map((e) => KPI_METRIC_LABEL[e.metricKey]))].join(', ')
  const stray = entries.filter((e) => !defs.has(e.metricKey))
  if (stray.length > 0) throw invalid({ [field]: [`Vai này không dùng chỉ số: ${names(stray)}.`] })
  const over = entries.filter((e) => defs.get(e.metricKey)?.unit === 'ratio' && e.value > 1)
  if (over.length > 0) {
    throw invalid({ [field]: [`Chỉ tiêu dạng tỷ lệ không vượt quá 100%: ${names(over)}.`] })
  }
}
