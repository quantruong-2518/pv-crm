import { dealHold } from './emit-deals-holds'
import { dealQuotes } from './emit-deals-quote'
import { dealAmount, emitContacts, emitDealRows, emitLanes, stageEvents } from './emit-deals-rows'
import { configApprovals, signApprovals } from './emit-deals-sign'
import { dealSteps } from './emit-deals-steps'
import { emitTouches } from './emit-deals-touch'
import { viewOf } from './emit-deals-view'
import type { Story } from './story.types'
import type { AfterWrite, Ctx } from './types'

/** Deals: every journey whose knobs carry a deal becomes an opportunity with its
 *  lanes, contacts, stage history, touches, quotation rounds, sign approvals,
 *  hold and next step; the growth journey of a customer is one more journey.
 *  The contract code of a won deal is minted HERE (the quotation row that won points
 *  at it) and left in `ctx.ids.contract` for the contracts emitter to reuse. */

const NAMES = ['Triển khai MES', 'Số hóa quản lý sản xuất', 'Quản lý chất lượng và truy xuất']

function emitJourney(ctx: Ctx, story: Story, growth: boolean): void {
  const op = ctx.mint('OP')
  ctx.ids.opportunity.set(story.key, op)
  const won = story.beats.some((b) => b.kind === 'signed')
  if (won) ctx.ids.contract.set(story.key, ctx.mint('HĐ'))
  const company = ctx.companies[story.knobs.company]
  const title = growth ? 'Mở rộng MES' : ctx.rng.pick(NAMES)
  const v = viewOf(ctx, story, op, `${company?.shortName ?? ''} · ${title}`)

  const hold = dealHold(v)
  const steps = dealSteps(v)
  const quotes = dealQuotes(v)
  const money = dealAmount(v)
  const history = stageEvents(v, hold)

  emitDealRows(v, money, history)
  emitLanes(v)
  emitContacts(v)
  ctx.plan.opportunityStageEvent.push(...history.events)
  emitTouches(v, steps.done)
  ctx.plan.touch.push(...quotes.touches)
  ctx.plan.quotation.push(...quotes.rows)
  if (money) {
    const lastRound = quotes.rows.reduce<(typeof quotes.rows)[number] | null>(
      (m, r) => (!m || r.roundNo > m.roundNo ? r : m),
      null,
    )
    const sign = signApprovals(v, quotes.kind, money.amount, lastRound?.id)
    ctx.plan.approval.push(...sign.approvals)
    ctx.plan.approvalLink.push(...sign.links)
  }
  if (hold) ctx.plan.hold.push(hold)
  if (steps.row) ctx.plan.nextStep.push(steps.row)
}

export function emitDeals(ctx: Ctx): void {
  for (const story of ctx.stories) {
    if (story.knobs.deal) emitJourney(ctx, story, false)
    const g = story.growth
    if (g?.knobs.deal) emitJourney(ctx, g, true)
  }
  configApprovals(ctx)
}

export const afterWrite: AfterWrite | undefined = undefined
