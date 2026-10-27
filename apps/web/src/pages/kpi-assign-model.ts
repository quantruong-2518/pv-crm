import {
  KpiAssignmentDraftBody,
  TIERED_FROM,
  kpiAssignmentSum,
  kpiMetricShare,
  vnDayOf,
  type KpiAssignmentChild,
  type KpiAssignmentPageResponse,
  type KpiAssignmentPersonState,
  type KpiAssignmentSum,
  type KpiAssignmentUnitState,
  type KpiMetricDef,
  type KpiMetricKey,
  type OrgUnitKind,
  type RoleId,
} from '@pv/contracts'
import { dm } from '@/lib/date'
import { typedOf } from './kpi-allocate-model'
import { MONTH_PARAM, parseTyped, printValue } from './kpi-model'

/** Calculation behind the tiered screens (ADR 0120): addresses, deadline
 *  words, state labels, the draft body built from typed fields, and the sums
 *  as they stand while typing. No render, no fetch. The server still judges
 *  every send; the live sums only say early what it will answer. */

export const ASSIGN_PATH = '/sales/kpi/assign'
export const STATUS_PATH = '/sales/kpi/assign/status'
export const ROLE_PARAM = 'role'
export const UNIT_PARAM = 'unit'

export const assignHref = (period: string, role?: RoleId, unitId?: string) => {
  const q = new URLSearchParams({ [MONTH_PARAM]: period })
  if (role) q.set(ROLE_PARAM, role)
  if (unitId) q.set(UNIT_PARAM, unitId)
  return `${ASSIGN_PATH}?${q.toString()}`
}

export const statusHref = (period: string, role?: RoleId) =>
  `${STATUS_PATH}?${new URLSearchParams({ [MONTH_PARAM]: period, ...(role && { [ROLE_PARAM]: role }) }).toString()}`

/** Said wherever a month before the cutover meets a tiered door, or the reverse. */
export const TIERED_SENTENCE = `Giao chỉ tiêu theo phòng ban và nhóm bắt đầu từ tháng ${Number(TIERED_FROM.slice(5))}/${TIERED_FROM.slice(0, 4)}.`

export const KIND_WORD: Record<OrgUnitKind, string> = {
  company: 'Công ty',
  department: 'Phòng',
  team: 'Nhóm',
}

type Tone = 'draft' | 'warning' | 'success' | 'running'
export type Label = { text: string; tone: Tone }

export const UNIT_STATE_LABEL: Record<KpiAssignmentUnitState, Label> = {
  'not-sent': { text: 'Chưa gửi', tone: 'draft' },
  sent: { text: 'Đã gửi', tone: 'success' },
  'sent-by-default': { text: 'Giao mặc định', tone: 'warning' },
}

export const PERSON_STATE_LABEL: Record<KpiAssignmentPersonState, Label> = {
  'not-sent': { text: 'Chưa giao', tone: 'draft' },
  pending: { text: 'Chờ xác nhận', tone: 'running' },
  confirmed: { text: 'Đã xác nhận', tone: 'success' },
  defaulted: { text: 'Mặc định nhận', tone: 'warning' },
}

const DAY_MS = 86_400_000

/** Whole Vietnam days from today to `day`; negative once it has passed. */
export const daysUntil = (day: string, now = new Date()) =>
  Math.round((Date.parse(day) - Date.parse(vnDayOf(now))) / DAY_MS)

/** The days-left tail of a deadline chip; `null` once the day has passed. */
export function leftText(day: string, now = new Date()): string | null {
  const left = daysUntil(day, now)
  if (left < 0) return null
  return left === 0 ? 'hôm nay' : `còn ${left} ngày`
}

/** The one chip that says where this unit's own set stands. On a closed month
 *  only a sent set is said: the deadline and an unsent edit no longer apply. */
export function setChip(page: KpiAssignmentPageResponse, closed: boolean): Label | null {
  const { set, deadline, inForceVersion } = page
  if (set?.status === 'sent') {
    const at = set.sentAt ? ` ${dm(set.sentAt)}` : ''
    return set.byDefault
      ? { text: `Giao mặc định${at}`, tone: 'warning' }
      : { text: `Đã gửi${at}`, tone: 'success' }
  }
  if (closed) return null
  if (inForceVersion !== null) return { text: 'Có bản sửa chưa gửi', tone: 'running' }
  const left = leftText(deadline)
  if (left === null) return { text: `Quá hạn gửi ${dm(deadline)}`, tone: 'warning' }
  return { text: `Hạn gửi ${dm(deadline)} · ${left}`, tone: 'draft' }
}

/** A target as a person reads it: a lower-is-better one is a ceiling. */
export const printTarget = (def: KpiMetricDef, value: number) =>
  `${def.higherIsBetter ? '' : 'Tối đa '}${printValue(def.unit, value, true)}`

// ---------------------------------------------------------------------------
// FIELDS — one key per typed figure
// ---------------------------------------------------------------------------

export const childId = (c: KpiAssignmentChild) => (c.kind === 'unit' ? c.unit.id : c.person.actorId)

export const cellKey = (kind: 'total' | 'unit' | 'person', id: string, metric: KpiMetricKey) =>
  `${kind}|${id}|${metric}`

export const keyOfChild = (c: KpiAssignmentChild, metric: KpiMetricKey) =>
  cellKey(c.kind, childId(c), metric)

/** The saved figure of each line of the set on screen, by field key. */
export function savedValues(page: KpiAssignmentPageResponse): Map<string, number> {
  return new Map(
    (page.set?.lines ?? []).map((l) => [
      cellKey(l.kind, l.childUnitId ?? l.personId ?? '', l.metricKey),
      l.value,
    ]),
  )
}

export type Fields = {
  textOf: (key: string, def: KpiMetricDef) => string
  dirty: boolean
}

/** Typed text over the saved figure. */
export function fieldsOf(
  saved: ReadonlyMap<string, number>,
  edits: Readonly<Record<string, string>>,
): Fields {
  return {
    textOf: (key, def) => {
      if (key in edits) return edits[key]!
      const value = saved.get(key)
      return value === undefined ? '' : typedOf(def.unit, value)
    },
    dirty: Object.keys(edits).length > 0,
  }
}

export const additiveOf = (defs: readonly KpiMetricDef[]) =>
  defs.filter((d) => kpiMetricShare(d) === 'additive')

/** Every filled field as the draft body; `null` while one is not a number or none is filled. */
export function bodyOf(
  page: KpiAssignmentPageResponse,
  defs: readonly KpiMetricDef[],
  { textOf }: Fields,
): KpiAssignmentDraftBody | null {
  const company = page.unit.kind === 'company'
  let broken = false
  const read = (key: string, def: KpiMetricDef) => {
    const value = parseTyped(def.unit, textOf(key, def))
    if (value === null) broken = true
    return typeof value === 'number' ? value : null
  }
  const totals = company
    ? defs.flatMap((def) => {
        const value = read(cellKey('total', '', def.key), def)
        return value === null ? [] : [{ kind: 'total' as const, metricKey: def.key, value }]
      })
    : []
  const lines = page.children.flatMap((c) =>
    additiveOf(defs).flatMap((def): KpiAssignmentDraftBody['lines'] => {
      const value = read(keyOfChild(c, def.key), def)
      if (value === null) return []
      return c.kind === 'unit'
        ? [{ kind: 'unit' as const, metricKey: def.key, childUnitId: c.unit.id, value }]
        : [{ kind: 'person' as const, metricKey: def.key, personId: c.person.actorId, value }]
    }),
  )
  const body = KpiAssignmentDraftBody.safeParse({
    unitId: page.unit.id,
    lines: [...totals, ...lines],
  })
  return broken || !body.success ? null : body.data
}

/** The server's sums, redone over what is typed with the contract's rule. */
export function liveSums(
  page: KpiAssignmentPageResponse,
  defs: readonly KpiMetricDef[],
  { textOf }: Fields,
): KpiAssignmentSum[] {
  const company = page.unit.kind === 'company'
  const valueOf = (key: string, def: KpiMetricDef) => {
    const value = parseTyped(def.unit, textOf(key, def))
    return typeof value === 'number' ? value : 0
  }
  return page.sums.flatMap((s) => {
    const def = defs.find((d) => d.key === s.metricKey)
    if (!def) return []
    const received = company ? valueOf(cellKey('total', '', def.key), def) : s.received
    const assigned = page.children.reduce((n, c) => n + valueOf(keyOfChild(c, def.key), def), 0)
    return [kpiAssignmentSum(s.metricKey, received, assigned)]
  })
}

/** What the sum row says under its figures. */
export function sumWord(def: KpiMetricDef, s: KpiAssignmentSum): Label {
  if (s.flag === 'below')
    return { text: `Thiếu ${printValue(def.unit, s.received - s.assigned, true)}`, tone: 'warning' }
  if (s.flag === 'over' && s.ratio !== null)
    return { text: `Vượt ${Math.round(s.ratio * 100)}%`, tone: 'running' }
  return { text: 'Đủ', tone: 'success' }
}
