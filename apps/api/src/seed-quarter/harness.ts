import 'reflect-metadata'
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { sql } from 'drizzle-orm'
import { createDb } from '@api/platform/db/create-db'
import { orgMember, orgNode, orgVersion } from '@api/platform/db/org.schema'
import { actor } from '@api/platform/db/platform.schema'
import type { RoleId } from '@pv/engines'
import { dayOf } from './clock'
import { CAST } from './params'
import { run } from './seed-quarter'
import { ORDER, TABLES } from './tables'
import { qualified } from './write'

/** The "done when" for every emitter: copy a migrated PGlite directory, plant
 *  the cast seats, run `--apply` (tally, write, report) against the copy, then
 *  check the insert order against the live foreign keys. The base is only read
 *  by `cpSync` and never opened; the URL is built here, never read from env.
 *
 *    cd apps/api && TS_NODE_TRANSPILE_ONLY=true node -r ts-node/register \
 *      -r tsconfig-paths/register src/seed-quarter/harness.ts --base <pglite dir> \
 *      [--keep <dir>] [--emitters companies,leads] [--today=YYYY-MM-DD]
 *
 *  `--today` defaults to today's real Vietnam date: the checks read the DB clock.
 *
 *  Transpile-only keeps one agent's half-typed emitter from blocking another's
 *  run; `pnpm typecheck:api` is the separate gate. A subset of emitters only
 *  works when the ones it depends on are in it (leads need companies). */

const say = (line: string): void => void process.stdout.write(`${line}\n`)

const KNOWN = ['base', 'keep', 'emitters', 'today']

/** Accepts `--x v` and `--x=v`; an unknown flag throws rather than being ignored. */
const flags = new Map<string, string>()
process.argv.slice(2).forEach((a, i, all) => {
  if (!a.startsWith('--')) return
  const [name = '', inline] = a.slice(2).split(/=(.*)/s)
  if (!KNOWN.includes(name)) throw new Error(`Unknown flag --${name} (known: ${KNOWN.join(', ')})`)
  flags.set(name, inline ?? all[i + 1] ?? '')
})
const arg = (name: string): string | undefined => flags.get(name)

/** The one FK that runs backwards on purpose; see `tables.ts`. */
const CYCLE = 'sales.partner>sales.contact'

const SEATS: { id: string; role: string; roleIds: RoleId[] }[] = [
  { id: CAST.director, role: 'Giám đốc', roleIds: ['director'] },
  { id: CAST.head, role: 'Trưởng phòng Kinh doanh', roleIds: ['head-of-sales'] },
  { id: 'u-vita', role: 'Marketing', roleIds: ['marketing', 'bd'] },
  { id: 'u-vivian', role: 'Marketing', roleIds: ['marketing', 'bd'] },
  { id: 'u-test1', role: 'Sale', roleIds: ['marketing', 'bd', 'sale'] },
  { id: 'u-test2', role: 'Sale', roleIds: ['marketing', 'bd', 'sale'] },
  { id: 'u-nari', role: 'Presales', roleIds: ['presales', 'sale', 'account-executive'] },
  { id: 'u-sale1', role: 'Sale', roleIds: ['sale', 'account-executive'] },
]

async function plantSeats(url: string): Promise<void> {
  const { db, close } = await createDb(url)
  try {
    await db
      .insert(actor)
      .values(
        SEATS.map((s) => ({
          ...s,
          name: s.id,
          email: `${s.id}@pebblevina.test`,
          branches: ['One', 'Sales'] as ('One' | 'Sales')[],
          ownOnly: false,
          passwordHash: 'x',
        })),
      )
      .onConflictDoNothing()
  } finally {
    await close()
  }
}

/** The 2026-12 org tree production carries (16/11/2026): company and one department,
 *  no team nodes. The base copy has none and the KPI emitter reads December's sets
 *  off the tree, so the harness plants it; the unit names are guesses, the ids are real. */
const COMPANY = '00000000-0000-4000-8000-000000000001'
const DEPARTMENT = '6198facf-0efc-486c-938e-fc492f643c0b'

async function plantOrgTree(url: string): Promise<void> {
  const { db, close } = await createDb(url)
  const fromPeriod = '2026-12'
  try {
    await db.insert(orgVersion).values({ fromPeriod, savedBy: CAST.director }).onConflictDoNothing()
    await db
      .insert(orgNode)
      .values({ fromPeriod, unitId: COMPANY, kind: 'company', name: 'Pebble Vina' })
      .onConflictDoNothing()
    await db
      .insert(orgNode)
      .values({
        fromPeriod,
        unitId: DEPARTMENT,
        kind: 'department',
        name: 'Phòng Kinh doanh',
        parentId: COMPANY,
      })
      .onConflictDoNothing()
    await db
      .insert(orgMember)
      .values([
        { fromPeriod, actorId: CAST.director, unitId: COMPANY, head: true },
        { fromPeriod, actorId: CAST.head, unitId: DEPARTMENT, head: true },
        ...['u-nari', 'u-vita', 'u-vivian'].map((actorId) => ({
          fromPeriod,
          actorId,
          unitId: DEPARTMENT,
          head: false,
        })),
      ])
      .onConflictDoNothing()
  } finally {
    await close()
  }
}

/** Every foreign key between two seeded tables must point at an earlier table. */
async function checkOrder(url: string): Promise<number> {
  const { db, close } = await createDb(url)
  try {
    const result = (await db.execute(sql`
      SELECT cl.relnamespace::regnamespace::text || '.' || cl.relname AS child,
             pl.relnamespace::regnamespace::text || '.' || pl.relname AS parent
        FROM pg_constraint c
        JOIN pg_class cl ON cl.oid = c.conrelid
        JOIN pg_class pl ON pl.oid = c.confrelid
       WHERE c.contype = 'f' AND c.conrelid <> c.confrelid`)) as unknown as {
      rows: { child: string; parent: string }[]
    }
    const at = new Map(ORDER.map((k, i) => [qualified(TABLES[k]), i]))
    const wrong = result.rows.filter(
      (r) =>
        at.has(r.child) &&
        at.has(r.parent) &&
        at.get(r.parent)! > at.get(r.child)! &&
        `${r.child}>${r.parent}` !== CYCLE,
    )
    wrong.forEach((r) => say(`  FK ORDER: ${r.child} must come after ${r.parent}`))
    say(wrong.length === 0 ? 'FK order: ok' : `FK order: ${wrong.length} wrong`)
    return wrong.length
  } finally {
    await close()
  }
}

async function main(): Promise<void> {
  const base = arg('base')
  if (!base) throw new Error('--base <migrated pglite dir> is required')
  const keep = arg('keep')
  if (keep && existsSync(keep) && readdirSync(keep).length > 0) {
    throw new Error(`--keep ${keep} is not empty; refusing to overwrite it`)
  }
  const copy = keep ? resolve(keep) : mkdtempSync(join(tmpdir(), 'seed-quarter-'))
  cpSync(resolve(base), copy, { recursive: true })
  const url = `pglite://${copy}`
  say(`[harness] copy at ${copy}${keep ? ' (kept)' : ''}`)
  try {
    await plantSeats(url)
    await plantOrgTree(url)
    const emitters = arg('emitters')
    const today = arg('today') ?? dayOf(new Date())
    await run(['--apply', ...(emitters ? [`--emitters=${emitters}`] : []), `--today=${today}`], url)
    if ((await checkOrder(url)) > 0) process.exitCode = 1
  } finally {
    if (!keep) rmSync(copy, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
