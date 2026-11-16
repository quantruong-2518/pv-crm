import { emailSuppression } from '@api/platform/mail/mail.schema'
import { emitCampaigns } from './emit-funnel-campaign'
import { emitMail } from './emit-funnel-mail'
import { membersOf, recipientsOf } from './emit-funnel-members'
import { writeSources } from './emit-funnel-sources'
import { linkCampaigns } from './emit-leads'
import type { Plan } from './plan'
import type { AfterWrite, Ctx } from './types'

/** Funnel: campaigns and their audience, then every mail wave with what its
 *  recipients did, then the SOURCE rows (costs, events, followers) in
 *  `afterWrite` because `config_entry` is not a plan table. Recipients come
 *  from the lead rows the leads emitter planned, so this runs after it. */

/** Suppressions are held back from the plan: the reset keeps `email_suppression`
 *  (it is the do-not-mail list), so a reseed meets last run's rows on the same
 *  `.example` addresses and a plain insert would fail on the primary key. */
const held = new WeakMap<Plan, Plan['emailSuppression']>()

export function emitFunnel(ctx: Ctx): void {
  const members = membersOf(ctx, recipientsOf(ctx))
  emitCampaigns(ctx, members)
  emitMail(ctx, members)
  held.set(ctx.plan, ctx.plan.emailSuppression.splice(0))
}

export const afterWrite: AfterWrite = async (tx, ctx) => {
  await writeSources(tx, ctx)
  /* Leads are written before the SOURCE rows exist, so their campaign link waits until here. */
  await linkCampaigns(tx, ctx)
  const rows = held.get(ctx.plan) ?? []
  for (let i = 0; i < rows.length; i += 500)
    await tx
      .insert(emailSuppression)
      .values(rows.slice(i, i + 500))
      .onConflictDoNothing()
}
