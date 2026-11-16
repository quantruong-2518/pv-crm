import { z } from 'zod'
import { KpiMetricKey, type KpiPeriodKey, type RoleId } from '@pv/contracts'
import { catalogDef, type KpiCatalog, type KpiCatalogDef } from './kpi-config.overlay'
import type { ScoreSettings } from './kpi-score'

/** The score basis frozen at close (ADR 0158): the catalog's metrics, their weights (ADR 0160
 *  §6) and the grade bands the month was judged by, so a later config change cannot move a
 *  closed month's grade. `weight` is absent on a v1 month and on a basis frozen before it. */

export const KpiScoreBasis = z.object({
  roles: z.record(
    z.string(),
    z.array(
      z.object({
        key: KpiMetricKey,
        enabled: z.boolean(),
        primary: z.boolean(),
        weight: z.number().optional(),
      }),
    ),
  ),
  bands: z.object({ a: z.number(), b: z.number(), c: z.number() }),
})
export type KpiScoreBasis = z.infer<typeof KpiScoreBasis>

export function scoreBasisOf(catalog: KpiCatalog, s: ScoreSettings): KpiScoreBasis {
  return {
    roles: Object.fromEntries(
      Object.entries(catalog).map(([role, defs]) => [
        role,
        defs.map((d) => ({ key: d.key, enabled: true, primary: d.primary, weight: d.weight })),
      ]),
    ),
    bands: { a: s.gradeA, b: s.gradeB, c: s.gradeC },
  }
}

/** The frozen catalog as the calculator reads one role's lines, traits from the closed
 *  month's own catalog; a key the code no longer has is dropped. */
export function basisDefs(
  basis: KpiScoreBasis,
  period: KpiPeriodKey,
  role: RoleId,
): KpiCatalogDef[] {
  return (basis.roles[role] ?? []).flatMap((m) => {
    const def = m.enabled ? catalogDef(period, role, m.key) : undefined
    return def ? [{ ...def, primary: m.primary, weight: m.weight }] : []
  })
}

export const settingsOfBasis = (b: KpiScoreBasis): ScoreSettings => ({
  gradeA: b.bands.a,
  gradeB: b.bands.b,
  gradeC: b.bands.c,
})
