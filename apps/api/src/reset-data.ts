import { sql } from 'drizzle-orm'
import { createDb } from '@api/platform/db/create-db'
import { loadEnv } from '@api/platform/config/env'

/** Empties every BUSINESS table — leads and all that hangs off them — and
 *  keeps who can sign in and the catalogues migrations planted.
 *
 *  Not "delete the leads": touch, object, edge, account and next_step carry no
 *  foreign key to `lead`, so deleting leads alone leaves rows describing
 *  things that no longer exist. Everything not in `KEEP` goes, in one
 *  TRUNCATE without CASCADE, so a kept table still pointing at a wiped one
 *  fails loudly instead of being emptied on the quiet.
 *
 *  Code sequences are left where they are: a new lead never reuses the code
 *  of a deleted one. Previews by default; in `guard-db.mjs`' net.
 *
 *  Run: `pnpm --filter @pv/api db:reset:data -- --apply`. */

const APPLY = process.argv.includes('--apply')

const say = (line: string): void => void process.stdout.write(`${line}\n`)

/** Accounts and access, the do-not-mail list, and reference data. */
const KEEP = [
  'actor',
  'session',
  'password_reset',
  'role_permission',
  'permission_seed',
  'setting',
  'email_suppression',
  'motion_policy',
  'mail_template',
  'mail_template_default',
  'lead_origin',
  'lead_origin_alias',
  'lead_origin_motion',
  'config_entry',
]
const OWNED_SCHEMAS = ['platform', 'sales', 'comms']

async function main(): Promise<void> {
  const { db, close, kind } = await createDb(loadEnv().DATABASE_URL)
  say(`[db] ${kind} · ${APPLY ? 'GHI THẬT — XOÁ DỮ LIỆU NGHIỆP VỤ' : 'xem trước'}`)

  try {
    const listed = (await db.execute(
      sql.raw(`
        SELECT table_schema, table_name FROM information_schema.tables
        WHERE table_schema IN ('${OWNED_SCHEMAS.join("','")}') AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name`),
    )) as { rows: { table_schema: string; table_name: string }[] }
    const targets = listed.rows.filter((t) => !KEEP.includes(t.table_name))
    if (targets.length === 0) throw new Error('Không thấy bảng nào — chạy migration trước.')

    say('\n### Xoá')
    let empty = 0
    for (const t of targets) {
      const r = (await db.execute(
        sql.raw(`SELECT count(*)::int AS n FROM "${t.table_schema}"."${t.table_name}"`),
      )) as { rows: { n: number }[] }
      const n = r.rows[0]?.n ?? 0
      if (n === 0) empty += 1
      else say(`  − ${t.table_schema}.${t.table_name.padEnd(26)} ${n} dòng`)
    }
    say(`  (${empty} bảng đã trống)`)
    say('\n### Giữ nguyên')
    for (const t of listed.rows.filter((t) => KEEP.includes(t.table_name))) {
      say(`  = ${t.table_schema}.${t.table_name}`)
    }

    if (!APPLY) {
      say('\nXem trước xong, chưa xoá gì. Thêm --apply để xoá thật.')
      return
    }
    const names = targets.map((t) => `"${t.table_schema}"."${t.table_name}"`).join(', ')
    await db.execute(sql.raw(`TRUNCATE TABLE ${names}`))
    say('\nĐã xoá.')
  } finally {
    await close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
