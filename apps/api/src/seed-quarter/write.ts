import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core'
import type { Db } from '@api/platform/db/db.module'
import type { Plan } from './plan'
import { ORDER, TABLES } from './tables'

/** Every planned row in foreign-key order inside the caller's transaction.
 *  Only `tx` is used: on PGlite a read through the pool while a transaction is
 *  open waits on itself forever. */

export const qualified = (table: PgTable): string => {
  const { schema, name } = getTableConfig(table)
  return `${schema ?? 'public'}.${name}`
}

/** Rows per table in write order; the preview prints the same list. */
export const tally = (plan: Plan): [string, number][] =>
  ORDER.map((key) => [qualified(TABLES[key]), plan[key].length])

/** Drizzle refuses an empty VALUES list, so an empty table is skipped. */
export async function writeAll(tx: Db, plan: Plan): Promise<void> {
  for (const key of ORDER) {
    const rows = plan[key] as unknown[]
    for (let i = 0; i < rows.length; i += 500) {
      await tx.insert(TABLES[key] as PgTable).values(rows.slice(i, i + 500) as never)
    }
  }
}
