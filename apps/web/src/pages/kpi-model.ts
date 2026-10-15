import { billions, millions, vnd } from '@pv/ui'
import {
  KPI_VERDICT_LABEL,
  KpiLayer,
  KpiPeriodKey,
  RoleId,
  type KpiMetricDef,
  type KpiPerson,
  type KpiReading,
  type KpiScorecard,
  type KpiUnit,
  type KpiVerdict,
} from '@pv/contracts'
import { primaryOf, type KpiCatalog } from '@/data/kpi-catalog'
import { dmhm } from '@/lib/date'
import { VN_OFFSET_MS, currentPick, num, stepPick, type PeriodPick } from './home-model'

/** Calculation behind the two KPI screens: how a reading prints, what is
 *  missing against pace, who needs attention, and what a role adds up to.
 *  No render, no fetch; the catalog arrives as an argument (`data/kpi-catalog.ts`).
 *
 *  Nothing here judges a figure. The verdict is the server's; this file only
 *  formats it, and subtracts two numbers the server sent to say how far off
 *  a `behind` reading is. */

/** The personal screen opens on what a verdict is measured against. The
 *  company screen prints the day of the month instead, its figures speak first. */
export const DESCRIPTION =
  'Số tự tính, cập nhật mỗi lần mở. Trạng thái so với mức cần đạt đến hôm nay. Chỉ số tỷ lệ và thời gian so với chỉ tiêu cả tháng.'

/** KPI is agreed per month, so the overview's picker is pinned to that grain. */
export const monthPick = (): PeriodPick => ({ ...currentPick(), grain: 'month' })

/** The one name every KPI address carries its month under, so a screen
 *  opened from another lands on the month it was opened from. */
export const MONTH_PARAM = 'month'

export function pickFromUrl(month: string | null): PeriodPick {
  const pick = monthPick()
  return month && KpiPeriodKey.safeParse(month).success ? { ...pick, month } : pick
}

export const personHref = (actorId: string, period: string) =>
  `/sales/kpi/person/${encodeURIComponent(actorId)}?${MONTH_PARAM}=${period}`

const monthAfter = (key: string) => {
  const year = Number(key.slice(0, 4))
  const month = Number(key.slice(5))
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
}

/** Day of month over days in month, for the running month only: in any other
 *  month today is not inside it, so the line is left out. */
export function dayOfMonth(period: string, today = new Date()): string | null {
  if (period !== currentPick(today).month) return null
  const vn = new Date(today.getTime() + VN_OFFSET_MS)
  const days = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() + 1, 0)).getUTCDate()
  return `Ngày ${vn.getUTCDate()}/${days}`
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

/** A table cell short enough to sit beside a second figure, value over target. */
export const printShort = (unit: KpiUnit, value: number | null) =>
  value === null ? DASH : printValue(unit, value, true)

/** The figure as a share of its target, unclamped, for "% done". Null for a
 *  lower-is-better metric (a share of a ceiling is not progress) and for a
 *  rate, whose own figure is already a percent. */
export function shareOf({ def, reading }: KpiItem): number | null {
  const { value, target } = reading
  if (!def.higherIsBetter || def.unit === 'ratio') return null
  if (value === null || target === null || target <= 0) return null
  return value / target
}

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
 *  a lighter green and red so the on-tint text keeps law 13. On track stays
 *  bare, or a full table turns into a field of brand blue (law 3). */
export const VERDICT_TINT: Record<KpiVerdict, { tint: string; text: string }> = {
  'no-data': { tint: '', text: 'text-muted-foreground' },
  unset: { tint: '', text: 'text-muted-foreground' },
  met: { tint: 'bg-success/20 stone:bg-success/14', text: 'text-on-tint-success' },
  'on-track': { tint: '', text: 'text-on-tint-primary' },
  behind: { tint: 'bg-warning/20', text: 'text-on-tint-warning' },
  missed: { tint: 'bg-destructive/20 stone:bg-destructive/14', text: 'text-on-tint-destructive' },
}
