import { RoleId } from '@pv/contracts'
import type { KpiCatalog } from '@api/branches/sales/kpi/kpi-config.overlay'
import type { KpiAbsenceValues } from '@api/branches/sales/kpi/kpi-absence.schema'
import type { KpiAcknowledgementValues, KpiTargetValues } from '@api/branches/sales/kpi/kpi.schema'
import { vnAt } from './clock'
import { figure, holdersOf, type Person } from './emit-kpi-figures'
import { CAST } from './params'
import type { Rng } from './rng'

/** Role targets of the quarter (proposed by the head, agreed by the director a
 *  few days before each month), who acknowledged them, and the absences.
 *
 *  Months 08-10 are plain: everyone holding a role acknowledged it the day after
 *  the agreement, bar two exceptions that give the screens something to show: a
 *  missing answer and a stale one (older than the agreement). November's answers
 *  come from its allocation packages, so they live in `emit-kpi-packages.ts`. */

export const PERIODS = ['2026-08', '2026-09', '2026-10', '2026-11'] as const
type Period = (typeof PERIODS)[number]

const AGREED_DAY = 28
const PROPOSED_DAY = 25

export const monthBefore = (period: string): string => {
  const [y = 0, m = 1] = period.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

export function targetRows(catalogs: ReadonlyMap<string, KpiCatalog>, people: Person[]) {
  return PERIODS.flatMap((period) =>
    RoleId.options.flatMap((role) => {
      const defs = catalogs.get(period)?.[role] ?? []
      const holders = holdersOf(people, role).length
      return defs.flatMap((def, i): KpiTargetValues[] => {
        const value = figure(role, def, period, holders)
        if (value === null) return []
        const prev = monthBefore(period)
        return [
          {
            role,
            period,
            metricKey: def.key,
            version: 1,
            value: String(value),
            proposedById: CAST.head,
            proposedAt: vnAt(`${prev}-${PROPOSED_DAY}`, 9, i * 5),
            agreedById: CAST.director,
            agreedAt: vnAt(`${prev}-${AGREED_DAY}`, 10, i * 5),
          },
        ]
      })
    }),
  )
}

/** The October answers left out or made stale on purpose. */
const MISSING = new Set(['u-vivian|marketing'])
const STALE = new Set(['u-test2|bd'])

export function ackRows(catalogs: ReadonlyMap<string, KpiCatalog>, people: Person[]) {
  const out: KpiAcknowledgementValues[] = []
  let n = 0
  for (const period of PERIODS.filter((p): p is Period => p !== '2026-11')) {
    for (const person of people) {
      for (const role of RoleId.options) {
        if (!person.roleIds.includes(role) || !catalogs.get(period)?.[role]?.length) continue
        const key = `${person.id}|${role}`
        if (period === '2026-10' && MISSING.has(key)) continue
        const prev = monthBefore(period)
        const stale = period === '2026-10' && STALE.has(key)
        const at = stale
          ? vnAt(`${prev}-27`, 15)
          : vnAt(`${prev}-${AGREED_DAY + 1}`, 9 + (n % 8), (n * 7) % 60)
        out.push({ actorId: person.id, role, period, acknowledgedAt: at })
        n++
      }
    }
  }
  return out
}

/** Past, cancelled, running (covers the run day, 16/11) and future, each with a different stand-in. */
const ABSENCES = [
  {
    who: 'u-sale1',
    from: '2026-11-12',
    to: '2026-11-18',
    by: 'u-sale1',
    at: '2026-11-09',
    standIn: 'u-test1',
  },
  {
    who: 'u-nari',
    from: '2026-10-05',
    to: '2026-10-09',
    by: CAST.head,
    at: '2026-10-01',
    standIn: 'u-test2',
  },
  {
    who: 'u-vita',
    from: '2026-11-23',
    to: '2026-11-27',
    by: 'u-vita',
    at: '2026-11-10',
    standIn: 'u-vivian',
  },
  {
    who: 'u-test2',
    from: '2026-09-14',
    to: '2026-09-18',
    by: 'u-test2',
    at: '2026-09-10',
    standIn: 'u-test1',
    cancelled: '2026-09-12',
  },
] as const

export function absenceRows(rng: Rng): KpiAbsenceValues[] {
  return ABSENCES.map((a) => ({
    id: rng.uuid(),
    actorId: a.who,
    fromDay: a.from,
    toDay: a.to,
    standInId: a.standIn,
    declaredById: a.by,
    declaredAt: vnAt(a.at, 10),
    cancelledAt: 'cancelled' in a ? vnAt(a.cancelled, 9) : null,
  }))
}
