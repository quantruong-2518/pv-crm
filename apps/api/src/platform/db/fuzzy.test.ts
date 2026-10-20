// @vitest-environment node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { sql, type SQL } from 'drizzle-orm'
import type { Db } from './create-db'
import { directProbe, fuzzyAny, withFuzzyFloor } from './fuzzy'

/** The typo fallback is decided inside the viewer's fence (review finding 9),
 *  proved on the real migrations, `sales.fold` and pg_trgm in in-memory PGlite.
 *
 *  Raw column SQL rather than the drizzle tables: vitest resolves no `@api`
 *  alias and the schema files import through it. Each case also runs the probe
 *  WITHOUT the fence, which must reproduce the false negative. */
const FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle')

let client: PGlite
let db: Db

const lead = (code: string, company: string, owner: string, disabled = false) =>
  sql`WITH o AS (INSERT INTO platform.object (code, kind, branch, label)
         VALUES (${code}, 'lead', 'sales', ${company}))
      INSERT INTO sales.lead (code, company, contact_name, email, state, owner_id, disabled_at, disabled_by)
      VALUES (${code}, ${company}, 'Anh Nam', ${`${code}@example.vn`}, 'assigned', ${owner},
        ${disabled ? sql`now()` : sql`NULL`}, ${disabled ? owner : null})`

const notice = (recipient: string, label: string) =>
  sql`INSERT INTO platform.notification (recipient_id, kind, event_key, subject_kind, subject_code, subject_label)
      VALUES (${recipient}, 'lead-received', ${`ev-${label}`}, 'lead', 'LD-0001', ${label})`

/** What a book returns for `q`: rows under `fence`, the probe under `probeFence`. */
async function found(
  table: SQL,
  key: SQL,
  col: SQL,
  fence: SQL,
  probeFence: SQL | undefined,
  q: string,
): Promise<string[]> {
  return withFuzzyFloor(db, directProbe(table, probeFence, [col], q), async (tx) => {
    const r = (await tx.execute(
      sql`SELECT ${key} AS k FROM ${table} WHERE ${fuzzyAny([col], q)} AND ${fence} ORDER BY 1`,
    )) as unknown as { rows: { k: string }[] }
    return r.rows.map((x) => x.k)
  })
}

const LEAD = sql`sales.lead`
const mine = sql`owner_id = 'u-me' AND disabled_at IS NULL`

beforeAll(async () => {
  /* Options as the only argument: `new PGlite(undefined, opts)` drops them in 0.5.7. */
  client = new PGlite({ extensions: { pg_trgm } })
  await client.exec('CREATE EXTENSION IF NOT EXISTS pg_trgm')
  db = drizzle(client) as unknown as Db
  await migrate(drizzle(client), { migrationsFolder: FOLDER })
  for (const id of ['u-me', 'u-other']) {
    await db.execute(sql`INSERT INTO platform.actor (id, name, email, role, role_ids)
      VALUES (${id}, ${id}, ${`${id}@example.vn`}, 'sale', ARRAY['sale'])`)
  }
  await db.execute(lead('LD-0001', 'northwimd', 'u-me'))
  await db.execute(lead('LD-0002', 'northwind', 'u-other'))
  await db.execute(lead('LD-0003', 'riverstome', 'u-me'))
  await db.execute(lead('LD-0004', 'riverstone', 'u-me', true))
  await db.execute(lead('LD-0005', 'eastwind', 'u-me'))
  await db.execute(lead('LD-0006', 'eastwimd', 'u-me'))
  await db.execute(notice('u-me', 'westwimd'))
  await db.execute(notice('u-other', 'westwind'))
}, 120_000)

afterAll(async () => client?.close())

describe('directProbe inside the viewer fence', () => {
  it('a direct hit in a lead the viewer cannot see leaves their typo match on', async () => {
    const company = sql`company`
    expect(await found(LEAD, sql`code`, company, mine, mine, 'northwind')).toEqual(['LD-0001'])
    expect(await found(LEAD, sql`code`, company, mine, undefined, 'northwind')).toEqual([])
  })

  it('a disabled lead does not switch typos off, even for a full-scope reader', async () => {
    const live = sql`disabled_at IS NULL`
    const company = sql`company`
    expect(await found(LEAD, sql`code`, company, live, live, 'riverstone')).toEqual(['LD-0003'])
    expect(await found(LEAD, sql`code`, company, live, undefined, 'riverstone')).toEqual([])
  })

  it("another recipient's notification does not switch the caller's typos off", async () => {
    const table = sql`platform.notification`
    const own = sql`recipient_id = 'u-me'`
    const label = sql`subject_label`
    expect(await found(table, label, label, own, own, 'westwind')).toEqual(['westwimd'])
    expect(await found(table, label, label, own, undefined, 'westwind')).toEqual([])
  })

  it('a visible direct hit still keeps typos out', async () => {
    expect(await found(LEAD, sql`code`, sql`company`, mine, mine, 'eastwind')).toEqual(['LD-0005'])
  })
})
