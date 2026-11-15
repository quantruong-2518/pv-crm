import { KPI_CATALOG, workingDaysBefore, workingDaysIn, type RoleId } from '@pv/contracts'
import { shareOf, type Line } from './kpi-assignment.mapper'

/** A leaver's month, pure (ADR 0156 §6). Reads nothing.
 *
 *  The leaver keeps `workingDaysBefore(from) / workingDaysIn` of each additive
 *  line and the receiver gains the rest. Each part is rounded once and the
 *  receiver takes the remainder, so the two always add back to the line. */

export { RAMP_FROM } from '@pv/contracts'

export type KpiTransferView = {
  period: string
  fromActorId: string
  toActorId: string | null
  fromDay: string
}

/** What the leaver keeps of one additive line; `value − kept` goes to the receiver. */
export function keptOf(t: Pick<KpiTransferView, 'period' | 'fromDay'>, value: number): number {
  const share = workingDaysBefore(t.period, t.fromDay) / workingDaysIn(t.period)
  /* Whole numbers for money and counts alike: 2.4 deals reads wrong on a card. */
  return Math.round(value * share)
}

type Held = { set: { role: RoleId }; line: Line }

const ROLE_ORDER: readonly string[] = Object.keys(KPI_CATALOG)

/** One month's lines after its transfers: each leaver's additive lines cut to
 *  their days, the remainder added to the receiver's own line of the same metric.
 *  A receiver holding the metric in two roles gains it on the first in `KPI_CATALOG` order. */
export function applyTransfers<T extends Held>(
  lines: readonly T[],
  moves: readonly KpiTransferView[],
): T[] {
  if (moves.length === 0) return [...lines]
  const byLeaver = new Map(moves.map((m) => [m.fromActorId, m]))
  const gains = new Map<string, number>()
  const cut = lines.map((x): T => {
    const { line, set } = x
    const move = line.personId ? byLeaver.get(line.personId) : undefined
    if (!move || line.kind !== 'person' || shareOf(set.role, line.metricKey) !== 'additive')
      return x
    const kept = keptOf(move, line.value)
    if (move.toActorId) {
      const at = `${move.toActorId}|${line.metricKey}`
      gains.set(at, (gains.get(at) ?? 0) + line.value - kept)
    }
    return { ...x, line: { ...line, value: kept } }
  })
  const first = new Map<string, number>()
  cut.forEach((x, i) => {
    if (x.line.kind !== 'person' || shareOf(x.set.role, x.line.metricKey) !== 'additive') return
    const at = `${x.line.personId}|${x.line.metricKey}`
    const held = first.get(at)
    if (
      held === undefined ||
      ROLE_ORDER.indexOf(x.set.role) < ROLE_ORDER.indexOf(cut[held]!.set.role)
    )
      first.set(at, i)
  })
  return cut.map((x, i): T => {
    const at = `${x.line.personId}|${x.line.metricKey}`
    const gain = first.get(at) === i ? gains.get(at) : undefined
    if (gain === undefined) return x
    return { ...x, line: { ...x.line, value: x.line.value + gain } }
  })
}
