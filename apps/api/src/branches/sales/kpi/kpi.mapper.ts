import {
  KPI_CATALOG,
  RoleId,
  type KpiReading,
  type KpiRoleTargets,
  type KpiScorecard,
} from '@pv/contracts'
import { valueKey, type KpiSeat, type KpiValues } from './kpi-readings.repository'
import type { KpiTargetRow } from './kpi-targets.repository'
import { expectedOf, verdictOf } from './kpi-verdict'

/** Rows and figures → wire. Reads nothing; the one thing it decides is which
 *  version of a target stands, because that is a property of the whole SET of
 *  versions and no single row can say it. */

/** What one role × metric holds this month. */
export type TargetSlot = { agreed: KpiTargetRow | null; pending: KpiTargetRow | null }
export type TargetSlots = ReadonlyMap<string, TargetSlot>

const slotKey = (role: RoleId, key: string): string => `${role}|${key}`

/** `rows` come oldest first, so the last agreed row seen is the highest agreed
 *  version — the effective target. At most one row is pending: propose
 *  replaces it in place rather than stacking a second one. */
export function slotsOf(rows: readonly KpiTargetRow[]): TargetSlots {
  const slots = new Map<string, TargetSlot>()
  for (const row of rows) {
    const key = slotKey(row.role, row.metricKey)
    const slot = slots.get(key) ?? { agreed: null, pending: null }
    slots.set(key, row.agreedAt ? { ...slot, agreed: row } : { ...slot, pending: row })
  }
  return slots
}

/** Every role × catalog metric, empty ones included (`KpiTargetsResponse`). */
export function toRoleTargets(slots: TargetSlots): KpiRoleTargets[] {
  return RoleId.options.map((role) => ({
    role,
    metrics: KPI_CATALOG[role].map((def) => {
      const { agreed, pending } = slots.get(slotKey(role, def.key)) ?? {}
      return {
        key: def.key,
        /* `numeric` is a string from the driver: converted here, once. */
        agreed:
          agreed?.agreedAt && agreed.agreedById && agreed.agreedBy
            ? {
                value: Number(agreed.value),
                version: agreed.version,
                agreedBy: { actorId: agreed.agreedById, name: agreed.agreedBy },
                agreedAt: agreed.agreedAt.toISOString(),
              }
            : null,
        pending: pending
          ? {
              value: Number(pending.value),
              proposedBy: { actorId: pending.proposedById, name: pending.proposedBy },
              proposedAt: pending.proposedAt.toISOString(),
            }
          : null,
      }
    }),
  }))
}

export type ScoreContext = {
  values: KpiValues
  slots: TargetSlots
  /** Share of the month gone — `elapsedOf`. */
  elapsed: number
  /** The month is the running one — `phaseOf`. */
  running: boolean
}

/** A tally nobody appears in is a real zero; a ratio or a median over nothing
 *  is not a number at all (`no-data`). A snapshot is today's figure, so it
 *  says nothing about any month but the running one. */
function valueOf(seat: KpiSeat, actorId: string, ctx: ScoreContext): number | null {
  if (seat.def.snapshot && !ctx.running) return null
  const hit = ctx.values.get(valueKey(seat, actorId))
  if (hit !== undefined) return hit
  return seat.def.unit === 'count' || seat.def.unit === 'money' ? 0 : null
}

export function toReadings(role: RoleId, actorId: string, ctx: ScoreContext): KpiReading[] {
  return KPI_CATALOG[role].map((def) => {
    const agreed = ctx.slots.get(slotKey(role, def.key))?.agreed ?? null
    const value = valueOf({ role, def }, actorId, ctx)
    const target = agreed ? Number(agreed.value) : null
    return {
      key: def.key,
      value,
      target,
      targetVersion: agreed?.version ?? null,
      expected: expectedOf(target, def, ctx.elapsed),
      verdict: verdictOf(value, target, def, ctx.elapsed),
    }
  })
}

/** `acknowledgedAt` is the holder's stamp for this role × month, if any. Stale
 *  = some agreed target of the role was agreed after it. */
export function toScorecard(
  role: RoleId,
  actorId: string,
  ctx: ScoreContext,
  acknowledgedAt: Date | null,
): KpiScorecard {
  const stale =
    acknowledgedAt !== null &&
    KPI_CATALOG[role].some((def) => {
      const agreedAt = ctx.slots.get(slotKey(role, def.key))?.agreed?.agreedAt
      return agreedAt ? agreedAt.getTime() > acknowledgedAt.getTime() : false
    })
  return {
    role,
    readings: toReadings(role, actorId, ctx),
    acknowledgedAt: acknowledgedAt?.toISOString() ?? null,
    acknowledgementStale: stale,
  }
}
