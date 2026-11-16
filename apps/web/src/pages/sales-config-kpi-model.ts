import {
  KPI_FUNNEL,
  KpiLayer,
  KpiMetricKey,
  KpiRoleMetricsPatch,
  isKpiV2Period,
  stepSalesPeriod,
  type KpiFunnelStep,
  type KpiPeriodKey,
  type KpiRoleMetric,
  type KpiRoleMetricsResponse,
} from '@pv/contracts'
import { message, translate, type Message } from '@/app/i18n'

/** The KPI matrix's logic: what one cell holds, what a press turns it into,
 *  and whether a role's edited column may be sent. No render, no fetch.
 *
 *  A cell has three states, so "primary but switched off" cannot be typed; the
 *  rules left to break (one primary, weights summing 100) are worded by the
 *  contract's own `KpiRoleMetricsPatch`. Weights and step targets ride in the
 *  same patch and only count from `KPI_V2_FROM` (ADR 0160 §6–7). */

export type CellState = 'primary' | 'on' | 'off'

export const CELL_LABEL: Record<CellState, Message> = {
  primary: message('Chỉ số chính', 'Primary metric', '핵심 지표'),
  on: message('Có tính', 'Counted', '반영'),
  off: message('Không tính', 'Not counted', '미반영'),
}

/** One press moves a cell one step round: counted → not counted → primary → counted. */
export const NEXT_STATE: Record<CellState, CellState> = { on: 'off', off: 'primary', primary: 'on' }

export const stateOf = (m: Pick<KpiRoleMetric, 'enabled' | 'primary'>): CellState =>
  !m.enabled ? 'off' : m.primary ? 'primary' : 'on'

export type RoleEntry = KpiRoleMetricsResponse['roles'][number]

/** Typed text, not numbers: a half-typed box must not snap back. */
export type RoleDraft = {
  cells?: Partial<Record<KpiMetricKey, CellState>>
  weights?: Partial<Record<KpiMetricKey, string>>
  funnel?: Partial<Record<KpiFunnelStep, string>>
}

/** Every metric any role carries, grouped by layer, in the contract's order.
 *  Read off the response, so the rows are exactly what the server can set. */
export function rowsOf(roles: readonly RoleEntry[]): { layer: KpiLayer; keys: KpiMetricKey[] }[] {
  const layerOf = new Map(roles.flatMap((r) => r.metrics.map((m) => [m.metricKey, m.layer])))
  return KpiLayer.options.flatMap((layer) => {
    const keys = KpiMetricKey.options.filter((k) => layerOf.get(k) === layer)
    return keys.length > 0 ? [{ layer, keys }] : []
  })
}

/** `count` consecutive months, `first` included. */
export function monthsFrom(first: KpiPeriodKey, count: number): KpiPeriodKey[] {
  const months = [first]
  while (months.length < count) months.push(stepSalesPeriod(months[months.length - 1] ?? first, 1))
  return months
}

/** The steps any role draws a target for, in the order the roles list them. */
export function funnelRowsOf(roles: readonly RoleEntry[]): KpiFunnelStep[] {
  return [...new Set(roles.flatMap((r) => KPI_FUNNEL[r.role].rated))]
}

/** ADR 0160 §6: with no weights the primary carries half and the rest share the other half. */
const PRIMARY_SHARE = 50

const WEIGHT_WORDS = message(
  'Trọng số là số nguyên từ 0 đến 100.',
  'A weight is a whole number from 0 to 100.',
  '가중치는 0에서 100 사이의 정수입니다.',
)
const FUNNEL_WORDS = message(
  'Mục tiêu bước là số từ 0 đến 100%.',
  'A step target is a number from 0 to 100%.',
  '단계 목표는 0에서 100% 사이의 숫자입니다.',
)

/** Digits only; anything else is NaN, which the check below words. */
const wholePercent = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : Number.NaN)

/** Up to two decimals, as basis points: 33,33% is 3333. */
function toBasisPoints(text: string): number {
  const clean = text.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return Number.NaN
  const bp = Math.round(Number(clean) * 100)
  return bp <= 10000 ? bp : Number.NaN
}

const fromBasisPoints = (bp: number) => String(bp / 100)

export type RoleCheck = {
  /** Weights and step targets only exist from `KPI_V2_FROM`. */
  weighable: boolean
  cells: Map<KpiMetricKey, CellState>
  /** Cells whose state differs from the stored one. */
  changed: Set<KpiMetricKey>
  weights: Map<KpiMetricKey, string>
  /** The default split, shown while a box is empty. */
  placeholders: Map<KpiMetricKey, string>
  /** Sum of the typed weights; null while none is typed. */
  total: number | null
  funnel: Map<KpiFunnelStep, string>
  weightsChanged: boolean
  funnelChanged: boolean
  /** Anything differs from what is stored. */
  dirty: boolean
  /** Ready to send; null while the column breaks a rule. */
  body: KpiRoleMetricsPatch | null
  problem: string | null
  /** Primary cells in a column with more than one. */
  clashes: Set<KpiMetricKey>
}

function defaultSplit(cells: Map<KpiMetricKey, CellState>): Map<KpiMetricKey, string> {
  const on = [...cells].filter(([, s]) => s !== 'off')
  const share = on.length > 1 ? Math.round(PRIMARY_SHARE / (on.length - 1)) : 0
  return new Map(
    on.map(([k, s]) => [
      k,
      String(on.length === 1 ? 100 : s === 'primary' ? PRIMARY_SHARE : share),
    ]),
  )
}

const sameMap = (a: Map<string, number>, b: Map<string, number>) =>
  a.size === b.size && [...a].every(([k, v]) => b.get(k) === v)

export function checkRole(entry: RoleEntry, draft: RoleDraft, from: KpiPeriodKey): RoleCheck {
  const weighable = isKpiV2Period(from)
  const cells = new Map(
    entry.metrics.map((m) => [m.metricKey, draft.cells?.[m.metricKey] ?? stateOf(m)]),
  )
  const changed = new Set(
    entry.metrics.filter((m) => cells.get(m.metricKey) !== stateOf(m)).map((m) => m.metricKey),
  )
  const stored = new Map(entry.metrics.map((m) => [m.metricKey, m]))
  const weights = new Map(
    [...cells]
      .filter(([, state]) => weighable && state !== 'off')
      .map(([k]) => [k, draft.weights?.[k] ?? String(stored.get(k)?.weight ?? '')]),
  )
  const typedWeights = [...weights].filter(([, text]) => text.trim() !== '')
  const parsedWeights = new Map(typedWeights.map(([k, text]) => [k, wholePercent(text)]))
  const weightWords = [...parsedWeights.values()].some((n) => !(n >= 0 && n <= 100))
  const storedWeights = new Map(
    entry.metrics.flatMap((m) =>
      weighable && m.enabled && m.weight !== null ? [[m.metricKey, m.weight] as const] : [],
    ),
  )

  const rated = weighable ? KPI_FUNNEL[entry.role].rated : []
  const funnel = new Map(
    rated.map((step) => {
      const bp = entry.funnel.find((f) => f.step === step)?.targetBp
      return [step, draft.funnel?.[step] ?? (bp === undefined ? '' : fromBasisPoints(bp))]
    }),
  )
  const typedFunnel = [...funnel].filter(([, text]) => text.trim() !== '')
  const funnelTargets = typedFunnel.map(([step, text]) => ({ step, targetBp: toBasisPoints(text) }))
  const funnelWords = funnelTargets.some((f) => Number.isNaN(f.targetBp))
  const storedFunnel = new Map(weighable ? entry.funnel.map((f) => [f.step, f.targetBp]) : [])

  const weightsChanged = !sameMap(parsedWeights, storedWeights)
  const funnelChanged = !sameMap(
    new Map(funnelTargets.map((f) => [f.step, f.targetBp])),
    storedFunnel,
  )

  const parsed = KpiRoleMetricsPatch.safeParse({
    role: entry.role,
    from,
    metrics: [...cells].map(([metricKey, state]) => ({
      metricKey,
      enabled: state !== 'off',
      primary: state === 'primary',
      ...(parsedWeights.has(metricKey) ? { weight: parsedWeights.get(metricKey) } : {}),
    })),
    ...(funnelTargets.length > 0 ? { funnel: funnelTargets } : {}),
  })
  const words = weightWords ? translate(WEIGHT_WORDS) : funnelWords ? translate(FUNNEL_WORDS) : null
  const primaries = [...cells].filter(([, s]) => s === 'primary').map(([k]) => k)
  return {
    weighable,
    cells,
    changed,
    weights,
    placeholders: defaultSplit(cells),
    total:
      parsedWeights.size > 0 && !weightWords
        ? [...parsedWeights.values()].reduce((a, n) => a + n, 0)
        : null,
    funnel,
    weightsChanged,
    funnelChanged,
    dirty: changed.size > 0 || weightsChanged || funnelChanged,
    body: parsed.success && !words ? parsed.data : null,
    problem: words ?? (parsed.success ? null : (parsed.error.issues[0]?.message ?? null)),
    clashes: new Set(primaries.length > 1 ? primaries : []),
  }
}
