import 'reflect-metadata'
import { createDb } from '@api/platform/db/create-db'
import { seqCodes } from '@api/branches/sales/code-seq'
import { newCtx, buildAll, scoped } from './build'
import { dayOf, vnAt } from './clock'
import { EMITTERS } from './emitters'
import { SEQUENCES, type CodeKind } from './plan'
import { report } from './report'
import { readWorld, staleConfigIds } from './world'
import { tally, writeAll } from './write'

/** `pnpm db:seed:quarter` — one dense quarter of CRM activity (01/08/2026 to the
 *  run day) written by direct INSERT. Preview by default.
 *
 *      pnpm db:seed:quarter                        # preview: rows per table
 *      pnpm db:seed:quarter -- --password='…' --apply   # write, one transaction
 *      pnpm db:seed:quarter -- --report            # guarantees + row counts only
 *      add --today=YYYY-MM-DD to pin the run day (PGlite only; now = 15:00 Vietnam)
 *
 *  --apply ends with the guarantee report inside the transaction: any MISSING,
 *  ZERO or UNSAFE line rolls the whole write back.
 *
 *  Adds only; to start over run the data reset. Refuses a database that already
 *  holds `.example` leads or accounts. The password guard is `seed-kpi`'s: the
 *  default password lives in the repo, so a real target must name its own. */

type Say = (line: string) => void
const stdout: Say = (line) => void process.stdout.write(`${line}\n`)

const flag = (argv: string[], name: string): string | undefined =>
  argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

/** One run against `url`; `main()` and the harness both come through here. */
export async function run(argv: string[], url: string, say: Say = stdout): Promise<void> {
  const apply = argv.includes('--apply')
  const today = flag(argv, 'today')
  if (today && !/^\d{4}-\d{2}-\d{2}$/.test(today))
    throw new Error(`--today=${today} không đúng dạng YYYY-MM-DD.`)
  const only = flag(argv, 'emitters')?.split(',')
  const unknown = (only ?? []).filter((k) => !EMITTERS.some((e) => e.key === k))
  if (unknown.length > 0) throw new Error(`--emitters không có: ${unknown.join(', ')}`)
  const now = today ? vnAt(today, 15) : new Date()

  const { db, close, kind } = await createDb(url)
  say(
    `[db] ${kind} · ${kind === 'pglite' ? url : new URL(url).host} · ${argv.includes('--report') ? 'report' : 'quarter'} · ${apply ? 'WRITE' : 'preview'} · today ${dayOf(now)}`,
  )
  try {
    /* Bell markers on Postgres use the DB clock, so a pinned day would write markers for another day. */
    if (today && kind !== 'pglite') {
      throw new Error(
        `--today chỉ dùng được với PGlite — trên ${kind} chuông thông báo tính theo giờ của database, nên ngày chạy phải là ngày thật.`,
      )
    }
    if (argv.includes('--report')) {
      if ((await report(db, say)) > 0) process.exitCode = 1
      return
    }
    const world = await readWorld(db)
    if (world.seeded.leads + world.seeded.accounts > 0) {
      throw new Error(
        `Database đã có dữ liệu seed (${world.seeded.leads} lead, ${world.seeded.accounts} account đuôi .example) — dừng.`,
      )
    }
    const stale = staleConfigIds(world)
    if (stale.missing.length + stale.inactive.length > 0) {
      const part = (label: string, ids: string[]): string[] =>
        ids.length > 0 ? [`${label}: ${ids.join(', ')}`] : []
      say(
        `CẢNH BÁO: mã cấu hình mà seed dùng nhưng đích không dùng được — ${[
          ...part('không có', stale.missing),
          ...part('đang tắt', stale.inactive),
        ].join(' · ')}. Bước dựng có thể dừng giữa chừng.`,
      )
    }

    const drawn = new Map<CodeKind, number>()
    const count = (k: CodeKind): string => {
      drawn.set(k, (drawn.get(k) ?? 0) + 1)
      return `${k}-?${drawn.get(k)}`
    }
    const preview = buildAll(newCtx(world, count, now), only)
    const rows = tally(preview.plan).filter(([, n]) => n > 0)
    rows.forEach(([table, n]) => say(`  + ${table.padEnd(40)} ${n}`))
    const total = rows.reduce((n, [, k]) => n + k, 0)
    say(`${total} rows, ${[...drawn.values()].reduce((a, b) => a + b, 0)} codes to draw`)

    if (!apply) {
      say(
        kind !== 'pglite' && !flag(argv, 'password')
          ? 'Preview done. The target is not pglite: --apply will need --password=…'
          : 'Preview done. Add --apply to write.',
      )
      return
    }
    if (kind !== 'pglite' && !flag(argv, 'password')) {
      throw new Error(
        `Đích là ${kind} — bắt buộc --password='…' (mật khẩu mặc định nằm trong repo).`,
      )
    }

    await db.transaction(async (tx) => {
      const codes = new Map<CodeKind, string[]>()
      for (const [k, n] of drawn) {
        const s = SEQUENCES[k]
        const r = (await tx.execute(seqCodes(s.prefix, s.seq, n, s.width))) as unknown as {
          rows: { code: string }[]
        }
        codes.set(
          k,
          r.rows.map((x) => x.code),
        )
      }
      const draw = (k: CodeKind): string => {
        const code = codes.get(k)?.shift()
        if (!code)
          throw new Error(`Build lần hai cần nhiều mã ${k} hơn lần đếm — build không tất định.`)
        return code
      }
      const real = buildAll(newCtx(world, draw, now), only)
      await writeAll(tx, real.plan)
      for (const e of EMITTERS) {
        if (e.afterWrite && (!only || only.includes(e.key)))
          await e.afterWrite(tx, scoped(real, `${e.key}:after`))
      }
      /* Inside the transaction: a red book must never be left on the target. */
      const bad = await report(tx, say)
      if (bad > 0) {
        throw new Error(
          `Sổ chưa đạt: ${bad} mục thiếu, bằng 0 hoặc không an toàn — đã huỷ cả giao dịch, database không đổi.`,
        )
      }
    })
    say(`Wrote ${total} rows.`)
  } finally {
    await close()
  }
}

if (require.main === module) {
  void (async () => {
    const { loadEnv } = await import('@api/platform/config/env')
    await run(process.argv.slice(2), loadEnv().DATABASE_URL)
  })().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
