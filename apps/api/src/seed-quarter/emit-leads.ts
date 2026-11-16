import { normalisePhone } from '@pv/contracts'
import { normalisePhone as phoneKeyOf } from '@pv/engines'
import { sql } from 'drizzle-orm'
import { planSources } from './emit-funnel-sources'
import { syncClosed } from '@api/branches/sales/workstream/workstream-sync'
import { emitContacts, emitHolds, emitNextSteps } from './emit-leads-side'
import { pickOrigin, profileOf } from './emit-leads-profile'
import { replay } from './emit-leads-replay'
import type { Story } from './story.types'
import type { Db } from '@api/platform/db/db.module'
import type { AfterWrite, Ctx } from './types'

/** One journey becomes one workstream and one lead, replayed beat by beat.
 *  The same person in two journeys of a company is two contact rows, because a
 *  contact hangs off a lead. Meetings on the lead belong to the comms emitter. */

function emitJourney(ctx: Ctx, story: Story): void {
  const k = story.knobs
  const company = ctx.companies[k.company]!
  const person = company.contacts[story.contact]!
  const ws = ctx.mint('WS')
  const ld = ctx.mint('LD')
  ctx.ids.workstream.set(story.key, ws)
  ctx.ids.lead.set(story.key, ld)

  const f = replay(ctx, story, ld)
  emitNextSteps(ctx, story, ld, f)
  emitContacts(ctx, story, ld)
  emitHolds(ctx, story, ld)
  f.touches.sort((a, b) => a.at.getTime() - b.at.getTime())
  const lastTouchAt = f.touches.reduce((m, t) => (t.at > m ? t.at : m), story.bornAt)

  const owner = f.ownerId ? ctx.world.actors.get(f.ownerId) : undefined
  const profile = profileOf(ctx.rng, company, person, f.tier)
  const partnerCode =
    k.motion === 'PARTNER' && k.partner !== null ? ctx.ids.partner[k.partner] : null
  const partnerRow = ctx.plan.partner.find((p) => p.code === partnerCode)
  const account = ctx.ids.account[company.index]!

  ctx.plan.workstream.push({ code: ws, accountCode: account, openedAt: story.bornAt })
  ctx.plan.object.push({
    code: ld,
    kind: 'LD',
    branch: 'Sales',
    label: company.shortName,
    owner: owner?.name,
    ownerId: owner?.id,
    state: f.state,
  })
  ctx.plan.edge.push({ fromCode: ld, toCode: account, kind: 'belongs-to' })
  if (company.industryId) {
    ctx.plan.leadIndustry.push({ leadCode: ld, industryId: company.industryId })
  }
  ctx.plan.lead.push({
    code: ld,
    createdAt: story.bornAt,
    createdBy: k.marketer,
    accountCode: account,
    workstreamCode: ws,
    company: company.shortName,
    ...profile,
    phone: profile.phone ? normalisePhone(profile.phone) : null,
    phoneKey: profile.phone ? phoneKeyOf(profile.phone) : null,
    contactName: person.name,
    email: person.email,
    ownerId: f.ownerId,
    bdOwnerId: f.bdOwnerId,
    marketingOwnerId: k.marketer,
    tier: f.tier,
    state: f.state,
    stateSince: f.stateSince,
    sourceKind: k.sourceKind,
    motion: k.motion,
    originId: partnerRow?.originId ?? pickOrigin(ctx, k),
    partnerCode,
    lastTouchAt,
    exitReason: f.exit?.reasonId ?? null,
    exitedAt: f.exit?.at ?? null,
    recontactOn: f.recontactOn,
    repliedFromPoolAt: f.repliedFromPoolAt,
    disabledAt: f.disabled?.at ?? null,
    disabledBy: f.disabled?.by ?? null,
  })
  ctx.plan.touch.push(...f.touches)
}

export function emitLeads(ctx: Ctx): void {
  for (const story of ctx.stories) {
    emitJourney(ctx, story)
    /* A re-buy is a second deal on the same lead and journey (ADR 0121 §6): no rows, only its codes. */
    if (story.growth) {
      ctx.ids.workstream.set(story.growth.key, ctx.ids.workstream.get(story.key)!)
      ctx.ids.lead.set(story.growth.key, ctx.ids.lead.get(story.key)!)
    }
  }
}

/** The SOURCE rows are written in the funnel's `afterWrite`, after every plan
 *  row, so `lead.campaign_id` cannot ride the insert (its FK is immediate). This
 *  links it once the rows exist and does nothing before, so it works from either hook. */
export async function linkCampaigns(tx: Db, ctx: Ctx): Promise<void> {
  const sources = planSources(ctx.world)
  const byCampaign = new Map<string, string[]>()
  for (const s of ctx.stories) {
    const key = s.knobs.campaign
    if (key) byCampaign.set(key, [...(byCampaign.get(key) ?? []), ctx.ids.lead.get(s.key)!])
  }
  for (const [key, codes] of byCampaign) {
    const id = sources.get(key)!.id
    await tx.execute(sql`UPDATE sales.lead SET campaign_id = ${id}
      WHERE code IN (${sql.join(
        codes.map((c) => sql`${c}`),
        sql`, `,
      )})
        AND EXISTS (SELECT 1 FROM sales.config_entry WHERE id = ${id} AND list = 'SOURCE')`)
  }
}

/** The deal, contract and comms emitters add lead touches after this one, so the
 *  column the book sorts by is set from the rows, once they are all in. */
async function settleLastTouch(tx: Db): Promise<void> {
  await tx.execute(sql`UPDATE sales.lead l SET last_touch_at = t.last_at
    FROM (SELECT subject_code, max("at") AS last_at FROM sales.touch
           WHERE subject_kind = 'lead' GROUP BY subject_code) t
    WHERE t.subject_code = l.code AND l.last_touch_at IS DISTINCT FROM t.last_at`)
}

/** A run's closed marks are the product's own fold over its objects, so the
 *  seed asks it once at the end rather than deciding it a second time. */
export const afterWrite: AfterWrite = async (tx, ctx) => {
  await linkCampaigns(tx, ctx)
  await settleLastTouch(tx)
  await syncClosed(tx, [...new Set(ctx.ids.workstream.values())])
}
