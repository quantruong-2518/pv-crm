import {
  KPI_CLOSE_GATE_RULES,
  type KpiCloseGateBigContract,
  type KpiCloseGateLateHeavy,
} from '@pv/contracts'
import type { KpiBasisAverage, KpiBasisRow } from './kpi-readings.repository'

/** The two "unusual figure" flags of the close gate (ADR 0116 §2), pure: rows
 *  in, flags out. The rows are `signed-value`'s basis — live contracts in VND,
 *  the room's for the big contract, the owner-credited own one for the late
 *  share — so a flag never names a contract the card does not count.
 *  Thresholds come only from `KPI_CLOSE_GATE_RULES`. */

const { bigContractRatio, lateShare, lateDays } = KPI_CLOSE_GATE_RULES
const DAY_MS = 86_400_000

const actorOf = (r: KpiBasisRow) =>
  r.actorId ? { actorId: r.actorId, name: r.name ?? r.actorId } : null

/** `room` judges every contract, an ownerless one included; `owned` only says
 *  whose it is. No earlier contract, or an average of nothing, leaves nothing
 *  to compare against (ADR 0116, default 1): no flag, not a made-up baseline. */
export function bigContracts(
  room: readonly KpiBasisRow[],
  owned: readonly KpiBasisRow[],
  earlier: KpiBasisAverage,
): KpiCloseGateBigContract[] {
  const { average, count } = earlier
  if (count === 0 || average <= 0) return []
  const owners = new Map(owned.map((r) => [r.code, actorOf(r)]))
  return room.flatMap((r) => {
    const ratio = (r.value ?? 0) / average
    if (ratio <= bigContractRatio) return []
    const actor = owners.get(r.code) ?? null
    return [{ code: r.code, actor, value: Math.round(r.value ?? 0), average, ratio }]
  })
}

/** Per person with a signed contract in the month (ADR 0116, default 2).
 *  `monthTo` is the first day after the month; its last `lateDays` Vietnam
 *  days start at midnight +07 that many days before it. */
export function lateHeavy(owned: readonly KpiBasisRow[], monthTo: string): KpiCloseGateLateHeavy[] {
  const from = Date.parse(`${monthTo}T00:00:00+07:00`) - lateDays * DAY_MS
  const byActor = new Map<string, { row: KpiBasisRow; total: number; late: number }>()
  for (const r of owned) {
    if (!r.actorId) continue
    const seen = byActor.get(r.actorId) ?? { row: r, total: 0, late: 0 }
    seen.total += r.value ?? 0
    if (r.at.getTime() >= from) seen.late += r.value ?? 0
    byActor.set(r.actorId, seen)
  }
  return [...byActor.values()].flatMap(({ row, total, late }) => {
    const actor = actorOf(row)
    const share = total > 0 ? late / total : 0
    if (!actor || share <= lateShare) return []
    return [{ actor, monthValue: Math.round(total), lastDaysValue: Math.round(late), share }]
  })
}
