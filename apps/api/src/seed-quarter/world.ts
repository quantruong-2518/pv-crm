import { and, asc, eq, inArray, like, sql } from 'drizzle-orm'
import type { Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { identity } from '@api/platform/comms/comms.schema'
import { account } from '@api/branches/sales/account/account.schema'
import { configEntry } from '@api/branches/sales/config/config.schema'
import { lead } from '@api/branches/sales/lead/lead.schema'
import { leadOrigin } from '@api/branches/sales/lead-origin/lead-origin.schema'
import { CONFIG_PREFIX } from '@pv/contracts'
import * as params from './params'
import { CAST } from './params'
import { SCENARIOS } from './scenarios'
import type { ConfigLedger, ConfigRow, World } from './types'

/** Reads only. Throws if a cast seat is missing or locked, because every
 *  emitter names them by id and a foreign key would fail much later. */

const SEEDED_PREFIXES = ['EX', 'LR', 'QR', 'TN', 'SK', 'CK']
const LIST_OF = new Map(Object.entries(CONFIG_PREFIX).map(([list, prefix]) => [prefix, list]))

/** Config ids that `params.ts` / `scenarios.ts` name but the target lacks or has
 *  switched off. Found by scanning the data itself, so a new id needs no list. */
export function staleConfigIds(world: World): { missing: string[]; inactive: string[] } {
  const named = JSON.stringify([params, SCENARIOS]).match(
    new RegExp(`\\b(?:${SEEDED_PREFIXES.join('|')})-\\d{2,4}\\b`, 'g'),
  )
  const stale = { missing: [] as string[], inactive: [] as string[] }
  for (const id of [...new Set(named ?? [])].sort()) {
    const list = LIST_OF.get(id.split('-')[0]!)!
    if (!world.allConfig.get(list)?.ids.has(id)) stale.missing.push(id)
    else if (!world.config.get(list)?.some((r) => r.id === id)) stale.inactive.push(id)
  }
  return stale
}

export const castIds = (): string[] =>
  [...new Set([CAST.director, CAST.head, ...Object.values(CAST).flat()])] as string[]

export async function readWorld(db: Db): Promise<World> {
  const ids = castIds()
  const rows = await db.select().from(actor).where(inArray(actor.id, ids))
  const actors = new Map(rows.map((a) => [a.id, a]))
  const absent = ids.filter((id) => !actors.get(id) || actors.get(id)!.disabledAt)
  if (absent.length > 0) throw new Error(`Thiếu tài khoản (hoặc đang khoá): ${absent.join(', ')}`)

  const entries = await db
    .select({
      id: configEntry.id,
      list: configEntry.list,
      name: configEntry.name,
      ord: configEntry.ord,
      kind: configEntry.kind,
      stage: configEntry.stage,
      ownerId: configEntry.ownerId,
      doNotContact: configEntry.doNotContact,
      parentId: configEntry.parentId,
      criterionId: configEntry.criterionId,
    })
    .from(configEntry)
    .where(eq(configEntry.active, true))
    .orderBy(asc(configEntry.list), asc(configEntry.ord))
  const config = new Map<string, ConfigRow[]>()
  for (const { list, ...row } of entries) config.set(list, [...(config.get(list) ?? []), row])

  const everyRow = await db
    .select({ id: configEntry.id, list: configEntry.list, ord: configEntry.ord })
    .from(configEntry)
  const allConfig = new Map<string, ConfigLedger>()
  for (const { id, list, ord } of everyRow) {
    const ledger = allConfig.get(list) ?? { ids: new Set<string>(), maxSeq: 0, maxOrd: 0 }
    ledger.ids.add(id)
    ledger.maxSeq = Math.max(ledger.maxSeq, Number(id.split('-')[1]) || 0)
    ledger.maxOrd = Math.max(ledger.maxOrd, ord)
    allConfig.set(list, ledger)
  }

  const origins = new Map((await db.select().from(leadOrigin)).map((o) => [o.name, o.id]))
  const seats = await db
    .select({ id: identity.id, actorId: identity.actorId })
    .from(identity)
    .where(and(eq(identity.side, 'member'), inArray(identity.actorId, ids)))
  const count = async (q: Promise<{ n: number }[]>): Promise<number> => (await q)[0]?.n ?? 0
  const leads = db
    .select({ n: sql<number>`count(*)::int` })
    .from(lead)
    .where(like(lead.email, '%.example'))
  const accounts = db
    .select({ n: sql<number>`count(*)::int` })
    .from(account)
    .where(like(account.website, '%.example'))

  return {
    actors: new Map(
      rows.map((a) => [a.id, { id: a.id, name: a.name, email: a.email, roleIds: a.roleIds }]),
    ),
    config,
    allConfig,
    industries: config.get('INDUSTRY') ?? [],
    origins,
    products: config.get('PRODUCT') ?? [],
    seatIdentity: new Map(seats.map((s) => [s.actorId!, s.id])),
    seeded: { leads: await count(leads), accounts: await count(accounts) },
  }
}
