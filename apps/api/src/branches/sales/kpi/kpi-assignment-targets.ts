import { Injectable } from '@nestjs/common'
import type { KpiPeriodKey, RoleId } from '@pv/contracts'
import type { targetSources } from './kpi-allocation.mapper'
import { KpiAssignmentRepository, type KpiSetRow } from './kpi-assignment.repository'
import { deadlineOf, defaulted, shareOf, toLine, type Line } from './kpi-assignment.mapper'
import type { Actors } from './kpi-readings.repository'
import { lapsedAt } from './kpi-rules'
import type { KpiTargetRow } from './kpi-targets.repository'
import { slotsOf, type LineAck } from './kpi.mapper'

/** ADR 0120 §8: in a tiered month a person's target is their line in the set
 *  in force, and a room metric's is the company's total; role targets are not
 *  read. Same shape as `targetSources`, so the card, the forecast and the bell
 *  filter only pick which one to call. A line unanswered past the 28th reads
 *  `lapsed` (ADR 0114's "accepted by default"), never acknowledged. */

export type TargetSources = ReturnType<typeof targetSources>
/** The line is the one ledger of a confirmation (ADR 0120 §8): the card's stamp
 *  is the last one, once every line of the role is answered. */
export type TieredSources = TargetSources & {
  confirmedAt(actorId: string, role: RoleId): Date | null
}

/** A set line as the target row `slotsOf` reads; the send is its agreement. */
const rowOf = (set: KpiSetRow, l: Line): KpiTargetRow => ({
  role: set.role,
  period: set.period,
  metricKey: l.metricKey,
  version: set.version,
  value: String(l.value),
  proposedById: set.sentBy ?? '',
  proposedAt: set.sentAt!,
  agreedById: set.sentBy,
  agreedAt: set.sentAt,
  proposedBy: set.sender ?? '',
  agreedBy: set.sender,
})

@Injectable()
export class KpiAssignmentTargets {
  constructor(private readonly repo: KpiAssignmentRepository) {}

  async sources(period: KpiPeriodKey, only?: Actors): Promise<TieredSources> {
    const all = await this.repo.sets(period)
    const held = all.filter((s) => s.status === 'sent')
    const byId = new Map(held.map((s) => [s.id, s]))
    const wanted = typeof only === 'string' ? (only ? [only] : null) : (only ?? null)
    const lines = (await this.repo.lines([...byId.keys()])).flatMap((r) => {
      const keep =
        r.kind === 'person'
          ? !wanted || wanted.includes(r.personId!)
          : r.kind === 'total' && shareOf(byId.get(r.assignmentId)!.role, r.metricKey) === 'total'
      return keep ? [{ set: byId.get(r.assignmentId)!, line: toLine(r) }] : []
    })
    const room = lines.filter((x) => x.line.kind === 'total').map((x) => rowOf(x.set, x.line))
    const own = (actorId: string, role?: RoleId) =>
      lines.filter(
        (x) => x.line.personId === actorId && (role === undefined || x.set.role === role),
      )
    const due = deadlineOf(period, 'person')
    return {
      confirmedAt: (actorId, role) => {
        const stamps = own(actorId, role).map((x) => x.line.confirmedAt?.getTime() ?? null)
        if (stamps.length === 0 || stamps.includes(null)) return null
        return new Date(Math.max(...(stamps as number[])))
      },
      slotsFor: (actorId) => slotsOf([...room, ...own(actorId).map((x) => rowOf(x.set, x.line))]),
      acksFor: (actorId, role, today): LineAck[] =>
        own(actorId, role).map(({ line }) => {
          const lapsed = defaulted(line, today, due)
          return {
            metricKey: line.metricKey,
            ackState: line.confirmedAt ? 'acknowledged' : lapsed ? 'lapsed' : 'pending',
            lapsedAt: lapsed ? lapsedAt(due) : null,
          }
        }),
    }
  }
}
