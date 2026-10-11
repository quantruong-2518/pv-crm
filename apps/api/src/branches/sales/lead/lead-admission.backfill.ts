import { sql, type SQL } from 'drizzle-orm'
import { leadKeys } from '@pv/engines'
import { loadEnv } from '@api/platform/config/env'
import { createDb } from '@api/platform/db/create-db'
import type { Db } from '@api/platform/db/db.module'
import { account } from '../account/account.schema'
import { contact } from '../contact/contact.schema'
import { lead } from './lead.schema'

/** One-off: fill the four admission key columns the gate reads (migration 0097), for rows
 *  written before the services kept them — folded by `leadKeys`, the same
 *  normaliser the gate reads with. `account.created_by` is not touched: nobody
 *  knows who typed an old company.
 *
 *  Idempotent: only rows whose stored key differs are written, so a second run
 *  reports zero. Preview unless `--apply`. Delete once it has run everywhere.
 *
 *      node --env-file-if-exists=.env -r ts-node/register -r tsconfig-paths/register \
 *        src/branches/sales/lead/lead-admission.backfill.ts            # dry run
 *      … lead-admission.backfill.ts --apply                            # write */

const APPLY = process.argv.includes('--apply')
const CHUNK = 500
const say = (line: string): void => void process.stdout.write(`${line}\n`)

type Stale = { code: string; keys: (string | null)[] }

/** One UPDATE per chunk, the new keys riding in as a VALUES list. */
async function write(db: Db, table: SQL, columns: string[], rows: Stale[]): Promise<void> {
  const set = sql.join(
    columns.map((c) => sql`${sql.identifier(c)} = v.${sql.identifier(c)}`),
    sql`, `,
  )
  const names = sql.join(
    columns.map((c) => sql.identifier(c)),
    sql`, `,
  )
  for (let i = 0; i < rows.length; i += CHUNK) {
    const values = sql.join(
      rows.slice(i, i + CHUNK).map(
        (r) =>
          sql`(${r.code}::text, ${sql.join(
            r.keys.map((k) => sql`${k}::text`),
            sql`, `,
          )})`,
      ),
      sql`, `,
    )
    await db.execute(
      sql`UPDATE ${table} AS t SET ${set} FROM (VALUES ${values}) AS v("code", ${names}) WHERE t."code" = v."code"`,
    )
  }
}

async function main(): Promise<void> {
  const { db, close, kind } = await createDb(loadEnv().DATABASE_URL)
  say(`Target: ${kind} · ${APPLY ? 'APPLY (writing)' : 'preview'}`)
  try {
    const accounts = (await db.select().from(account)).flatMap((r): Stale[] => {
      const k = leadKeys(r, [])
      return k.taxRoot === r.taxRoot && k.nameKey === r.nameKey
        ? []
        : [{ code: r.code, keys: [k.taxRoot, k.nameKey] }]
    })
    const leads = (
      await db.select({ code: lead.code, phone: lead.phone, phoneKey: lead.phoneKey }).from(lead)
    ).flatMap((r): Stale[] => {
      const [k] = leadKeys({}, [r]).people
      return k!.phone === r.phoneKey ? [] : [{ code: r.code, keys: [k!.phone] }]
    })
    const contacts = (await db.select().from(contact)).flatMap((r): Stale[] => {
      const [k] = leadKeys({}, [r]).people
      return k!.phone === r.phoneKey ? [] : [{ code: r.code, keys: [k!.phone] }]
    })

    if (APPLY) {
      await db.transaction(async (tx) => {
        await write(tx, sql`${account}`, ['tax_root', 'name_key'], accounts)
        await write(tx, sql`${lead}`, ['phone_key'], leads)
        await write(tx, sql`${contact}`, ['phone_key'], contacts)
      })
    }
    const verb = APPLY ? 'updated' : 'to update'
    say(`sales.account  ${accounts.length} row(s) ${verb} · tax_root, name_key`)
    say(`sales.lead     ${leads.length} row(s) ${verb} · phone_key`)
    say(`sales.contact  ${contacts.length} row(s) ${verb} · phone_key`)
    if (!APPLY) say('Nothing written. Add --apply to write.')
  } finally {
    await close()
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  )
  process.exitCode = 1
})
