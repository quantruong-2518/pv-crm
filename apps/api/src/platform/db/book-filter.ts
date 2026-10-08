import { sql, type AnyColumn, type SQL } from 'drizzle-orm'

/** Small pieces of the book filters that more than one repository spells.
 *
 *  The date bounds are Vietnam calendar days, the same day the book prints in
 *  its "created" column, so a row never lands on the neighbouring day. */

export const csvOf = (csv: string): string[] => csv.split(',').filter(Boolean)

/** Inclusive `[from, to]` on a timestamp column; either end may be absent. */
export function createdWithin(column: AnyColumn, from?: string, to?: string): (SQL | undefined)[] {
  return [
    from ? sql`${column} >= (${from}::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'` : undefined,
    to
      ? sql`${column} < ((${to}::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`
      : undefined,
  ]
}
