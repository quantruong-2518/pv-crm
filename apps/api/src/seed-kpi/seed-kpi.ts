import 'reflect-metadata'
import { createDb } from '@api/platform/db/create-db'
import { loadEnv } from '@api/platform/config/env'
import { DEFAULT_PASSWORD, hashPassword } from '@api/platform/auth/password'
import { seqCodes } from '@api/branches/sales/code-seq'
import { buildAll } from './build'
import { SEQUENCES, type CodeKind } from './plan'
import { purge } from './purge'
import { report } from './report'
import { readWorld } from './world'
import { tally, writeAll } from './write'

/** `pnpm db:seed:kpi` — a test book thick enough to check every role's KPI
 *  (ADR 0082 §3), written straight into whatever DATABASE_URL names. ONLY ADDS:
 *  rows a previous run planted are skipped, real rows are never touched, and
 *  `--purge --apply` removes exactly what it planted (see `purge.ts`).
 *
 *      pnpm db:seed:kpi                              # preview
 *      pnpm db:seed:kpi -- --password='…' --apply    # write (a real target needs it)
 *      pnpm db:seed:kpi -- --report                  # print the book's KPI figures
 *      pnpm db:seed:kpi -- --purge [--apply]         # remove
 *
 *  Direct inserts, never the doors: a door rings bells, writes audit and may
 *  call Google. Codes come off the real sequences, so later door writes cannot
 *  collide. The password guard is `seed-accounts.ts`'s, for its reason. */

const APPLY = process.argv.includes('--apply')
const PURGE = process.argv.includes('--purge')
const REPORT = process.argv.includes('--report')
const passwordArg = process.argv.find((a) => a.startsWith('--password='))
const PASSWORD = passwordArg?.slice('--password='.length) ?? DEFAULT_PASSWORD
const MIN = 12

const say = (line: string): void => void process.stdout.write(`${line}\n`)

async function main(): Promise<void> {
  if (PASSWORD.length < MIN) throw new Error(`--password=… quá ngắn (tối thiểu ${MIN} ký tự).`)
  const url = loadEnv().DATABASE_URL
  const { db, close, kind } = await createDb(url)
  const target = kind === 'pglite' ? url : new URL(url).host + new URL(url).pathname
  const mode = PURGE ? 'GỠ sổ thử KPI' : REPORT ? 'đọc số KPI' : 'thêm sổ thử KPI'
  say(`[db] ${kind} · ${target} · ${mode} · ${APPLY ? 'GHI THẬT' : 'xem trước'}`)
  try {
    if (PURGE) return await purge(db, APPLY, say)
    if (REPORT) return await report(db, say)

    const world = await readWorld(db)
    const drawn = new Map<CodeKind, number>()
    const count = (k: CodeKind): string => {
      drawn.set(k, (drawn.get(k) ?? 0) + 1)
      return `${k}-?${drawn.get(k)}`
    }
    const preview = buildAll(world, count, '')
    const rows = tally(preview.plan, preview.extra).filter(([, n]) => n > 0)
    rows.forEach(([table, n]) => say(`  + ${table.padEnd(36)} ${n}`))
    world.notes.forEach((note) => say(`  ! ${note}`))
    const total = rows.reduce((n, [, k]) => n + k, 0)
    say(`${total} test rows will be added, all removable with --purge --apply`)

    if (!APPLY) {
      say(
        kind !== 'pglite' && !passwordArg
          ? 'Xem trước xong. Đích không phải pglite — lượt ghi sẽ đòi --password=…'
          : 'Xem trước xong. Thêm --apply để ghi.',
      )
      return
    }
    if (kind !== 'pglite' && !passwordArg) {
      throw new Error(
        `Đích là ${kind} — bắt buộc --password='…' (mật khẩu mặc định nằm trong repo).`,
      )
    }
    if (total === 0) return say('Sổ thử đã đủ, không thêm gì.')

    /* Hashed once: every seeded seat shares the operator's password. */
    const hash = await hashPassword(PASSWORD)
    await db.transaction(async (tx) => {
      const codes = new Map<CodeKind, string[]>()
      for (const [k, n] of drawn) {
        const r = (await tx.execute(seqCodes(`${k}-`, SEQUENCES[k], n))) as {
          rows: { code: string }[]
        }
        codes.set(
          k,
          r.rows.map((x) => x.code),
        )
      }
      const real = buildAll(world, (k) => codes.get(k)!.shift()!, hash)
      await writeAll(tx, real.plan, real.extra)
    })
    say(`Đã thêm ${total} dòng thử.`)
    await report(db, say)
  } finally {
    await close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
