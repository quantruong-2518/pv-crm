import { sql, type SQL } from 'drizzle-orm'
import { createDb } from '@api/platform/db/create-db'
import type { Db } from '@api/platform/db/db.module'
import { loadEnv } from '@api/platform/config/env'
import { DEFAULT_PASSWORD, hashPassword } from '@api/platform/auth/password'
import { actor } from '@api/platform/db/platform.schema'
import { STAFF } from './staff'

/** Empty the database and plant the seven real accounts.
 *
 *  DESTRUCTIVE, and unlike the fixture rebuild it puts nothing back: every
 *  lead, opportunity, contract, campaign, mail and channel-identity row in the
 *  schemas this app owns goes, including the ones typed in by hand or imported
 *  through the intake door. That is the point — this is the command for "the
 *  demo is over, hand me a clean system with the right people in it".
 *
 *      pnpm db:reset:staff                            # preview, writes nothing
 *      pnpm db:reset:staff -- --apply                 # for real
 *      pnpm db:reset:staff -- --password='…' --apply  # a password of your own
 *
 *  Dry run is the default, same shape as `seed-accounts.ts`: a script whose
 *  first run writes to production is a script nobody reads before running. */

/** Tables that survive, and why each one is not data.
 *
 *  `role_permission` + `permission_seed` are the live permission matrix. Wiping
 *  them would leave all seven roles with zero grants until the API happens to
 *  restart and the bootstrap seeder replants them — which on a running Fly
 *  machine means every signed-in person gets 403 on every screen in the
 *  meantime.
 *
 *  `email_suppression` is the list of addresses that bounced hard or asked to
 *  be left alone. Those people are outside the company and never agreed to a
 *  reset; forgetting them means mailing them again. */
const KEEP = ['role_permission', 'permission_seed', 'email_suppression']

/** `actor` is emptied separately, by DELETE rather than TRUNCATE.
 *
 *  `role_permission.granted_by` points at it, so TRUNCATE would refuse without
 *  CASCADE — and CASCADE would take the permission matrix down with it, which
 *  is exactly what KEEP exists to prevent. DELETE honours the column's
 *  `ON DELETE SET NULL` instead: the grants stay, they just stop naming the
 *  person who made them. */
const EMPTIED_LAST = 'actor'

/** The schemas this application owns, and therefore the ones a reset empties.
 *
 *  Named rather than discovered, because the opposite of an allowlist here is a
 *  denylist, and a denylist fails in the dangerous direction: the day somebody
 *  installs an extension or a queue that brings its own schema, "everything
 *  except the ones I thought of" quietly truncates it. `drizzle` (migration
 *  history) and `pgboss` (queued jobs) are both already in the database and
 *  both would be catastrophic to empty. */
const OWNED_SCHEMAS = ['platform', 'sales', 'comms']

/** Schemas that are legitimately present and are NOT ours to touch.
 *
 *  This list exists only so the check below can tell "known, leave it alone"
 *  from "new, and nobody has decided" — see `assertNoUnknownSchema`. */
const FOREIGN_SCHEMAS = [
  'pg_catalog',
  'information_schema',
  'pg_toast',
  'public',
  /* Drizzle's own migration ledger. Emptying it makes every migration run
     again on the next deploy, against a database that already has the tables. */
  'drizzle',
  /* pg-boss. Truncating it drops every queued mail job on the floor. */
  'pgboss',
]

/** A `WHERE ... IN (...)` list, as BOUND PARAMETERS rather than spliced text.
 *
 *  `= ANY(${array})` is the obvious spelling and it does not work: drizzle binds
 *  a JS array as one parameter of an unknown type, and Postgres answers
 *  `op ANY/ALL (array) requires array on right side`. This was a real failure on
 *  the first preview run, not a hypothetical.
 *
 *  `sql.join` expands to `$1, $2, $3`, which is both correct and the version
 *  that stays correct when somebody eventually feeds it a name from outside
 *  this file. */
const list = (values: string[]): SQL =>
  sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )

const APPLY = process.argv.includes('--apply')

const passwordArg = process.argv.find((a) => a.startsWith('--password='))
const PASSWORD = passwordArg?.slice('--password='.length) ?? DEFAULT_PASSWORD

/** Mirrors `PASSWORD_MIN` in `@pv/contracts`, and deliberately not imported —
 *  the floor for a hand-typed operational secret should be free to be stricter
 *  than the one a user's own password has to clear. */
const MIN = 12

/** Refuse to run against a database carrying a schema nobody has classified.
 *
 *  THE FAILURE THIS EXISTS FOR ALREADY HAPPENED. The first version of this
 *  script hard-coded `('platform', 'sales')`, and a fortnight later `comms`
 *  arrived with a table holding a foreign key into `platform.actor`. A reset
 *  would have left those rows standing, and then failed on the actor delete
 *  they point at - or worse, succeeded on an empty table and quietly kept a
 *  schema the operator believed they had emptied.
 *
 *  So an unclassified schema stops the command rather than being guessed at.
 *  Adding one line to `OWNED_SCHEMAS` or `FOREIGN_SCHEMAS` is a decision
 *  somebody makes on purpose; silence is not. */
async function assertNoUnknownSchema(db: Db): Promise<void> {
  const r = (await db.execute(sql`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name NOT IN (${list([...OWNED_SCHEMAS, ...FOREIGN_SCHEMAS])})
      AND schema_name NOT LIKE 'pg\\_%'
    ORDER BY schema_name
  `)) as { rows: { schema_name: string }[] }

  if (r.rows.length === 0) return
  const names = r.rows.map((x) => x.schema_name).join(', ')
  throw new Error(
    `Database có schema chưa được phân loại: ${names}.\n` +
      `Thêm vào OWNED_SCHEMAS (bị xoá) hoặc FOREIGN_SCHEMAS (giữ nguyên) ở reset-staff.ts, ` +
      `rồi chạy lại. Đoán hộ là cách xoá nhầm thứ không ai định xoá.`,
  )
}

async function main(): Promise<void> {
  /* Only reachable via `--password=…`, since the default clears this by a wide
     margin. Kept because the argument is the path that will still exist after
     the constant is deleted. */
  if (PASSWORD.length < MIN) {
    throw new Error(`--password=… quá ngắn (tối thiểu ${MIN} ký tự).`)
  }

  const env = loadEnv()
  const { db, close, kind } = await createDb(env.DATABASE_URL)

  console.log(
    `[db] ${kind} · ${APPLY ? 'GHI THẬT — XOÁ SẠCH' : 'xem trước'} · ` +
      `mật khẩu ${passwordArg ? 'từ --password' : 'mặc định (password.ts)'}`,
  )

  try {
    await assertNoUnknownSchema(db)

    /* Read the table list from the database rather than from a hand-written
       array of forty names: a table added next month would silently survive a
       "reset" that claims to have emptied everything. The SCHEMA list is
       hand-written for the opposite reason - see `OWNED_SCHEMAS`. */
    const listed = (await db.execute(sql`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema IN (${list(OWNED_SCHEMAS)}) AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name
    `)) as { rows: { table_schema: string; table_name: string }[] }

    const targets = listed.rows.filter(
      (t) => !KEEP.includes(t.table_name) && t.table_name !== EMPTIED_LAST,
    )
    const kept = listed.rows.filter((t) => KEEP.includes(t.table_name))

    /* An empty list means the migrations never ran against this URL. Saying so
       beats the syntax error a bare `TRUNCATE TABLE` would raise, and beats the
       silent success a preview run would otherwise report. */
    if (targets.length === 0) {
      throw new Error(
        `Không thấy bảng nào trong ${OWNED_SCHEMAS.join('/')} — chạy migration trước.`,
      )
    }

    const counted = await Promise.all(
      [...targets, { table_schema: 'platform', table_name: EMPTIED_LAST }].map(async (t) => {
        const r = (await db.execute(
          sql.raw(`SELECT count(*)::int AS n FROM "${t.table_schema}"."${t.table_name}"`),
        )) as { rows: { n: number }[] }
        return { ...t, n: r.rows[0]?.n ?? 0 }
      }),
    )

    console.log(`\n### Xoá ${counted.length} bảng`)
    for (const t of counted.filter((t) => t.n > 0)) {
      console.log(`  − ${t.table_schema}.${t.table_name.padEnd(26)} ${t.n} dòng`)
    }
    console.log(`  (${counted.filter((t) => t.n === 0).length} bảng đã trống)`)
    console.log(`\n### Giữ nguyên`)
    for (const t of kept) console.log(`  = ${t.table_schema}.${t.table_name}`)

    console.log(`\n### Sổ nhân sự mới — ${STAFF.length} tài khoản, mỗi vai một người`)
    for (const p of STAFF) {
      console.log(
        `  + ${p.id.padEnd(12)} ${p.email.padEnd(26)} ${p.roleId.padEnd(18)} ` +
          `${p.branches.join('·')}${p.ownOnly ? ' · own-only' : ''}`,
      )
    }

    if (!APPLY) {
      console.log('\nXem trước xong. Thêm --apply để ghi thật.')
      return
    }

    const hash = await hashPassword(PASSWORD)
    const now = new Date()

    await db.transaction(async (tx) => {
      /* One statement for all of them: TRUNCATE checks foreign keys across the
         whole list at once, so a set that is closed under "who references whom"
         needs no ordering and no CASCADE. It is closed here because the only
         tables left out reference nothing inside it except `actor`, which is
         also left out. */
      const names = targets.map((t) => `"${t.table_schema}"."${t.table_name}"`).join(', ')
      await tx.execute(sql.raw(`TRUNCATE TABLE ${names} RESTART IDENTITY`))
      await tx.execute(sql.raw(`DELETE FROM "platform"."${EMPTIED_LAST}"`))

      await tx.insert(actor).values(
        STAFF.map((p) => ({
          id: p.id,
          name: p.name,
          email: p.email,
          role: p.role,
          roleId: p.roleId,
          branches: p.branches,
          ownOnly: p.ownOnly ?? false,
          passwordHash: hash,
          /* Set whether the password came from the constant or from
             `--password=`: either way the operator running this command knows
             it, which is the only condition the mark is about. Each seat owes a
             change before its first screen opens. */
          mustChangePasswordAt: now,
        })),
      )
    })

    console.log(
      `\n✓ Đã xoá sạch và dựng lại sổ nhân sự: ${STAFF.length} tài khoản, cùng một mật khẩu, ` +
        `mỗi tài khoản phải đổi mật khẩu ở lần đăng nhập đầu, và mọi phiên cũ đã chết ` +
        `theo bảng \`session\`.`,
    )
  } finally {
    await close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
