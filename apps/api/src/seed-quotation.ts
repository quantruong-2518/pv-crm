import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'

/** Ledger rows for the seeded `quotation-sent` touches. Runs the backfill that
 *  migration 0104 ends with, read from the file so the rule lives in one place. */

type Executor = { execute: (q: ReturnType<typeof sql.raw>) => Promise<unknown> }

export async function seedQuotationLedger(tx: Executor) {
  const file = readFileSync(join(__dirname, '../drizzle/0104_quotation_ledger.sql'), 'utf8')
  const backfill = file.split('--> statement-breakpoint').pop()!
  await tx.execute(sql.raw(backfill))
}
