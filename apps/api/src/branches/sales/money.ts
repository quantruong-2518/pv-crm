import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import type { MoneyFx } from '@pv/contracts'
import { fxRate } from '@api/platform/fx/fx-rate.schema'

/** A calendar day (a `date` column or expression) standing for a money event,
 *  where a bare `SQLWrapper` means a `timestamptz`. */
export class OnDay {
  constructor(readonly day: SQLWrapper) {}
}

/** When the money event happened. Absent, or NULL at run time, means today and
 *  the figure is provisional: the event has not happened yet. */
export type FxAt = SQLWrapper | OnDay

const TODAY = sql`(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`

/** The Vietnam calendar day of `at`, NULL when the event has no day yet. A day,
 *  not a moment, because the feed publishes one rate per day and weekends have none. */
const eventDay = (at: FxAt): SQL =>
  at instanceof OnDay ? sql`${at.day}` : sql`(${at} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`

/** The day a rate is looked up for: the event's, else today. */
const dayOf = (at?: FxAt): SQL => (at ? sql`COALESCE(${eventDay(at)}, ${TODAY})` : TODAY)

/** One column of the nearest stored rate row at or before the event day; the
 *  primary key (currency, day) serves it as a backward index scan.
 *
 *  `currency` and `at` are evaluated in a derived table of their own: drizzle
 *  prints a column bare in a single-table select, and a bare `currency` written
 *  inside this subquery would bind to `fx_rate.currency` and match any row. */
function nearest(column: 'rate' | 'day' | 'source', currency: SQLWrapper, at?: FxAt): SQL {
  return sql`(SELECT fx_r.${sql.raw(column)}
    FROM (SELECT ${currency} AS c, ${dayOf(at)} AS d) fx_q
    JOIN ${fxRate} fx_r ON fx_r.currency = fx_q.c AND fx_r.day <= fx_q.d
    ORDER BY fx_r.day DESC LIMIT 1)`
}

/** An amount converted to dong at the rate of the day it happened.
 *
 *  Rounded per row, so the figure beside a row and the sum of those rows
 *  cannot differ by the cents a two-decimal rate leaves behind.
 *
 *  NULL, never 0, for a row with no amount, an unknown currency or a currency
 *  with no stored rate: "this row carries no money" is reported as its own
 *  count, and a zero would bury it inside the sum. */
export function toVndSql(amount: SQLWrapper, currency: SQLWrapper, at?: FxAt): SQL<number | null> {
  return sql`CASE WHEN ${currency} = 'VND' THEN ${amount}
    ELSE round(${amount} * ${nearest('rate', currency, at)}) END`
}

/** What a converted row prints beside it, all NULL for VND: the rate, the stored
 *  day it came from (earlier than the event day on weekends), whether the event
 *  has no day yet (today's rate stands in) and whether the row is the pre-go-live
 *  default. `day` as text so no driver turns it into a `Date` at UTC midnight. */
export function fxColumns(currency: SQLWrapper, at?: FxAt) {
  const unlessVnd = (value: SQL) => sql`CASE WHEN ${currency} = 'VND' THEN NULL ELSE ${value} END`
  return {
    fxRate: sql<string | null>`${unlessVnd(nearest('rate', currency, at))}`,
    fxDay: sql<string | null>`${unlessVnd(sql`${nearest('day', currency, at)}::text`)}`,
    fxProvisional: sql<boolean | null>`${unlessVnd(at ? sql`${eventDay(at)} IS NULL` : sql`true`)}`,
    fxLegacy: sql<boolean | null>`${unlessVnd(sql`${nearest('source', currency, at)} = 'legacy'`)}`,
  }
}

/** What `fxColumns` selects. */
export type FxRead = {
  fxRate: string | number | null
  fxDay: string | null
  fxProvisional: boolean | null
  fxLegacy: boolean | null
}

/** `fxColumns` read back as the contract's `MoneyFx`. */
export function moneyFxOf(row: FxRead): MoneyFx | null {
  if (row.fxRate === null || row.fxDay === null) return null
  return {
    rate: Number(row.fxRate),
    day: row.fxDay,
    provisional: row.fxProvisional === true,
    legacy: row.fxLegacy === true,
  }
}

/** A foreign amount's dong figure together with the rate behind it, read at one
 *  event day. */
export type Converted = FxRead & { vnd: string | number | null }

export function convertedColumns(amount: SQLWrapper, currency: SQLWrapper, at?: FxAt) {
  return { ...fxColumns(currency, at), vnd: toVndSql(amount, currency, at) }
}

/** `numeric` arrives as text; NULL stays NULL ("no money" is not 0). */
export const vndOf = ({ vnd }: Pick<Converted, 'vnd'>): number | null =>
  vnd === null ? null : Number(vnd)
