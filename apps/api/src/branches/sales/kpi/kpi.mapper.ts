import {
  RoleId,
  type KpiAckState,
  type KpiMetricKey,
  type KpiReading,
  type KpiRoleTargets,
  type KpiScorecard,
} from '@pv/contracts'
import type { KpiCatalog } from './kpi-config.overlay'
import {
  valueKey,
  type KpiAdjustmentSums,
  type KpiSeat,
  type KpiValues,
} from './kpi-readings.repository'
import type { KpiTargetRow } from './kpi-targets.repository'
import { expectedOf, verdictOf } from './kpi-verdict'

/** Rows and figures → wire. Reads nothing; the one thing it decides is which
 *  version of a target stands, because that is a property of the whole SET of
 *  versions and no single row can say it. */

/** What one role × metric holds this month. */
export type TargetSlot = { agreed: KpiTargetRow | null; pending: KpiTargetRow | null }
export type TargetSlots = ReadonlyMap<string, TargetSlot>

const slotKey = (role: RoleId, key: string): string => `${role}|${key}`

/** The effective target row of one role × metric, whichever source won it. */
export const agreedIn = (
  slots: TargetSlots,
  role: RoleId,
  key: KpiMetricKey,
): KpiTargetRow | null => slots.get(slotKey(role, key))?.agreed ?? null

/** A holder's answer on one personal line (ADR 0098 §3). `lapsedAt` is set
 *  exactly when `ackState` is `lapsed`: the deadline counts as the answer. */
export type LineAck = { metricKey: KpiMetricKey; ackState: KpiAckState; lapsedAt: Date | null }

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

/** Every role × effective metric, empty ones included (`KpiTargetsResponse`). */
export function toRoleTargets(slots: TargetSlots, catalog: KpiCatalog): KpiRoleTargets[] {
  return RoleId.options.map((role) => ({
    role,
    metrics: catalog[role].map((def) => {
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
  /** The effective catalog (`KpiConfigService.effectiveCatalog`). */
  catalog: KpiCatalog
  values: KpiValues
  slots: TargetSlots
  /** Share of the month gone — `elapsedOf`. */
  elapsed: number
  /** The month is the running one — `phaseOf`. */
  running: boolean
  /** Ratio 0–0.99 of the pace a figure may fall short of and still be on track. */
  tolerance: number
  /** Only the doors that print `adjustedBy`/`afterAdjustments` read them; `values`
   *  already carries the applied sums (`monthValues`). */
  adjustments?: KpiAdjustmentSums
}

/** A tally nobody appears in is a real zero; a ratio or a median over nothing
 *  is not a number at all (`no-data`). A snapshot is read as of the month's
 *  end or today, so a month that has not begun has none (`elapsed` 0, not running). */
function valueOf(seat: KpiSeat, actorId: string, ctx: ScoreContext): number | null {
  if (seat.def.snapshot && !ctx.running && ctx.elapsed === 0) return null
  const hit = ctx.values.get(valueKey(seat, actorId))
  if (hit !== undefined) return hit
  return seat.def.unit === 'count' || seat.def.unit === 'money' ? 0 : null
}

/** `own` are the holder's personal lines of `role`: a personal line beats the
 *  role target (`targetSources`), so a slot with one reads that line's answer.
 *  Callers without lines get `targetAck: null`, the role-target reading. */
export function toReadings(
  role: RoleId,
  actorId: string,
  ctx: ScoreContext,
  own: readonly LineAck[] = [],
): KpiReading[] {
  return ctx.catalog[role].map((def) => {
    const agreed = agreedIn(ctx.slots, role, def.key)
    const value = valueOf({ role, def }, actorId, ctx)
    const target = agreed ? Number(agreed.value) : null
    /* Only additive series have adjustment rows, so an absent sum is "not adjusted". */
    const key = valueKey({ role, def }, actorId)
    const sourced = ctx.adjustments?.sourced.get(key)
    return {
      key: def.key,
      value,
      target,
      targetVersion: agreed?.version ?? null,
      targetAck: own.find((l) => l.metricKey === def.key)?.ackState ?? null,
      expected: expectedOf(target, def, ctx.elapsed),
      verdict: verdictOf(value, target, def, ctx.elapsed, ctx.tolerance),
      adjustedBy: ctx.adjustments?.applied.get(key) ?? null,
      afterAdjustments: sourced === undefined || value === null ? null : value + sourced,
    }
  })
}

/** `acknowledgedAt` is the holder's stamp for this role × month, if any.
 *
 *  A slot with a personal line is answered on the line itself (`own`), so it
 *  is left out of "stale" and instead holds the card unacknowledged until
 *  every line reads `acknowledged` or `lapsed` (a missed deadline is an answer,
 *  stamped at the instant it ran out). A slot without one keeps the role rule:
 *  stale = its agreed target was agreed after the stamp. */
export function toScorecard(
  role: RoleId,
  actorId: string,
  ctx: ScoreContext,
  acknowledgedAt: Date | null,
  own: readonly LineAck[] = [],
): KpiScorecard {
  const personal = new Set(own.map((l) => l.metricKey))
  const answered = own.every((l) => l.ackState === 'acknowledged' || l.ackState === 'lapsed')
  const lapses = own.flatMap((l) => (l.lapsedAt ? [l.lapsedAt] : []))
  const stamps = [acknowledgedAt, ...lapses].filter((d): d is Date => d !== null)
  const at = answered && stamps.length > 0 ? new Date(Math.max(...stamps.map((d) => +d))) : null
  const stale =
    at !== null &&
    ctx.catalog[role].some((def) => {
      const agreedAt = personal.has(def.key) ? null : agreedIn(ctx.slots, role, def.key)?.agreedAt
      return agreedAt ? agreedAt.getTime() > at.getTime() : false
    })
  return {
    role,
    readings: toReadings(role, actorId, ctx, own),
    acknowledgedAt: at?.toISOString() ?? null,
    acknowledgementStale: stale,
    acceptedByDefault: own.some((l) => l.ackState === 'lapsed'),
  }
}
