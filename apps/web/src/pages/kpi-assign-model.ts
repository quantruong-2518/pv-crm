import {
  KpiAssignmentDraftBody,
  TIERED_FROM,
  kpiAssignmentSum,
  kpiMetricShare,
  vnDayOf,
  type KpiAssignmentActual,
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
import { getLang, message, translate, type Message } from '@/app/i18n'
import { kpiMetricText } from '@/data/kpi-i18n'
import { labelled, typedOf } from './kpi-allocate-model'
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
const TIERED_MONTH = `${Number(TIERED_FROM.slice(5))}/${TIERED_FROM.slice(0, 4)}`
export const TIERED_SENTENCE = message(
  `Giao chỉ tiêu theo phòng ban và nhóm bắt đầu từ tháng ${TIERED_MONTH}.`,
  `Targets are assigned by department and team starting from month ${TIERED_MONTH}.`,
  `${TIERED_FROM.slice(0, 4)}년 ${Number(TIERED_FROM.slice(5))}월부터 부서와 팀 단위로 목표를 배정합니다.`,
)

/** Copied lines always carry the company's level, whichever unit hands them on. */
export const COPIED_WORD = message(
  'Áp chung cho cả công ty',
  'Applied company-wide',
  '회사 전체에 동일 적용',
)

export const KIND_WORD: Record<OrgUnitKind, Message> = {
  company: message('Công ty', 'Company', '회사'),
  department: message('Phòng', 'Department', '부서'),
  team: message('Nhóm', 'Team', '팀'),
}

type Tone = 'draft' | 'warning' | 'success' | 'running'
export type Label = { text: string; tone: Tone }

const SENT = message('Đã gửi', 'Sent', '발송됨')
const BY_DEFAULT = message('Giao mặc định', 'Assigned by default', '기본값으로 배정')

export const UNIT_STATE_LABEL: Record<KpiAssignmentUnitState, Label> = {
  'not-sent': labelled(() => translate(message('Chưa gửi', 'Not sent', '미발송')), 'draft'),
  sent: labelled(() => translate(SENT), 'success'),
  'sent-by-default': labelled(() => translate(BY_DEFAULT), 'warning'),
}

export const PERSON_STATE_LABEL: Record<KpiAssignmentPersonState, Label> = {
  'not-sent': labelled(() => translate(message('Chưa giao', 'Not assigned', '미배정')), 'draft'),
  pending: labelled(
    () => translate(message('Chờ xác nhận', 'Awaiting confirmation', '확인 대기')),
    'running',
  ),
  confirmed: labelled(() => translate(message('Đã xác nhận', 'Confirmed', '확인됨')), 'success'),
  defaulted: labelled(
    () => translate(message('Nhận mặc định', 'Default applied', '기본값 적용')),
    'warning',
  ),
}

const DAY_MS = 86_400_000

/** Whole Vietnam days from today to `day`; negative once it has passed. */
export const daysUntil = (day: string, now = new Date()) =>
  Math.round((Date.parse(day) - Date.parse(vnDayOf(now))) / DAY_MS)

/** The days-left tail of a deadline chip; `null` once the day has passed. */
export function leftText(day: string, now = new Date()): string | null {
  const left = daysUntil(day, now)
  if (left < 0) return null
  return translate(
    left === 0
      ? message('hôm nay', 'today', '오늘')
      : message(
          `còn ${left} ngày`,
          `${left} ${left === 1 ? 'day' : 'days'} left`,
          `${left}일 남음`,
        ),
  )
}

/** The one chip that says where this unit's own set stands. On a closed month
 *  only a sent set is said: the deadline and an unsent edit no longer apply. */
export function setChip(page: KpiAssignmentPageResponse, closed: boolean): Label | null {
  const { set, deadline, inForceVersion } = page
  if (set?.status === 'sent') {
    const at = set.sentAt ? ` ${dm(set.sentAt)}` : ''
    return set.byDefault
      ? { text: `${translate(BY_DEFAULT)}${at}`, tone: 'warning' }
      : { text: `${translate(SENT)}${at}`, tone: 'success' }
  }
  if (closed) return null
  if (inForceVersion !== null) {
    const text = message('Có bản sửa chưa gửi', 'Unsent revision', '미발송 수정본 있음')
    return { text: translate(text), tone: 'running' }
  }
  const left = leftText(deadline)
  const day = dm(deadline)
  if (left === null) {
    const text = message(`Quá hạn gửi ${day}`, `Send overdue since ${day}`, `${day} 발송 기한 초과`)
    return { text: translate(text), tone: 'warning' }
  }
  const text = message(
    `Hạn gửi ${day} · ${left}`,
    `Send by ${day} · ${left}`,
    `발송 기한 ${day} · ${left}`,
  )
  return { text: translate(text), tone: 'draft' }
}

/** The month of a period as a label, for a screen naming which month a figure is. */
export const monthWord = (period: string) => {
  const month = Number(period.slice(5))
  return translate(message(`Tháng ${month}`, `Month ${month}`, `${month}월`))
}

/** ValueCell's last-month props. No finished month or no figure prints nothing. */
export function lastReading(
  period: string | null,
  actuals: readonly KpiAssignmentActual[],
  metric: KpiMetricKey,
) {
  const value = actuals.find((a) => a.metricKey === metric)?.value
  return period && value !== undefined
    ? { last: value, lastLabel: monthWord(period) }
    : { last: null }
}

/** A target as a person reads it: a lower-is-better one is a ceiling. */
export const printTarget = (def: KpiMetricDef, value: number) =>
  `${def.higherIsBetter ? '' : `${translate(message('Tối đa', 'Max', '최대'))} `}${printValue(def.unit, value, true)}`

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

/** What the sums stand against: the company has nothing above it, so its card's own name. */
export const receivedWord = (page: KpiAssignmentPageResponse) =>
  translate(
    page.unit.kind === 'company'
      ? message('chỉ tiêu công ty', 'company target', '회사 목표')
      : message('mức nhận', 'received target', '수령 목표'),
  )

/** One wording for the dialog title and the toast line. */
export const overTitle = (page: KpiAssignmentPageResponse) => {
  const word = receivedWord(page)
  return translate(
    message(
      `Tổng giao vượt ${word}`,
      `Assigned total exceeds the ${word}`,
      `배정 합계가 ${word}을(를) 초과했습니다`,
    ),
  )
}

/** The toast's second line: over metrics the server named and the dialog did not list,
 *  because the sums on screen were stale. Listed ones were already answered. */
export function lateOver(
  page: KpiAssignmentPageResponse,
  warnings: readonly KpiAssignmentSum[],
  sums: readonly KpiAssignmentSum[],
): string | undefined {
  const listed = new Set(sums.filter((s) => s.flag === 'over').map((s) => s.metricKey))
  const late = warnings.filter((w) => !listed.has(w.metricKey))
  if (late.length === 0) return undefined
  const lang = getLang()
  return `${overTitle(page)}: ${late.map((w) => kpiMetricText(w.metricKey, lang)).join(', ')}`
}

/** Assigned over received, one wording for the sum row and the over dialog. */
export const sumFigures = (def: KpiMetricDef, s: KpiAssignmentSum) =>
  `${printValue(def.unit, s.assigned, true)} / ${printValue(def.unit, s.received, true)}`

/** What the sum row says under its figures. Over states the excess, not the share. */
export function sumWord(
  page: KpiAssignmentPageResponse,
  def: KpiMetricDef,
  s: KpiAssignmentSum,
): Label {
  /* Nothing to measure against, so `0 / 0` is not a met target. */
  if (s.received === 0) {
    const word = receivedWord(page)
    const text = message(`Chưa có ${word}`, `No ${word} yet`, `${word} 없음`)
    return { text: translate(text), tone: 'draft' }
  }
  if (s.flag === 'below') {
    const gap = printValue(def.unit, s.received - s.assigned, true)
    return {
      text: translate(message(`Thiếu ${gap}`, `Short ${gap}`, `${gap} 부족`)),
      tone: 'warning',
    }
  }
  if (s.flag === 'over' && s.ratio !== null) {
    const pct = Math.round((s.ratio - 1) * 100)
    return {
      text: translate(message(`Vượt ${pct}%`, `Over ${pct}%`, `${pct}% 초과`)),
      tone: 'running',
    }
  }
  return { text: translate(message('Đủ', 'Complete', '충족')), tone: 'success' }
}
