import { CONFIG_PREFIX } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { configEntry } from '@api/branches/sales/config/config.schema'
import { sourceCost, sourceEvent, sourceFollower } from '@api/branches/sales/campaign/source.schema'
import { campaign } from '@api/branches/sales/campaign/campaign.schema'
import { eq } from 'drizzle-orm'
import { addDays, vnAt } from './clock'
import { COSTS } from './emit-funnel-data'
import { CAMPAIGNS, CAST } from './params'
import type { Ctx, World } from './types'

/** One `SOURCE` config row per campaign: the campaign page, its costs and
 *  `lead.campaign_id` all hang off it. `config_entry` is not a plan table, so
 *  the rows go in `afterWrite`; `planSources` is pure so the leads emitter can
 *  read the same ids without running after us. */

export type SourcePlan = { id: string; name: string; ord: number; fresh: boolean }

const PREFIX = CONFIG_PREFIX.SOURCE

/** An existing row of the same name is reused, so a seeded book that survived a
 *  reset (config is kept) does not collide on `config_name_live`. */
export function planSources(world: World): Map<string, SourcePlan> {
  const live = world.config.get('SOURCE') ?? []
  /* The app mints above the max over ALL rows, inactive included; a reused
     number would collide with a retired source's id or `ord`. */
  const all = world.allConfig.get('SOURCE')
  let seq = all?.maxSeq ?? 0
  let ord = all?.maxOrd ?? 0
  const plans = new Map<string, SourcePlan>()
  for (const c of CAMPAIGNS) {
    const found = live.find((r) => r.name.toLowerCase() === c.name.toLowerCase())
    if (found) {
      plans.set(c.key, { id: found.id, name: found.name, ord: found.ord, fresh: false })
      continue
    }
    seq += 1
    ord += 1
    const id = `${PREFIX}-${String(seq).padStart(2, '0')}`
    plans.set(c.key, { id, name: c.name, ord, fresh: true })
  }
  return plans
}

/** First day a campaign spends or sends: its window start, or a fortnight ago for a draft. */
export const startOf = (c: (typeof CAMPAIGNS)[number], today: string): string =>
  c.from ?? addDays(today, -14)

export async function writeSources(tx: Db, ctx: Ctx): Promise<void> {
  const plans = planSources(ctx.world)
  const rng = ctx.rng
  const fresh = CAMPAIGNS.flatMap((c) => {
    const p = plans.get(c.key)!
    return p.fresh
      ? [
          {
            id: p.id,
            list: 'SOURCE' as const,
            name: p.name,
            ord: p.ord,
            kind: c.event ? 'event' : 'campaign',
            ownerId: c.owner,
            createdAt: vnAt(addDays(startOf(c, ctx.today), -7), 9),
          },
        ]
      : []
  })
  if (fresh.length > 0) await tx.insert(configEntry).values(fresh)

  for (const c of CAMPAIGNS) {
    const sourceId = plans.get(c.key)!.id
    const code = ctx.ids.campaign.get(c.key)!
    await tx.update(campaign).set({ sourceId }).where(eq(campaign.code, code))
  }

  const start = (c: (typeof CAMPAIGNS)[number]): string => startOf(c, ctx.today)
  const costs = CAMPAIGNS.flatMap((c) =>
    (COSTS[c.key] ?? []).map((line) => ({
      sourceId: plans.get(c.key)!.id,
      kind: line.kind,
      label: line.label,
      amount: line.amount,
      spentOn: addDays(start(c), line.daysFromStart),
      createdAt: vnAt(addDays(start(c), line.daysFromStart), 10),
    })),
  )
  await tx.insert(sourceCost).values(costs)

  const events = CAMPAIGNS.flatMap((c) =>
    c.event
      ? [
          {
            sourceId: plans.get(c.key)!.id,
            venue: c.event.venue,
            registered: c.event.registered,
            checkedIn: c.event.checkedIn,
            heldOn: c.event.day,
          },
        ]
      : [],
  )
  if (events.length > 0) await tx.insert(sourceEvent).values(events).onConflictDoNothing()

  const followers = CAMPAIGNS.flatMap((c) => {
    const sourceId = plans.get(c.key)!.id
    const addedAt = vnAt(start(c), 9)
    const bd = rng.pick(CAST.bds.filter((id) => id !== c.owner))
    return [
      { sourceId, actorId: c.owner, addedAt },
      { sourceId, actorId: bd, addedAt },
    ]
  })
  await tx.insert(sourceFollower).values(followers).onConflictDoNothing()
}
