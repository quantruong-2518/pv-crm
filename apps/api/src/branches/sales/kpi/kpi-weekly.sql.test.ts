// @vitest-environment node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { sql, type SQL } from 'drizzle-orm'
import { cumulativeByEnd } from './kpi-weekly.sql'

/** `cumulativeByEnd` against the old way, a whole read per week end, on the
 *  real migrations in memory PGlite.
 *
 *  Lowest level that runs here: vitest resolves no `@api` alias, so the
 *  repository cannot be imported. The basis below has the shape of the real
 *  `sourced` basis (rows fenced by `at`) over `sales.lead`, and the four totals
 *  are the repository's own folds. The same check ran once against the real
 *  `KpiReadingsRepository` and its `values` (leads-sourced, signed-value,
 *  lead-to-opportunity-rate) with identical numbers. */
const FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../drizzle')
const FROM = '2026-09-01'
const TO = '2026-10-01'
const ENDS = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', TO]
/* Edges are Vietnam midnights: 00:00+07 on the 7th and 14th belongs to the later week. */
const CREATED = [
  '2026-08-31T23:59:00+07',
  '2026-09-01T08:00:00+07',
  '2026-09-06T23:30:00+07',
  '2026-09-07T00:00:00+07',
  '2026-09-09T10:00:00+07',
  '2026-09-14T00:00:00+07',
  '2026-09-20T12:00:00+07',
  '2026-09-29T09:00:00+07',
  '2026-09-30T23:59:00+07',
  '2026-10-01T00:00:00+07',
]

const COUNT = sql`count(*)`
const SUM = sql`COALESCE(SUM(b.value), 0)`
const SHARE = sql`(count(*) FILTER (WHERE b.value = 1))::float8 / NULLIF(count(*), 0)`
const MEDIAN = sql`percentile_cont(0.5) WITHIN GROUP (ORDER BY b.value)`

const basis = (value: SQL) => (): SQL => sql`
  SELECT k.marketing_owner_id AS actor_id, 'lead' AS kind, k.code, k.created_at AS at,
         ${value} AS value, 'sourced'::text AS tag
  FROM sales.lead k
  WHERE k.disabled_at IS NULL AND k.marketing_owner_id IS NOT NULL
    AND k.created_at >= (SELECT lo FROM span) AND k.created_at < (SELECT hi FROM span)`

const dayOfMonth = sql`EXTRACT(DAY FROM k.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::float8`
const hasDeal = sql`CASE WHEN EXISTS (SELECT 1 FROM sales.opportunity o WHERE o.lead_code = k.code)
  THEN 1 ELSE 0 END::float8`
const metrics = {
  count: { basis: basis(sql`NULL::float8`), total: COUNT },
  sum: { basis: basis(dayOfMonth), total: SUM },
  share: { basis: basis(hasDeal), total: SHARE },
  median: { basis: basis(dayOfMonth), total: MEDIAN },
}

const span = (to: string): SQL => sql`WITH span AS (
  SELECT (${FROM}::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' AS lo,
         (${to}::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' AS hi)`

let client: PGlite
let db: ReturnType<typeof drizzle>

const rowsOf = async (query: SQL) => (await db.execute(query)).rows as Record<string, unknown>[]

/** The old way: one read of the month's start to `end`, folded by the same total. */
async function viaEachEnd(m: (typeof metrics)[keyof typeof metrics], end: string) {
  const fold = sql`SELECT (${m.total})::float8 AS value FROM (${m.basis()}) b`
  const [row] = await rowsOf(sql`${span(end)} ${fold}`)
  return (row?.value as number | null) ?? 0
}

beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client)
  await migrate(db, { migrationsFolder: FOLDER })
  await db.execute(sql`INSERT INTO platform.actor (id,name,email,role,role_ids)
    VALUES ('m1','M','m@x.vn','marketing','{marketing}')`)
  for (const [i, at] of CREATED.entries()) {
    const code = `LD-${String(i + 1).padStart(4, '0')}`
    await db.execute(sql`INSERT INTO platform.object (code,kind,branch,label)
      VALUES (${code},'LD','Sales','x')`)
    await db.execute(sql`INSERT INTO sales.lead (code,company,contact_name,email,marketing_owner_id,created_at)
      VALUES (${code},'C','N','e@x.vn','m1',${at}::timestamptz)`)
    if ((i + 1) % 3 === 0) {
      const op = `OP-${code.slice(3)}`
      await db.execute(sql`INSERT INTO platform.object (code,kind,branch,label)
        VALUES (${op},'OP','Sales','x')`)
      await db.execute(sql`INSERT INTO sales.opportunity (code,lead_code,state,name)
        VALUES (${op},${code},'open','x')`)
    }
  }
}, 60_000)

afterAll(async () => {
  await client.close()
})

describe('cumulativeByEnd', () => {
  it.each(Object.keys(metrics) as (keyof typeof metrics)[])(
    'gives the figure of a read per week end, for %s',
    async (name) => {
      const m = metrics[name]
      const once = await rowsOf(sql`${span(TO)} ${cumulativeByEnd(m, () => sql``, ENDS)}`)
      const got = new Map(once.map((r) => [r.day as string, (r.value as number | null) ?? 0]))
      const old = await Promise.all(ENDS.map((end) => viaEachEnd(m, end)))
      expect(ENDS.map((end) => got.get(end) ?? 0)).toEqual(old)
      expect(new Set(old).size).toBeGreaterThan(1)
    },
    30_000,
  )
})
