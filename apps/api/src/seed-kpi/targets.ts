import { RoleId, type KpiMetricKey } from '@pv/contracts'
import type { KpiCatalog } from '@api/branches/sales/kpi/kpi-config.overlay'
import type { kpiAbsence } from '@api/branches/sales/kpi/kpi-absence.schema'
import type { kpiAcknowledgement, kpiTarget } from '@api/branches/sales/kpi/kpi.schema'
import { DIRECTOR, HEAD, PEOPLE, idOf, vn, type Key } from './cast'

/** Role targets for the three untiered months, who acknowledged them, and
 *  the absences with their stand-ins (ADR 0082 §5, 0117).
 *
 *  A target is per ROLE, so one figure serves every holder: the October book
 *  is tuned against these numbers. Every row has the seeded second head on
 *  one side of the four eyes, which is how purge finds it. Metrics switched
 *  off in config are skipped; no ratio exceeds 1. November's presales targets
 *  stay proposed, so the agree door has something to approve. */

export const PERIODS = ['2026-09', '2026-10', '2026-11'] as const

const M = 1_000_000

const TARGETS: Record<RoleId, Partial<Record<KpiMetricKey, number>>> = {
  director: {
    'signed-value': 3000 * M,
    'collected-value': 800 * M,
    'approval-turnaround-hours': 24,
    'overdue-receivables': 100 * M,
  },
  'head-of-sales': {
    'signed-value': 3000 * M,
    'win-rate': 0.5,
    'accept-lag-days': 2,
    'overdue-receivables': 100 * M,
  },
  marketing: {
    'leads-sourced': 5,
    'lead-to-opportunity-rate': 0.5,
    'sourced-signed-value': 800 * M,
  },
  bd: { 'opportunities-opened': 4, 'first-response-hours': 8, 'opportunity-accept-rate': 0.75 },
  presales: { 'demos-joined': 4 },
  sale: {
    'signed-value': 600 * M,
    'win-rate': 0.5,
    'debriefs-closed': 4,
    'overdue-receivables': 50 * M,
  },
  'account-executive': {
    'opportunities-opened': 2,
    'debriefs-closed': 3,
    'win-rate': 0.5,
    'signed-value': 400 * M,
    'overdue-receivables': 30 * M,
  },
}

const AGREED_ON: Record<(typeof PERIODS)[number], string> = {
  '2026-09': '2026-08-28 10:00',
  '2026-10': '2026-09-28 10:00',
  '2026-11': '2026-10-29 10:00',
}

type TargetRow = typeof kpiTarget.$inferInsert

/** `taken` holds `role|period|metric` already in the table: a real target
 *  there wins, and the seeded holders are judged against it. */
export function targetRows(catalog: KpiCatalog, taken: ReadonlySet<string>): TargetRow[] {
  const second = idOf('head2')
  return PERIODS.flatMap((period) =>
    RoleId.options.flatMap((role, i) => {
      const agreedAt = vn(AGREED_ON[period])
      const pending = period === '2026-11' && role === 'presales'
      const [proposer, agreer] = i % 2 === 0 ? [DIRECTOR, second] : [second, DIRECTOR]
      return catalog[role].flatMap((def): TargetRow[] => {
        const value = TARGETS[role][def.key]
        if (value === undefined || taken.has(`${role}|${period}|${def.key}`)) return []
        return [
          {
            role,
            period,
            metricKey: def.key,
            version: 1,
            value: String(value),
            proposedById: pending ? second : proposer,
            proposedAt: new Date(agreedAt.getTime() - 86_400_000),
            agreedById: pending ? null : agreer,
            agreedAt: pending ? null : agreedAt,
          },
        ]
      })
    }),
  )
}

/** Who acknowledged the targets: everyone in September; in October all
 *  but Marketing 3, with BD 3's answer older than the agreement (stale); in
 *  November only some. */
const NOVEMBER: readonly Key[] = ['head2', 'mkt1', 'bd1', 'sale1', 'sale2', 'ae1', 'ae3']

export function ackRows(taken: ReadonlySet<string>): (typeof kpiAcknowledgement.$inferInsert)[] {
  return PEOPLE.flatMap((p) => {
    const role = p.roleIds[0]!
    const at = (period: string): Date | null => {
      if (period === '2026-09') return vn('2026-08-29 10:00')
      if (period === '2026-10') {
        if (p.key === 'mkt3') return null
        return vn(p.key === 'bd3' ? '2026-09-20 10:00' : '2026-09-29 10:00')
      }
      return NOVEMBER.includes(p.key) ? vn('2026-10-30 10:00') : null
    }
    return PERIODS.flatMap((period) => {
      const acknowledgedAt = at(period)
      if (!acknowledgedAt || taken.has(`${p.id}|${role}|${period}`)) return []
      return [{ actorId: p.id, role, period, acknowledgedAt }]
    })
  })
}

/** Past, cancelled, running and future absences, each with a stand-in. */
const ABSENCES = [
  {
    who: 'sale2',
    from: '2026-10-13',
    to: '2026-10-17',
    standIn: idOf('sale1'),
    by: idOf('sale2'),
    at: '2026-10-10',
  },
  {
    who: 'ae1',
    from: '2026-10-01',
    to: '2026-10-03',
    standIn: idOf('ae3'),
    by: idOf('ae1'),
    at: '2026-09-28',
    cancelled: '2026-09-30',
  },
  {
    who: 'bd1',
    from: '2026-11-03',
    to: '2026-11-06',
    standIn: idOf('bd2'),
    by: DIRECTOR,
    at: '2026-11-02',
  },
  {
    who: 'head2',
    from: '2026-11-20',
    to: '2026-11-24',
    standIn: HEAD,
    by: DIRECTOR,
    at: '2026-11-03',
  },
  {
    who: 'pre1',
    from: '2026-12-21',
    to: '2026-12-31',
    standIn: idOf('pre2'),
    by: idOf('pre1'),
    at: '2026-11-03',
  },
] as const satisfies readonly {
  who: Key
  from: string
  to: string
  standIn: string
  by: string
  at: string
  cancelled?: string
}[]

/** `taken` holds `actor|from_day` already declared. */
export function absenceRows(taken: ReadonlySet<string>): (typeof kpiAbsence.$inferInsert)[] {
  return ABSENCES.flatMap((a) =>
    taken.has(`${idOf(a.who)}|${a.from}`)
      ? []
      : [
          {
            actorId: idOf(a.who),
            fromDay: a.from,
            toDay: a.to,
            standInId: a.standIn,
            declaredById: a.by,
            declaredAt: vn(a.at),
            cancelledAt: 'cancelled' in a ? vn(a.cancelled) : null,
          },
        ],
  )
}
