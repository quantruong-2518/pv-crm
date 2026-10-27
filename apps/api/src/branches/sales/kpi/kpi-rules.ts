import {
  isTieredPeriod,
  KPI_METRIC_LABEL,
  TIERED_FROM,
  type KpiAckState,
  type KpiAssignmentErrorCode,
  type KpiAckStatus,
  type KpiMetricDef,
  type KpiMetricKey,
  type KpiPeriodKey,
} from '@pv/contracts'
import { conflict, invalid, type PvError } from '@api/platform/http/problem'
import { spansOf } from '../performance/performance-period'
import { elapsedOf, phaseOf } from './kpi-verdict'

/** The month clock and the value rules every KPI door shares — one copy, so
 *  the scorecard, the allocation doors and the forecast cannot drift apart.
 *  The clock is read here and handed to `kpi-verdict.ts` as a number, which
 *  is what keeps the verdict pure. */

/** Vietnam is UTC+7 all year, so its calendar day is a fixed shift. */
export const vietnamToday = (at = Date.now()): string =>
  new Date(at + 7 * 3_600_000).toISOString().slice(0, 10)

const DAY_MS = 86_400_000
const VIETNAM_MS = 7 * 3_600_000

/** The acknowledgement deadline of an AGREED package (`lastAgreed`'s own test:
 *  decided and not returned): its decision day in Vietnam plus `ackDays`.
 *  `null` = no deadline, either not agreed yet or agreed before it existed. */
export function ackDueOn(pkg: {
  decidedAt: Date | null
  returnReason: string | null
  ackDays: number | null
}): string | null {
  if (!pkg.decidedAt || pkg.returnReason !== null || pkg.ackDays === null) return null
  const decided = Date.parse(
    new Date(pkg.decidedAt.getTime() + VIETNAM_MS).toISOString().slice(0, 10),
  )
  return new Date(decided + pkg.ackDays * DAY_MS).toISOString().slice(0, 10)
}

/** What `ackStateOf` reads off a stored line. */
export type AckLine = { ackStatus: KpiAckStatus; ackedAt: Date | null; ackedByDefault: boolean }

/** A line nobody answered by the end of `dueOn` counts as acknowledged at the
 *  deadline: derived on every read, so there is no sweep to fail. A countered
 *  line never lapses; its counter is in the manager's hands. A line carried
 *  lapsed into a reissue keeps reading lapsed under the new deadline (ADR 0114). */
export function ackStateOf(line: AckLine, dueOn: string | null, today: string): KpiAckState {
  if (line.ackedByDefault) return 'lapsed'
  return line.ackStatus === 'pending' && dueOn !== null && today > dueOn ? 'lapsed' : line.ackStatus
}

/** The instant a deadline ran out: the next Vietnam midnight after `dueOn`. */
export const lapsedAt = (dueOn: string): Date => new Date(Date.parse(dueOn) + DAY_MS - VIETNAM_MS)

/** When `line` lapsed, `null` if it did not. A carried line lapsed under an
 *  older package, whose deadline only its stored stamp still remembers. */
export function lapseOf(line: AckLine, dueOn: string | null, today: string): Date | null {
  if (line.ackedByDefault) return line.ackedAt
  return ackStateOf(line, dueOn, today) === 'lapsed' && dueOn ? lapsedAt(dueOn) : null
}

/** The Vietnam day whose deadline `line` missed: `lapsedAt` run backwards, so
 *  a live lapse gives `dueOn` and a carried one the day its stamp closed. */
export function lapsedOnOf(line: AckLine, dueOn: string | null, today: string): string | null {
  const at = lapseOf(line, dueOn, today)
  return at && new Date(at.getTime() + VIETNAM_MS - DAY_MS).toISOString().slice(0, 10)
}

/** A holder cannot answer a line whose deadline has gone. */
export function assertNotLapsed(states: readonly KpiAckState[]): void {
  if (states.includes('lapsed')) {
    throw conflict('Đã quá hạn nhận chỉ tiêu, mức đã giao được áp dụng.')
  }
}

/** The month after `period`, as a month key. */
export const nextMonth = (period: KpiPeriodKey): KpiPeriodKey =>
  spansOf(period).current.to.slice(0, 7)

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

/** An away setter drops out of the pool and its doors (ADR 0117 §5). */
export const awayRefusal = () => conflict('Bạn đang trong kỳ vắng nên việc này do người khác làm.')

/** A `KpiAssignmentRefusal`: the code rides beside the Problem fields (`extra`). */
export const assignmentRefusal = (
  code: KpiAssignmentErrorCode,
  title: string,
  metricKeys?: readonly KpiMetricKey[],
): PvError =>
  Object.assign(conflict(title), { extra: metricKeys ? { code, metricKeys } : { code } })

const TIERED_LABEL = `tháng ${Number(TIERED_FROM.slice(5))}/${TIERED_FROM.slice(0, 4)}`

/** ADR 0120 §1: every old write door is closed from the cutover month on. */
export function assertOldMonth(period: KpiPeriodKey): void {
  if (isTieredPeriod(period)) {
    throw assignmentRefusal(
      'kpi-month-tiered',
      `Từ ${TIERED_LABEL}, chỉ tiêu được giao theo phòng ban và nhóm.`,
    )
  }
}

/** ADR 0120 §1: and every new door is closed before it. */
export function assertTieredMonth(period: KpiPeriodKey): void {
  if (!isTieredPeriod(period)) {
    throw assignmentRefusal(
      'kpi-month-not-tiered',
      `Giao chỉ tiêu theo phòng ban và nhóm bắt đầu từ ${TIERED_LABEL}.`,
    )
  }
}
