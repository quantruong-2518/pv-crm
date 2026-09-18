// @vitest-environment node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { sql } from 'drizzle-orm'

/** The fences of `sales.mail_sequence_run`, proved against the real migration
 *  folder on an in-memory PGlite — same Postgres engine, no server to start.
 *
 *  Raw SQL rather than the drizzle table object: vitest resolves no `@api`
 *  alias, and the schema file imports `mail-run.schema` through it. The subject
 *  of the test is the DDL that reached the database anyway. */
const FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle')
const RUN = '11111111-1111-4111-8111-111111111111'
const OTHER_RUN = '22222222-2222-4222-8222-222222222222'

let client: PGlite
let db: ReturnType<typeof drizzle>

/** SQLSTATE of the refusal, or `'accepted'` when Postgres took the row —
 *  which is the whole failure this file exists to catch. */
const stateOf = async (statement: string): Promise<string> => {
  try {
    await db.execute(sql.raw(statement))
    return 'accepted'
  } catch (error) {
    return (error as { code?: string }).code ?? 'no code'
  }
}

const insert = (type: string, code: string, run: string, wave: number, expected = 'NULL') =>
  `INSERT INTO "sales"."mail_sequence_run"
     ("subject_type","subject_code","mail_run_id","wave_no","expected")
   VALUES ('${type}','${code}','${run}',${wave},${expected})`

beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client)
  await migrate(db, { migrationsFolder: FOLDER })

  for (const id of [RUN, OTHER_RUN]) {
    await db.execute(sql`
      INSERT INTO "platform"."mail_run"
        ("id","label","subject","body","from_address","state","created_by")
      VALUES (${id}, 'đợt', 's', 'b', 'a@b.vn', 'SENT', 'test')`)
  }
  await db.execute(sql.raw(insert('lead', 'LD-0001', RUN, 1, '0')))
}, 120_000)

afterAll(async () => client?.close())

describe('sales.mail_sequence_run', () => {
  it('takes a lead sequence with no campaign behind it', async () => {
    const rows = await db.execute(sql`SELECT * FROM "sales"."mail_sequence_run"`)
    expect(rows.rows).toHaveLength(1)
  })

  it.each([
    ['a subject_type outside the three books', insert('partner', 'LD-0001', OTHER_RUN, 1), '23514'],
    ['the same wave number twice in one subject', insert('lead', 'LD-0001', OTHER_RUN, 1), '23505'],
    ['one batch claimed by two sequences', insert('opportunity', 'OP-1', RUN, 1), '23505'],
    [
      'a batch that does not exist',
      insert('lead', 'LD-0002', OTHER_RUN.replace('2', '9'), 1),
      '23503',
    ],
    ['wave number zero', insert('lead', 'LD-0002', OTHER_RUN, 0), '23514'],
    ['a negative expectation', insert('lead', 'LD-0002', OTHER_RUN, 1, '-1'), '23514'],
    ['an empty subject code', insert('lead', '', OTHER_RUN, 1), '23514'],
  ])('refuses %s', async (_, statement, sqlstate) => {
    expect(await stateOf(statement)).toBe(sqlstate)
  })
})
