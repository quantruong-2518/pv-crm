import { z } from 'zod'
import { KpiMetricKey, type KpiMetricDef, type RoleId } from '@pv/contracts'
import { catalogDef, type KpiCatalog } from './kpi-config.overlay'
import type { ScoreSettings } from './kpi-score'

/** The score basis frozen at close (ADR 0158): the catalog's metrics and the grade bands the
 *  month was judged by, so a later config change cannot move a closed month's grade. */

export const KpiScoreBasis = z.object({
  roles: z.record(
    z.string(),
    z.array(z.object({ key: KpiMetricKey, enabled: z.boolean(), primary: z.boolean() })),
  ),
  bands: z.object({ a: z.number(), b: z.number(), c: z.number() }),
})
export type KpiScoreBasis = z.infer<typeof KpiScoreBasis>

export function scoreBasisOf(catalog: KpiCatalog, s: ScoreSettings): KpiScoreBasis {
  return {
    roles: Object.fromEntries(
      Object.entries(catalog).map(([role, defs]) => [
        role,
        defs.map((d) => ({ key: d.key, enabled: true, primary: d.primary })),
      ]),
    ),
    bands: { a: s.gradeA, b: s.gradeB, c: s.gradeC },
  }
}

/** The frozen catalog as the calculator reads one role's lines; a key the code no longer has is dropped. */
export function basisDefs(basis: KpiScoreBasis, role: RoleId): KpiMetricDef[] {
  return (basis.roles[role] ?? []).flatMap((m) => {
    const def = m.enabled ? catalogDef(role, m.key) : undefined
    return def ? [{ ...def, primary: m.primary }] : []
  })
}

export const settingsOfBasis = (b: KpiScoreBasis): ScoreSettings => ({
  gradeA: b.bands.a,
  gradeB: b.bands.b,
  gradeC: b.bands.c,
})
