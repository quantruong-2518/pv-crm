import { sql } from 'drizzle-orm'
import { createDb } from '@api/platform/db/create-db'
import { loadEnv } from '@api/platform/config/env'
import { MAIL_TEMPLATES } from './seed-reference-mail'

/** Replants the reference rows migrations planted once: the six motion
 *  policies, the lead-origin catalogue with its motions and aliases
 *  (0036/0057/0059), and the MAS mail templates (0013/0019/0023).
 *
 *  Exists because a staff reset empties every `sales` table and no migration
 *  runs twice, which leaves every intake door with no motion to offer.
 *
 *  ADDS ONLY — every statement is `ON CONFLICT DO NOTHING`, so a row somebody
 *  renamed, switched off or merged is left exactly as it stands. Safe on the
 *  live database, hence not in `guard-db.mjs`' net. Previews by default.
 *
 *  Run: `pnpm --filter @pv/api db:seed:reference -- --apply`. */

const APPLY = process.argv.includes('--apply')

/** A CLI's output is its interface; stdout directly, since `no-console` is on here. */
const say = (line: string): void => void process.stdout.write(`${line}\n`)

/** motion · ord · asks — the values 0057 and 0059 left on the six rows. */
const MOTIONS = [
  ['INBOUND', 1, 'ORIGIN'],
  ['OUTBOUND', 2, 'ORIGIN'],
  ['EVENT', 3, 'CAMPAIGN'],
  ['REFERRAL', 4, 'REFERRER'],
  ['PARTNER', 5, 'REFERRER'],
  ['RECYCLE', 6, 'CAMPAIGN'],
] as const

/** id · name · key (`originKey(name)`) · motions. LO-0001…0022 are 0057's
 *  list verbatim; LO-0023 is the second prospecting tool sales exports from. */
const ORIGINS = [
  ['LO-0001', 'Website', 'website', ['INBOUND']],
  ['LO-0002', 'Google', 'google', ['INBOUND']],
  ['LO-0003', 'Facebook', 'facebook', ['INBOUND']],
  ['LO-0004', 'Zalo OA', 'zalooa', ['INBOUND']],
  ['LO-0005', 'LinkedIn', 'linkedin', ['INBOUND', 'OUTBOUND']],
  ['LO-0006', 'Hotline', 'hotline', ['INBOUND']],
  ['LO-0007', 'Email đến', 'emailden', ['INBOUND']],
  ['LO-0008', 'Apollo', 'apollo', ['OUTBOUND']],
  ['LO-0009', 'Email lạnh', 'emaillanh', ['OUTBOUND']],
  ['LO-0010', 'Gọi lạnh', 'goilanh', ['OUTBOUND']],
  ['LO-0011', 'Gặp trực tiếp', 'gaptructiep', ['OUTBOUND']],
  ['LO-0012', 'Danh sách mua', 'danhsachmua', ['OUTBOUND']],
  ['LO-0013', 'Triển lãm', 'trienlam', ['EVENT']],
  ['LO-0014', 'Hội thảo', 'hoithao', ['EVENT']],
  ['LO-0015', 'Webinar', 'webinar', ['EVENT']],
  ['LO-0016', 'Khách cũ', 'khachcu', ['REFERRAL']],
  ['LO-0017', 'Nhân viên', 'nhanvien', ['REFERRAL']],
  ['LO-0018', 'Người quen', 'nguoiquen', ['REFERRAL']],
  ['LO-0019', 'Đại lý', 'daily', ['PARTNER']],
  ['LO-0020', 'Đối tác tích hợp', 'doitactichhop', ['PARTNER']],
  ['LO-0021', 'Lead cũ', 'leadcu', ['RECYCLE']],
  ['LO-0022', 'Khách đã rời', 'khachdaroi', ['RECYCLE']],
  ['LO-0023', 'Hunter', 'hunter', ['OUTBOUND']],
] as const

const ALIASES = [
  ['fb', 'LO-0003'],
  ['zalo', 'LO-0004'],
  ['web', 'LO-0001'],
  ['landing', 'LO-0001'],
  ['landingpage', 'LO-0001'],
  ['gg', 'LO-0002'],
  ['googleads', 'LO-0002'],
] as const

async function main(): Promise<void> {
  const { db, close, kind } = await createDb(loadEnv().DATABASE_URL)
  say(`[db] ${kind} · ${APPLY ? 'GHI THẬT' : 'xem trước'}`)

  try {
    await db.transaction(async (tx) => {
      const count = async (table: string): Promise<number> => {
        const res = (await tx.execute(
          sql.raw(`SELECT count(*)::int AS n FROM sales.${table}`),
        )) as { rows: { n: number }[] }
        return res.rows[0]!.n
      }
      const tables = [
        'motion_policy',
        'lead_origin',
        'lead_origin_motion',
        'lead_origin_alias',
        'mail_template',
      ]
      /* One at a time: a transaction is one connection. */
      const countAll = async (): Promise<number[]> => {
        const out: number[] = []
        for (const t of tables) out.push(await count(t))
        return out
      }
      const before = await countAll()

      for (const [motion, ord, asks] of MOTIONS) {
        await tx.execute(sql`
          INSERT INTO sales.motion_policy (motion, ord, asks, requires_campaign)
          VALUES (${motion}, ${ord}, ${asks}, ${motion === 'EVENT'})
          ON CONFLICT DO NOTHING`)
      }
      /* The key is UNIQUE too, so an origin a user already typed under another
         id keeps its row; its motions and aliases are then skipped with it. */
      for (const [id, name, key, motions] of ORIGINS) {
        const planted = (await tx.execute(sql`
          INSERT INTO sales.lead_origin (id, name, key) VALUES (${id}, ${name}, ${key})
          ON CONFLICT DO NOTHING RETURNING id`)) as { rows: unknown[] }
        if (planted.rows.length === 0) continue
        for (const motion of motions) {
          await tx.execute(sql`
            INSERT INTO sales.lead_origin_motion (origin_id, motion) VALUES (${id}, ${motion})
            ON CONFLICT DO NOTHING`)
        }
        for (const [alias, originId] of ALIASES) {
          if (originId !== id) continue
          await tx.execute(sql`
            INSERT INTO sales.lead_origin_alias (key, origin_id) VALUES (${alias}, ${id})
            ON CONFLICT DO NOTHING`)
        }
      }
      for (const t of MAIL_TEMPLATES) {
        const doors = sql.raw(`ARRAY['${t.doors.join("','")}']::text[]`)
        await tx.execute(sql`
          INSERT INTO sales.mail_template
            (code, name, subject, body, cta_label, cta_url, booking_url, doors, milestone, active)
          VALUES (${t.code}, ${t.name}, ${t.subject}, ${t.body}, ${t.ctaLabel}, ${t.ctaUrl},
            ${t.bookingUrl}, ${doors}, ${t.milestone}, ${t.active})
          ON CONFLICT DO NOTHING`)
      }
      /* Never backwards: ids minted since the reset must stay ahead. */
      await tx.execute(sql`
        SELECT setval('sales.lead_origin_code_seq',
          GREATEST((SELECT last_value FROM sales.lead_origin_code_seq), ${ORIGINS.length}))`)

      const after = await countAll()
      tables.forEach((t, i) => say(`  ${t.padEnd(20)} ${before[i]} → ${after[i]}`))

      if (!APPLY) throw new Preview()
    })
    say('\nĐã ghi.')
  } catch (e) {
    if (!(e instanceof Preview)) throw e
    say('\nXem trước xong, đã hoàn tác. Thêm --apply để ghi thật.')
  } finally {
    await close()
  }
}

/** Thrown to roll the preview transaction back. */
class Preview extends Error {}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
