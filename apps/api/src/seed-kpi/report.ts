import { RoleId, type KpiMetricDef } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { catalogOf } from '@api/branches/sales/kpi/kpi-config.overlay'
import { kpiRoleMetric } from '@api/branches/sales/kpi/kpi-config.schema'
import { KpiReadingsRepository, valueKey } from '@api/branches/sales/kpi/kpi-readings.repository'
import { spansOf } from '@api/branches/sales/performance/performance-period'
import { HEAD, PEOPLE, TAG } from './cast'
import { PERIODS } from './targets'

/** The KPI figures the book produces, read through the same repository the
 *  scorecards read — one line per role, metric and month, seeded holders side
 *  by side (and the real head of sales, who accepts most deals). Reads only.
 *  A dash is "no row": a tally reads it as 0, a share or median as no data. */

function shown(def: KpiMetricDef, v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  if (def.unit === 'ratio') return `${Math.round(v * 1000) / 10}%`
  if (def.unit === 'hours' || def.unit === 'days') return (Math.round(v * 10) / 10).toString()
  return Math.round(v).toLocaleString('vi-VN')
}

export async function report(db: Db, say: (line: string) => void): Promise<void> {
  const repo = new KpiReadingsRepository(db)
  const { catalog } = catalogOf(await db.select().from(kpiRoleMetric))
  for (const period of PERIODS) {
    say(`\n### ${period}`)
    for (const role of RoleId.options) {
      const holders = PEOPLE.filter((p) => p.roleIds.includes(role)).map((p) => ({
        id: p.id,
        label: p.name.slice(TAG.length),
      }))
      if (role === 'head-of-sales') holders.push({ id: HEAD, label: 'Grace (thật)' })
      const seats = catalog[role].map((def) => ({ role, def }))
      const values = await repo.values(
        seats,
        spansOf(period).current,
        holders.map((h) => h.id),
      )
      for (const seat of seats) {
        const cells =
          seat.def.scope === 'room'
            ? `cả phòng = ${shown(seat.def, values.get(valueKey(seat, '')))}`
            : holders
                .map((h) => `${h.label} = ${shown(seat.def, values.get(valueKey(seat, h.id)))}`)
                .join(' · ')
        say(`  ${role.padEnd(18)} ${seat.def.key.padEnd(26)} ${cells}`)
      }
    }
  }
}
