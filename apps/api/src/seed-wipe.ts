import { sql } from 'drizzle-orm'
import type { Db } from '@api/platform/db/db.module'

/** Reference data the migrations plant and no seed rebuilds — same list as
 *  `reset-staff.ts` plus the two catalogs migrations insert. `fx_rate` is here
 *  because the feed keeps no history: a wiped rate is gone for good. */
const KEEP = [
  'role_permission',
  'permission_seed',
  'email_suppression',
  'mail_template',
  'motion_policy',
  'fx_rate',
]
const OWNED_SCHEMAS = ['platform', 'sales', 'comms']

/** Every table the app owns except `KEEP`, in one TRUNCATE so foreign keys need
 *  no ordering; `actor` last by DELETE, so `role_permission.granted_by` falls to
 *  NULL instead of cascading the permission matrix away.
 *
 *  A typed rate names its author, so those rows go before `actor` does; the
 *  backfill row is planted if it is missing. */
export async function wipeBusinessTables(tx: Db): Promise<void> {
  const listed = (await tx.execute(sql`
    SELECT table_schema, table_name FROM information_schema.tables
    WHERE table_schema IN (${sql.join(
      OWNED_SCHEMAS.map((x) => sql`${x}`),
      sql`, `,
    )})
      AND table_type = 'BASE TABLE'
  `)) as { rows: { table_schema: string; table_name: string }[] }
  const wiped = listed.rows
    .filter((t) => !KEEP.includes(t.table_name) && t.table_name !== 'actor')
    .map((t) => `"${t.table_schema}"."${t.table_name}"`)
  await tx.execute(sql.raw(`TRUNCATE TABLE ${wiped.join(', ')} RESTART IDENTITY`))
  await tx.execute(sql`DELETE FROM platform.fx_rate WHERE source = 'manual'`)
  await tx.execute(sql`INSERT INTO platform.fx_rate (currency, day, rate, source)
    VALUES ('USD', '2000-01-01', 26400, 'legacy') ON CONFLICT DO NOTHING`)
  await tx.execute(sql.raw(`DELETE FROM "platform"."actor"`))
}
