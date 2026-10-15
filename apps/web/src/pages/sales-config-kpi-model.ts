import {
  KpiLayer,
  KpiMetricKey,
  KpiRoleMetricsPatch,
  type KpiRoleMetric,
  type KpiRoleMetricsResponse,
} from '@pv/contracts'

/** The KPI matrix's logic: what one cell holds, what a press turns it into,
 *  and whether a role's edited column may be sent. No render, no fetch.
 *
 *  A cell has three states, so "primary but switched off" cannot be typed; the
 *  one rule left to break is "exactly one primary per role", and the sentence
 *  for it is the contract's own (`KpiRoleMetricsPatch`). */

export type CellState = 'primary' | 'on' | 'off'

export const CELL_LABEL: Record<CellState, string> = {
  primary: 'Chỉ số chính',
  on: 'Có tính',
  off: 'Không tính',
}

/** One press moves a cell one step round: counted → not counted → primary → counted. */
export const NEXT_STATE: Record<CellState, CellState> = { on: 'off', off: 'primary', primary: 'on' }

export const stateOf = (m: Pick<KpiRoleMetric, 'enabled' | 'primary'>): CellState =>
  !m.enabled ? 'off' : m.primary ? 'primary' : 'on'

export type RoleEntry = KpiRoleMetricsResponse['roles'][number]
export type RoleDraft = Partial<Record<KpiMetricKey, CellState>>

/** Every metric any role carries, grouped by layer, in the contract's order.
 *  Read off the response, so the rows are exactly what the server can set. */
export function rowsOf(roles: readonly RoleEntry[]): { layer: KpiLayer; keys: KpiMetricKey[] }[] {
  const layerOf = new Map(roles.flatMap((r) => r.metrics.map((m) => [m.metricKey, m.layer])))
  return KpiLayer.options.flatMap((layer) => {
    const keys = KpiMetricKey.options.filter((k) => layerOf.get(k) === layer)
    return keys.length > 0 ? [{ layer, keys }] : []
  })
}

export type RoleCheck = {
  cells: Map<KpiMetricKey, CellState>
  /** Cells whose state differs from the stored one. */
  changed: Set<KpiMetricKey>
  /** Ready to send; null while the column breaks a rule. */
  body: KpiRoleMetricsPatch | null
  problem: string | null
  /** Primary cells in a column with more than one. */
  clashes: Set<KpiMetricKey>
}

export function checkRole(entry: RoleEntry, draft: RoleDraft): RoleCheck {
  const cells = new Map(entry.metrics.map((m) => [m.metricKey, draft[m.metricKey] ?? stateOf(m)]))
  const changed = new Set(
    entry.metrics.filter((m) => cells.get(m.metricKey) !== stateOf(m)).map((m) => m.metricKey),
  )
  const parsed = KpiRoleMetricsPatch.safeParse({
    role: entry.role,
    metrics: [...cells].map(([metricKey, state]) => ({
      metricKey,
      enabled: state !== 'off',
      primary: state === 'primary',
    })),
  })
  const primaries = [...cells].filter(([, s]) => s === 'primary').map(([k]) => k)
  return {
    cells,
    changed,
    body: parsed.success ? parsed.data : null,
    problem: parsed.success ? null : (parsed.error.issues[0]?.message ?? null),
    clashes: new Set(primaries.length > 1 ? primaries : []),
  }
}
