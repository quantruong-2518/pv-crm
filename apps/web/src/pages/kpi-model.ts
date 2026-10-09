import { billions, millions, vnd } from '@pv/ui'
import {
  KPI_CATALOG,
  KPI_VERDICT_LABEL,
  KpiLayer,
  type KpiMetricDef,
  type KpiPerson,
  type KpiReading,
  type KpiScorecard,
  type KpiUnit,
  type KpiVerdict,
  type RoleId,
} from '@pv/contracts'
import { dmhm } from '@/lib/date'
import { currentPick, num, stepPick, type PeriodPick } from './home-model'

/** Calculation behind the two KPI screens: how a reading prints, what is
 *  missing against pace, and who needs attention. No render, no fetch.
 *
 *  Nothing here judges a figure. The verdict is the server's; this file only
 *  formats it, and subtracts two numbers the server sent to say how far off
 *  a `behind` reading is. */

/** Both screens open on the same sentence about what a verdict is measured against. */
export const DESCRIPTION =
  'Số do hệ thống tự tính, cập nhật mỗi lần mở màn. Trạng thái so với mức cần đạt đến hôm nay; chỉ số tỷ lệ và thời gian so với chỉ tiêu cả tháng.'

/** KPI is agreed per month, so the overview's picker is pinned to that grain. */
export const monthPick = (): PeriodPick => ({ ...currentPick(), grain: 'month' })

const monthAfter = (key: string) => {
  const year = Number(key.slice(0, 4))
  const month = Number(key.slice(5))
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
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

/** Catalog order, so two screens list a role's metrics the same way. */
export function itemsOf(role: RoleId, readings: readonly KpiReading[]): KpiItem[] {
  return KPI_CATALOG[role].flatMap((def) =>
    readings.filter((r) => r.key === def.key).map((reading) => ({ def, reading })),
  )
}

/** The hero, then the rest by layer: activity → conversion → result → guardrail.
 *  The hero is left out of the rest so no figure is printed twice. */
export function boardOf(role: RoleId, readings: readonly KpiReading[]) {
  const items = itemsOf(role, readings)
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
  value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const BILLION = 1_000_000_000

/** `compact` is for a tile; tables print every dong. */
export function printValue(unit: KpiUnit, value: number, compact = false): string {
  if (unit === 'money') {
    if (!compact) return vnd(value)
    return value >= BILLION ? billions(value, 1) : millions(value)
  }
  if (unit === 'ratio') return `${num(value * 100)}%`
  if (unit === 'hours') return `${oneDecimal(value)} giờ`
  if (unit === 'days') return `${oneDecimal(value)} ngày`
  return num(value)
}

export const DASH = '—'

/** A tile has room for the words; a table cell has the badge beside it. */
export const printTile = (unit: KpiUnit, value: number | null) =>
  value === null ? KPI_VERDICT_LABEL['no-data'] : printValue(unit, value, true)

export const printCell = (unit: KpiUnit, value: number | null) =>
  value === null ? DASH : printValue(unit, value)

/** What the unit is called beside a field a manager types a target into. */
export const UNIT_WORD: Record<KpiUnit, string> = {
  count: '',
  money: '₫',
  ratio: '%',
  hours: 'giờ',
  days: 'ngày',
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
        ? `${num(gap * 100)} điểm`
        : printValue(def.unit, gap, compact)

  if (!def.higherIsBetter) return `Đang vượt mức tối đa ${size}.`
  return def.paced
    ? `Còn thiếu ${size} so với mức cần đạt đến hôm nay.`
    : `Còn thiếu ${size} so với chỉ tiêu.`
}

// ---------------------------------------------------------------------------
// ACKNOWLEDGEMENT — one rule for both screens, so they cannot disagree
// ---------------------------------------------------------------------------

export type Acknowledgement = {
  state: 'done' | 'missing' | 'stale' | 'no-target'
  text: string
}

export function acknowledgementOf(card: KpiScorecard): Acknowledgement {
  if (card.acknowledgedAt !== null && !card.acknowledgementStale) {
    return { state: 'done', text: `Đã nhận chỉ tiêu lúc ${dmhm(card.acknowledgedAt)}` }
  }
  if (!card.readings.some((r) => r.target !== null)) {
    return { state: 'no-target', text: 'Tháng này chưa có chỉ tiêu nào được duyệt' }
  }
  return card.acknowledgedAt === null
    ? { state: 'missing', text: 'Chưa nhận chỉ tiêu' }
    : { state: 'stale', text: 'Chỉ tiêu đã đổi sau lần nhận gần nhất, cần nhận lại' }
}

export const needsAcknowledgement = (ack: Acknowledgement) =>
  ack.state === 'missing' || ack.state === 'stale'

// ---------------------------------------------------------------------------
// EXCEPTIONS — what a manager reads before anything else
// ---------------------------------------------------------------------------

const OFF_TARGET: readonly KpiVerdict[] = ['behind', 'missed']

/** One line of a people table: a reading, or a role's missing acknowledgement. */
export type PersonRow = {
  id: string
  person: KpiPerson
  role: RoleId
  /** First line of its person / of its role, where the name and role print. */
  opensPerson: boolean
  opensRole: boolean
  acknowledgement: Acknowledgement
  /** Null on the line that reports the acknowledgement itself. */
  item: KpiItem | null
}

/** Every person × role × metric, in the order the server sent the people. */
export function personRows(people: readonly KpiPerson[]): PersonRow[] {
  return people.flatMap((person) =>
    person.scorecards.flatMap((card, c) => {
      const acknowledgement = acknowledgementOf(card)
      return itemsOf(card.role, card.readings).map((item, i) => ({
        id: `${person.actorId}/${card.role}/${item.def.key}`,
        person,
        role: card.role,
        opensPerson: c === 0 && i === 0,
        opensRole: i === 0,
        acknowledgement,
        item,
      }))
    }),
  )
}

/** Readings off target first, then roles whose targets nobody has received.
 *  Every line names its person and role: the lines are no longer adjacent. */
export function exceptionRows(people: readonly KpiPerson[]): PersonRow[] {
  const named = (row: PersonRow): PersonRow => ({ ...row, opensPerson: true, opensRole: true })
  const all = personRows(people)
  const offTarget = all.filter((r) => r.item && OFF_TARGET.includes(r.item.reading.verdict))
  const unreceived = all
    .filter((r) => r.opensRole && needsAcknowledgement(r.acknowledgement))
    .map((r) => ({ ...r, id: `${r.person.actorId}/${r.role}/acknowledgement`, item: null }))
  return [...offTarget, ...unreceived].map(named)
}

/** Roles held by someone but with no approved target: nothing there can be
 *  judged, so an empty exception list is not an all-clear. */
export const unjudgedRoles = (people: readonly KpiPerson[]): number =>
  new Set(
    people.flatMap((p) =>
      p.scorecards.filter((c) => !c.readings.some((r) => r.target !== null)).map((c) => c.role),
    ),
  ).size
