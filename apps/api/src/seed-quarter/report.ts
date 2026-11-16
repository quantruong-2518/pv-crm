import { sql, type SQL } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { Db } from '@api/platform/db/db.module'
import { CHECKS } from './checks'
import { ADMIN_GUARANTEES, ADMIN_SAFETY } from './checks-admin'
import { COMMS_GUARANTEES, COMMS_SAFETY } from './checks-comms'
import { FUNNEL_GUARANTEES, FUNNEL_SAFETY } from './checks-funnel'
import { KPI_GUARANTEES } from './checks-kpi'
import { SCENARIOS } from './scenarios'
import { ORDER, TABLES } from './tables'
import { qualified } from './write'

/** Prints every guarantee `scenarios.ts` promises with its count, then the row
 *  count of each table. Returns how many guarantees have no check or count zero
 *  and how many safety rows are left; the caller decides what that costs. `db`
 *  may be the write transaction, so a red book can still be rolled back. */

type Say = (line: string) => void

const countOf = async (db: Db, query: SQL): Promise<number> => {
  const result = (await db.execute(query)) as unknown as { rows: { n: number | string }[] }
  return Number(result.rows[0]?.n ?? 0)
}

export async function report(db: Db, say: Say): Promise<number> {
  const owners = new Map<string, string[]>()
  for (const s of SCENARIOS)
    for (const g of s.guarantees) owners.set(g, [...(owners.get(g) ?? []), s.key])
  /* KPI, mail and comms rows hang off no single scenario: their guarantees belong to the book. */
  const book = [
    ...KPI_GUARANTEES,
    ...FUNNEL_GUARANTEES,
    ...COMMS_GUARANTEES,
    ...COMMS_SAFETY,
    ...ADMIN_GUARANTEES,
  ]
  for (const g of book) owners.set(g, [...(owners.get(g) ?? []), 'book'])
  let bad = 0
  say(`Guarantees (${owners.size})`)
  for (const [key, by] of [...owners].sort(([a], [b]) => a.localeCompare(b))) {
    const check = CHECKS[key]
    const n = check ? await countOf(db, check) : null
    const mark = n === null ? 'MISSING' : n === 0 ? 'ZERO' : 'ok'
    if (mark !== 'ok') bad += 1
    say(`  ${mark.padEnd(8)} ${key.padEnd(40)} ${n ?? '-'}  (${by.join(',')})`)
  }
  say('Must be zero (rows the worker would act on)')
  for (const [key, check] of Object.entries({ ...FUNNEL_SAFETY, ...ADMIN_SAFETY })) {
    const n = await countOf(db, check)
    if (n !== 0) bad += 1
    say(`  ${(n === 0 ? 'ok' : 'UNSAFE').padEnd(8)} ${key.padEnd(40)} ${n}`)
  }
  say('Rows per table')
  let empty = 0
  for (const key of ORDER) {
    const name = qualified(TABLES[key] as PgTable)
    const [schema, table] = name.split('.')
    const n = await countOf(db, sql.raw(`SELECT count(*)::int AS n FROM "${schema}"."${table}"`))
    if (n === 0) empty += 1
    else say(`  ${name.padEnd(40)} ${n}`)
  }
  say(`  (${empty} tables empty)`)
  say(
    bad === 0
      ? 'Report: every guarantee is covered.'
      : `Report: ${bad} guarantee(s) MISSING, ZERO or UNSAFE.`,
  )
  return bad
}
