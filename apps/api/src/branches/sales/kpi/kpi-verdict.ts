import type { KpiMetricDef, KpiVerdict } from '@pv/contracts'

/** Pace and verdict of one reading — pure, so it can move to `@pv/engines`
 *  unchanged: no clock, no database, no Nest.
 *
 *  There is no tolerance margin on purpose: "close enough" would be a
 *  threshold nobody agreed, sitting beside a target two managers did. */

/** Share of the month's days already GONE, today excluded, so an open month
 *  stays below 1 until its last day ends and `1` can mean "closed".
 *  All three are `YYYY-MM-DD` Vietnam days; `to` is exclusive. */
export function elapsedOf(from: string, to: string, today: string): number {
  if (today >= to) return 1
  if (today < from) return 0
  /* A bare date parses as UTC midnight, so the differences are whole days. */
  return (Date.parse(today) - Date.parse(from)) / (Date.parse(to) - Date.parse(from))
}

/** Where a month stands against today. `elapsedOf` cannot say it alone: the
 *  first day of the running month and any future month both read 0. */
export function phaseOf(from: string, to: string, today: string): 'closed' | 'running' | 'future' {
  if (today >= to) return 'closed'
  return today < from ? 'future' : 'running'
}

/** What pace asks for by today: a paced metric owes its share of the target,
 *  every other one owes the whole of it from the first day. */
export function expectedOf(
  target: number | null,
  def: Pick<KpiMetricDef, 'paced'>,
  elapsed: number,
): number | null {
  if (target === null) return null
  return def.paced ? target * elapsed : target
}

export function verdictOf(
  value: number | null,
  target: number | null,
  def: Pick<KpiMetricDef, 'higherIsBetter' | 'paced'>,
  elapsed: number,
): KpiVerdict {
  if (value === null) return 'no-data'
  if (target === null) return 'unset'
  if (def.higherIsBetter ? value >= target : value <= target) return 'met'
  if (elapsed >= 1) return 'missed'
  /* A lower-is-better figure has no pace to be ahead of: over is behind. */
  if (!def.higherIsBetter) return 'behind'
  const expected = expectedOf(target, def, elapsed)
  return expected !== null && value >= expected ? 'on-track' : 'behind'
}
