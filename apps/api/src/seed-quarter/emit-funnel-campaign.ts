import { addDays, vnAt } from './clock'
import { PAGE } from './emit-funnel-data'
import { wavesOf, type Member } from './emit-funnel-members'
import { CAMPAIGNS } from './params'
import { startOf } from './emit-funnel-sources'
import type { Ctx } from './types'

/** Campaign rows and their frozen audience. `source_id` is filled in
 *  `afterWrite`, once the SOURCE config rows exist. */

export function emitCampaigns(ctx: Ctx, members: Map<string, Member[]>): void {
  const { plan, world } = ctx
  for (const c of CAMPAIGNS) {
    const code = ctx.ids.campaign.get(c.key)!
    const page = PAGE[c.key]!
    const start = startOf(c, ctx.today)
    const waves = wavesOf(c, ctx.today)
    const lastSend = waves.flatMap((w) => (w.sendAt ? [w.sendAt] : [])).at(-1)
    plan.campaign.push({
      code,
      name: c.name,
      slogan: page.slogan,
      ownerId: c.owner,
      state: c.state,
      endsOn: c.to && c.to !== 'today' ? c.to : null,
      originId: world.origins.get(page.origin) ?? null,
      createdAt: vnAt(addDays(start, -7), 9),
      updatedAt: lastSend ?? vnAt(addDays(start, -7), 9),
    })
    for (const m of members.get(c.key) ?? [])
      plan.campaignMember.push({
        campaignCode: code,
        leadCode: m.who.code,
        addedAt: m.addedAt,
        state: m.removed ? 'REMOVED' : 'ACTIVE',
      })
  }
}
