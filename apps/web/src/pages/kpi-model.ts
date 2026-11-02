import { useSearchParams } from 'react-router-dom'
import { PlusMinus, billions, millions } from '@pv/ui'
import {
  KpiLayer,
  KpiPeriodKey,
  RoleId,
  type KpiAdjustmentCause,
  type KpiContribution,
  type KpiContributionKind,
  type KpiMetricDef,
  type KpiPerson,
  type KpiReading,
  type KpiScorecard,
  type KpiUnit,
  type KpiVerdict,
} from '@pv/contracts'
import { primaryOf, type KpiCatalog } from '@/data/kpi-catalog'
import { kpiVerdictText } from '@/data/kpi-i18n'
import { dmhm } from '@/lib/date'
import {
  formatCurrency,
  formatNumber,
  getLang,
  message,
  translate,
  type Lang,
  type Message,
} from '@/app/i18n'
import { VN_OFFSET_MS, currentPick, keyOf, num, stepPick, type PeriodPick } from './home-model'

/** Calculation behind the KPI screens: how a reading prints, what is
 *  missing against pace, who needs attention, and what a role adds up to.
 *  No render and no fetch, except the router hook `useMonthParam`: react-refresh
 *  forbids exporting it from a component file. The catalog arrives as an argument.
 *
 *  Nothing here judges a figure. The verdict is the server's; this file only
 *  formats it, and subtracts two numbers the server sent to say how far off
 *  a `behind` reading is. */

/** The personal screen opens on what a verdict is measured against. The
 *  company screen prints the day of the month instead, its figures speak first. */
export const DESCRIPTION = message(
  'Số tự tính, cập nhật mỗi lần mở. Trạng thái so với mức cần đạt đến hôm nay. Chỉ số tỷ lệ và thời gian so với chỉ tiêu cả tháng.',
  'Track your monthly performance against assigned targets.',
  '월간 실적과 배정된 목표를 확인하세요.',
)

/** KPI is agreed per month, so the overview's picker is pinned to that grain. */
export const monthPick = (): PeriodPick => ({ ...currentPick(), grain: 'month' })

/** The one name every KPI address carries its month under, so a screen
 *  opened from another lands on the month it was opened from. */
export const MONTH_PARAM = 'month'

export function pickFromUrl(month: string | null): PeriodPick {
  const pick = monthPick()
  return month && KpiPeriodKey.safeParse(month).success ? { ...pick, month } : pick
}

/** The month a KPI screen reads, kept in the address so a bell link or a hop
 *  between screens lands on the same month; other params survive a pick. */
export function useMonthParam(): [PeriodPick, (p: PeriodPick) => void] {
  const [params, setParams] = useSearchParams()
  const pick = pickFromUrl(params.get(MONTH_PARAM))
  const setPick = (p: PeriodPick) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set(MONTH_PARAM, keyOf(p))
        return next
      },
      { replace: true },
    )
  return [pick, setPick]
}

export const COMPANY_PATH = '/sales/kpi/company'
export const ME_PATH = '/sales/kpi/me'

export const personHref = (actorId: string, period: string) =>
  `${COMPANY_PATH}/${encodeURIComponent(actorId)}?${MONTH_PARAM}=${period}`

const monthAfter = (key: string) => {
  const year = Number(key.slice(0, 4))
  const month = Number(key.slice(5))
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
}

/** The month is over in Vietnam time: only then may a head close it. */
export const monthEnded = (period: string, today = new Date()) => period < currentPick(today).month

/** The month as a sentence prints it: `9`, or `9/2025` once the year is not
 *  the current one, so an old month is never read as this year's. */
export function monthText(period: string, today = new Date()): string {
  const month = Number(period.slice(5))
  return period.slice(0, 4) === currentPick(today).month.slice(0, 4)
    ? String(month)
    : `${month}/${period.slice(0, 4)}`
}

/** Once per screen on a closed month whose lists and weekly series read the copy
 *  frozen at close; later changes land in the running month (ADR 0115). */
export const FROZEN_NOTE = message(
  'Theo số lúc chốt. Thay đổi sau đó tính vào tháng đang chạy.',
  'Figures as of the close. Later changes count toward the running month.',
  '마감 시점의 수치입니다. 이후 변경은 진행 중인 달에 반영됩니다.',
)

/** The month as a phrase in the reader's language: vi "month 9", en "month 9/2025", ko year and month. */
export function monthWord(period: string, today = new Date()): string {
  const month = Number(period.slice(5))
  const year = period.slice(0, 4)
  const text = monthText(period, today)
  return translate(
    message(
      `tháng ${text}`,
      `month ${text}`,
      text === String(month) ? `${month}월` : `${year}년 ${month}월`,
    ),
  )
}

/** Day of month over days in month, for the running month only: in any other
 *  month today is not inside it, so the line is left out. */
export function dayOfMonth(period: string, today = new Date()): string | null {
  if (period !== currentPick(today).month) return null
  const vn = new Date(today.getTime() + VN_OFFSET_MS)
  const days = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() + 1, 0)).getUTCDate()
  const day = `${vn.getUTCDate()}/${days}`
  return translate(message(`Ngày ${day}`, `Day ${day}`, `${day}일`))
}

/** `stepPick`, reaching ONE month past the running one: a month's targets are
 *  approved before it starts. The overview keeps its own bound. */
export function stepMonth(pick: PeriodPick, by: -1 | 1): PeriodPick | null {
  const running = currentPick().month
  if (by === -1 || pick.month < running) return stepPick(pick, by)
  return pick.month === running ? { ...pick, month: monthAfter(running) } : null
}

/** A reading beside the catalog row that says how to group and print it. */
export type KpiItem = { def: KpiMetricDef; reading: KpiReading }

/** Catalog order, so two screens list a role's metrics the same way. A reading
 *  whose metric is no longer in force has no row here, so it is dropped. */
export function itemsOf(
  catalog: KpiCatalog,
  role: RoleId,
  readings: readonly KpiReading[],
): KpiItem[] {
  return catalog[role].flatMap((def) =>
    readings.filter((r) => r.key === def.key).map((reading) => ({ def, reading })),
  )
}

/** The hero, then the rest by layer: activity → conversion → result → guardrail.
 *  The hero is left out of the rest so no figure is printed twice. */
export function boardOf(catalog: KpiCatalog, role: RoleId, readings: readonly KpiReading[]) {
  const items = itemsOf(catalog, role, readings)
  const hero = items.find((i) => i.def.primary)
  const rest = KpiLayer.options.flatMap((layer) =>
    items.filter((i) => i !== hero && i.def.layer === layer),
  )
  return { hero, rest }
}

// ---------------------------------------------------------------------------
// PRINTING — one rule per unit, and null is never zero
// ---------------------------------------------------------------------------

const oneDecimal = (value: number) =>
  formatNumber(value, undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const BILLION = 1_000_000_000
const UNIT_HOURS = message('giờ', 'h', '시간')
const UNIT_DAYS = message('ngày', 'days', '일')

/** `compact` is for a tile; tables print every dong. */
export function printValue(unit: KpiUnit, value: number, compact = false): string {
  if (unit === 'money') {
    if (!compact) return formatCurrency(value, 'VND')
    /* "750 tr", not "750,0 tr": the decimal says something only when it is not 0. */
    return (Math.abs(value) >= BILLION ? billions(value, 1) : millions(value)).replace(',0 ', ' ')
  }
  if (unit === 'ratio') return `${num(value * 100)}%`
  if (unit === 'hours') return `${oneDecimal(value)} ${translate(UNIT_HOURS)}`
  if (unit === 'days') return `${oneDecimal(value)} ${translate(UNIT_DAYS)}`
  return num(value)
}

export const DASH = '—'

/** A tile has room for the words; a table cell has the badge beside it. */
export const printTile = (unit: KpiUnit, value: number | null) =>
  value === null ? kpiVerdictText('no-data') : printValue(unit, value, true)

export const printCell = (unit: KpiUnit, value: number | null) =>
  value === null ? DASH : printValue(unit, value)

/** A table cell short enough to sit beside a second figure, value over target. */
export const printShort = (unit: KpiUnit, value: number | null) =>
  value === null ? DASH : printValue(unit, value, true)

// ---------------------------------------------------------------------------
// ADJUSTMENTS — a closed month's later changes, carried into the open one (ADR 0115)
// ---------------------------------------------------------------------------

/** One glyph for every adjustment, on a figure or a row, always beside words. */
export const ADJUSTMENT_ICON = PlusMinus

/** A delta always carries its sign; the minus is U+2212, the width of the plus. */
export function printSigned(unit: KpiUnit, value: number, compact = false): string {
  const sign = value > 0 ? '+' : value < 0 ? '\u2212' : ''
  return `${sign}${printValue(unit, Math.abs(value), compact)}`
}

/** `printShort` for a figure that may fall below zero: `printSigned`'s minus, no plus. */
export const printShortMinus = (unit: KpiUnit, value: number) =>
  value < 0 ? `\u2212${printShort(unit, -value)}` : printShort(unit, value)

/** How the line prints: `tile` and `cell` differ in number format only (a table
 *  prints every dong, as its figure does); `heat` is the short form for a narrow cell. */
export type AdjustmentForm = 'tile' | 'cell' | 'heat'

/** The line under a figure: what the running month took from closed months, or
 *  what a closed month reads after its own adjustments. Null when neither applies. */
export function adjustmentLine(
  unit: KpiUnit,
  { adjustedBy, afterAdjustments }: Pick<KpiReading, 'adjustedBy' | 'afterAdjustments'>,
  form: AdjustmentForm,
): string | null {
  const compact = form !== 'cell'
  if (afterAdjustments !== null) {
    const after = printValue(unit, afterAdjustments, compact)
    return translate(
      message(`Sau điều chỉnh: ${after}`, `After adjustment: ${after}`, `조정 후: ${after}`),
    )
  }
  if (adjustedBy === null) return null
  const signed = printSigned(unit, adjustedBy, compact)
  return translate(
    form === 'heat'
      ? message(`Điều chỉnh ${signed}`, `Adjusted ${signed}`, `조정 ${signed}`)
      : message(
          `Gồm điều chỉnh ${signed} từ tháng đã chốt`,
          `Includes ${signed} adjustment from a closed month`,
          `마감된 달의 조정 ${signed} 포함`,
        ),
  )
}

/* A meeting row's code cell already names the kind, so its sentence starts at the cause. */
const KIND_WORD: Record<KpiContributionKind, Message | null> = {
  lead: message('Lead', 'Lead', '리드'),
  opportunity: message('Cơ hội', 'Opportunity', '기회'),
  contract: message('Hợp đồng', 'Contract', '계약'),
  installment: message('Đợt thanh toán', 'Installment', '납부 회차'),
  meeting: null,
}

/** The cause with its source month, per language; ko puts the month first so it builds there. */
const causeClause = (cause: KpiAdjustmentCause, month: string): Record<Lang, string> =>
  ({
    appeared: message(`thêm vào tháng ${month}`, `added to month ${month}`, '추가됨'),
    vanished: message(`bị loại khỏi tháng ${month}`, `removed from month ${month}`, '제외됨'),
    changed: message(
      `đổi giá trị ở tháng ${month}`,
      `changed value in month ${month}`,
      '값 변경됨',
    ),
  })[cause]

/** What happened to an adjustment row's record: its kind, the cause, the source month. */
export function adjustmentSentence(
  kind: KpiContributionKind,
  { cause, sourcePeriod }: NonNullable<KpiContribution['adjustment']>,
): string {
  const lang = getLang()
  const kindWord = KIND_WORD[kind]
  const head = kindWord === null ? null : translate(kindWord, lang)
  const clause = causeClause(cause, monthText(sourcePeriod))[lang]
  if (lang === 'ko') return [monthWord(sourcePeriod), head, clause].filter(Boolean).join(' ')
  const sentence = head === null ? clause : `${head} ${clause}`
  return head === null ? sentence.charAt(0).toUpperCase() + sentence.slice(1) : sentence
}

/** The figure as a share of its target, unclamped, for "% done". Null for a
 *  lower-is-better metric (a share of a ceiling is not progress) and for a
 *  rate, whose own figure is already a percent. */
export function shareOf({ def, reading }: KpiItem): number | null {
  const { value, target } = reading
  if (!def.higherIsBetter || def.unit === 'ratio') return null
  if (value === null || target === null || target <= 0) return null
  return value / target
}

/** What the unit is called beside a field a manager types a target into. The
 *  words are getters so the table follows the language without callers changing. */
export const UNIT_WORD: Record<KpiUnit, string> = {
  count: '',
  money: '₫',
  ratio: '%',
  get hours() {
    return translate(UNIT_HOURS)
  },
  get days() {
    return translate(UNIT_DAYS)
  },
}

/** A typed target as the wire value: `undefined` for an empty field, `null`
 *  for text that is not a number. Vietnamese typing: a period groups
 *  thousands, a comma is the decimal mark. A ratio is typed as a percent. */
export function parseTyped(unit: KpiUnit, text: string): number | null | undefined {
  const typed = text.replace(/\s/g, '')
  if (typed === '') return undefined
  if (unit === 'count' || unit === 'money') {
    /* Periods only as full groups of three, or "1.5" would be read as 15. */
    return /^(\d+|\d{1,3}(\.\d{3})+)$/.test(typed) ? Number(typed.replace(/\./g, '')) : null
  }
  if (!/^\d+(,\d+)?$/.test(typed)) return null
  const value = Number(typed.replace(',', '.'))
  if (unit !== 'ratio') return value
  return value <= 100 ? value / 100 : null
}

// ---------------------------------------------------------------------------
// PACE — where the figure stands against its target
// ---------------------------------------------------------------------------

const clamp = (share: number) => Math.min(Math.max(share, 0), 1)

/** Shares of the target for the bar: how far the figure has come, and where
 *  pace asks it to be by today. Null for a lower-is-better metric: a bar that
 *  fills toward a ceiling reads as progress, the opposite of what it means. */
export function paceOf({ def, reading }: KpiItem): { fill: number; mark: number | null } | null {
  const { value, target, expected } = reading
  if (!def.higherIsBetter || value === null || target === null || target <= 0) return null
  return {
    fill: clamp(value / target),
    mark: def.paced && expected !== null ? clamp(expected / target) : null,
  }
}

/** One plain sentence for a `behind` reading: how much is missing. Null for
 *  every other verdict; a `missed` month is over and has no pace to catch. */
export function shortfallOf({ def, reading }: KpiItem, compact = false): string | null {
  const { value, expected, verdict } = reading
  if (verdict !== 'behind' || value === null || expected === null) return null
  const gap = def.higherIsBetter ? expected - value : value - expected
  if (gap <= 0) return null

  /* Pace is fractional but a lead is not: the next whole one closes the gap.
     A gap between two rates is in points; "%" would read as a relative change. */
  const size =
    def.unit === 'count'
      ? num(Math.ceil(gap))
      : def.unit === 'ratio'
        ? `${num(gap * 100)} ${translate(message('điểm', 'pts', '%p'))}`
        : printValue(def.unit, gap, compact)

  if (!def.higherIsBetter) {
    return translate(
      message(
        `Đang vượt mức tối đa ${size}.`,
        `${size} over the maximum.`,
        `최대치를 ${size} 초과했습니다.`,
      ),
    )
  }
  return translate(
    def.paced
      ? message(
          `Còn thiếu ${size} so với mức cần đạt đến hôm nay.`,
          `${size} short of the pace needed by today.`,
          `오늘까지 필요한 진도보다 ${size} 부족합니다.`,
        )
      : message(
          `Còn thiếu ${size} so với chỉ tiêu.`,
          `${size} short of the target.`,
          `목표보다 ${size} 부족합니다.`,
        ),
  )
}

// ---------------------------------------------------------------------------
// ACKNOWLEDGEMENT — one rule for both screens, so they cannot disagree
// ---------------------------------------------------------------------------

/** `by-default`: answered, as `done` is, but by a missed deadline rather than
 *  the holder, so it is never worded as received (ADR 0114). */
export type Acknowledgement = {
  state: 'done' | 'by-default' | 'missing' | 'stale' | 'no-target'
  text: string
}

export function acknowledgementOf(card: KpiScorecard): Acknowledgement {
  if (card.acknowledgedAt !== null && !card.acknowledgementStale) {
    return card.acceptedByDefault
      ? {
          state: 'by-default',
          text: translate(
            message(
              'Có chỉ tiêu nhận mặc định',
              'Target accepted by default',
              '목표가 기본값으로 수락됨',
            ),
          ),
        }
      : {
          state: 'done',
          text: translate(
            message(
              `Đã nhận chỉ tiêu lúc ${dmhm(card.acknowledgedAt)}`,
              `Target received at ${dmhm(card.acknowledgedAt)}`,
              `${dmhm(card.acknowledgedAt)}에 목표 수령`,
            ),
          ),
        }
  }
  if (!card.readings.some((r) => r.target !== null)) {
    return {
      state: 'no-target',
      text: translate(
        message(
          'Tháng này chưa có chỉ tiêu nào được duyệt',
          'No target has been approved for this month',
          '이번 달에는 승인된 목표가 없습니다',
        ),
      ),
    }
  }
  return card.acknowledgedAt === null
    ? {
        state: 'missing',
        text: translate(message('Chưa nhận chỉ tiêu', 'Target not received', '목표 미수령')),
      }
    : {
        state: 'stale',
        text: translate(
          message(
            'Chỉ tiêu đã đổi sau lần nhận gần nhất, cần nhận lại',
            'The target changed after you last received it; receive it again',
            '마지막 수령 이후 목표가 변경되어 다시 수령해야 합니다',
          ),
        ),
      }
}

export const needsAcknowledgement = (ack: Acknowledgement) =>
  ack.state === 'missing' || ack.state === 'stale'

// ---------------------------------------------------------------------------
// EXCEPTIONS — what a manager reads before anything else
// ---------------------------------------------------------------------------

const OFF_TARGET: readonly KpiVerdict[] = ['behind', 'missed']

/** One line of the exceptions table: a reading, or a role's missing acknowledgement. */
export type PersonRow = {
  id: string
  person: KpiPerson
  role: RoleId
  acknowledgement: Acknowledgement
  /** Null on the line that reports the acknowledgement itself. */
  item: KpiItem | null
}

/** Readings off target first, then roles whose targets nobody has received,
 *  each in the order the server sent the people. */
export function exceptionRows(catalog: KpiCatalog, people: readonly KpiPerson[]): PersonRow[] {
  const cards = people.flatMap((person) =>
    person.scorecards.map((card) => ({ person, card, acknowledgement: acknowledgementOf(card) })),
  )
  const offTarget = cards.flatMap(({ person, card, acknowledgement }) =>
    itemsOf(catalog, card.role, card.readings)
      .filter((item) => OFF_TARGET.includes(item.reading.verdict))
      .map((item) => ({
        id: `${person.actorId}/${card.role}/${item.def.key}`,
        person,
        role: card.role,
        acknowledgement,
        item,
      })),
  )
  const unreceived = cards
    .filter(({ acknowledgement }) => needsAcknowledgement(acknowledgement))
    .map(({ person, card, acknowledgement }) => ({
      id: `${person.actorId}/${card.role}/acknowledgement`,
      person,
      role: card.role,
      acknowledgement,
      item: null,
    }))
  return [...offTarget, ...unreceived]
}

// ---------------------------------------------------------------------------
// ROLES — the people book regrouped by role, in role order
// ---------------------------------------------------------------------------

export type Holder = { person: KpiPerson; card: KpiScorecard }
export type RoleGroup = { role: RoleId; holders: Holder[] }

/** Roles nobody holds are left out: an empty row would print zeros as if measured. */
export function roleGroups(people: readonly KpiPerson[]): RoleGroup[] {
  return RoleId.options.flatMap((role) => {
    const holders = people.flatMap((person) =>
      person.scorecards.filter((card) => card.role === role).map((card) => ({ person, card })),
    )
    return holders.length > 0 ? [{ role, holders }] : []
  })
}

/** Best to worst, then the unjudged: a stacked bar reads left to right in that order. */
export const VERDICT_ORDER: readonly KpiVerdict[] = [
  'met',
  'on-track',
  'behind',
  'missed',
  'unset',
  'no-data',
]

/** A role read on its primary metric. Own-scope readings are never added up:
 *  one opportunity can count for two holders, and a summed target is a team
 *  target nobody approved. */
export type RoleSummary = {
  role: RoleId
  holders: number
  def: KpiMetricDef | null
  /** A room-scope primary, read from the room's own card. Null where that card
   *  is another role's: each holder may carry a personal target (ADR 0098), so
   *  no holder's reading speaks for the room. */
  room: KpiReading | null
  /** Holders per verdict of the primary metric, each on their own reading,
   *  non-zero only, in `VERDICT_ORDER`. */
  verdicts: { verdict: KpiVerdict; count: number }[]
  unreceived: number
}

export function roleSummary(
  catalog: KpiCatalog,
  { role, holders }: RoleGroup,
  roomCard: Pick<KpiScorecard, 'role' | 'readings'> | undefined,
): RoleSummary {
  const def = primaryOf(catalog, role)
  const readings = holders.flatMap(({ card }) => card.readings.filter((r) => r.key === def?.key))
  const roomReading =
    def?.scope === 'room' && roomCard?.role === role
      ? roomCard.readings.find((r) => r.key === def.key)
      : undefined
  return {
    role,
    holders: holders.length,
    def,
    room: roomReading ?? null,
    verdicts: VERDICT_ORDER.map((verdict) => ({
      verdict,
      count: readings.filter((r) => r.verdict === verdict).length,
    })).filter((v) => v.count > 0),
    unreceived: holders.filter(({ card }) => needsAcknowledgement(acknowledgementOf(card))).length,
  }
}

/** Roles held by someone but with no approved target: nothing there can be
 *  judged, so an empty exception list is not an all-clear. */
export const unjudgedRoles = (people: readonly KpiPerson[]): number =>
  new Set(
    people.flatMap((p) =>
      p.scorecards.filter((c) => !c.readings.some((r) => r.target !== null)).map((c) => c.role),
    ),
  ).size

// ---------------------------------------------------------------------------
// ROOM — the people lists without the director's card, heaviest first
// ---------------------------------------------------------------------------

/* The director's card is the room's own scorecard, already on the strip;
   listing it again among people would print the same figures twice. */
const DIRECTOR: RoleId = 'director'

type Weight = readonly [missed: number, behind: number, unreceived: number]

/** Missed readings first, then behind, then a target not yet received. */
export function weightOf(cards: readonly KpiScorecard[]): Weight {
  const verdicts = cards.flatMap((c) => c.readings.map((r) => r.verdict))
  const count = (v: KpiVerdict) => verdicts.filter((x) => x === v).length
  const unreceived = cards.filter((c) => needsAcknowledgement(acknowledgementOf(c))).length
  return [count('missed'), count('behind'), unreceived]
}

/** Ties keep the order the server sent (the sort is stable). */
export const heavierFirst = (a: Weight, b: Weight) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]

/** Every person without their director card, dropped if nothing is left, heaviest first. */
export function roomPeople(people: readonly KpiPerson[]): KpiPerson[] {
  return people
    .map((p) => ({ ...p, scorecards: p.scorecards.filter((c) => c.role !== DIRECTOR) }))
    .filter((p) => p.scorecards.length > 0)
    .sort((a, b) => heavierFirst(weightOf(a.scorecards), weightOf(b.scorecards)))
}

// ---------------------------------------------------------------------------
// VERDICT COLOUR — class names only; the label is always printed beside it
// ---------------------------------------------------------------------------

export const BAR_FILL: Record<KpiVerdict, string> = {
  'no-data': 'bg-muted-foreground',
  unset: 'bg-muted-foreground',
  met: 'bg-success',
  'on-track': 'bg-primary',
  behind: 'bg-warning',
  missed: 'bg-destructive',
}

/** A heat-map cell: the badge's tint and on-tint text pairs. The stone theme takes
 *  a lighter green, amber and red so the on-tint text keeps law 13. On track stays
 *  bare, or a full table turns into a field of brand blue (law 3). */
export const VERDICT_TINT: Record<KpiVerdict, { tint: string; text: string }> = {
  'no-data': { tint: '', text: 'text-muted-foreground' },
  unset: { tint: '', text: 'text-muted-foreground' },
  met: { tint: 'bg-success/20 stone:bg-success/14', text: 'text-on-tint-success' },
  'on-track': { tint: '', text: 'text-on-tint-primary' },
  behind: { tint: 'bg-warning/20 stone:bg-warning/14', text: 'text-on-tint-warning' },
  missed: { tint: 'bg-destructive/20 stone:bg-destructive/14', text: 'text-on-tint-destructive' },
}
