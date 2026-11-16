import type { OppStage } from './story.types'
import { NOTE, stageEventOf } from '@api/branches/sales/opportunity/opportunity.mapper'
import { addDays, dayOf } from './clock'
import type { HoldRow } from './emit-deals-holds'
import { beatsOf, handOf, type DealView } from './emit-deals-view'

/** The deal itself: opportunity row, lanes, contacts, stage history, object
 *  mirror and the lead -> deal edge. Won is `state = 'open'` with the stage
 *  cleared and `closed_at` = the signing instant (`closeForSign`); the contract
 *  and its edge belong to the contracts emitter. */

const PROBABILITY: Record<OppStage, number> = { new: 10, assigned: 25, engaged: 40, quotation: 60 }

/** What the stage move at instant `t` was, so the history says the same as the timeline. */
export function moveNote(v: DealView, t: number, from: OppStage, to: OppStage): string {
  const act = beatsOf(v.story, 'activity').find((a) => a.at.getTime() === t)
  if (act) return NOTE.milestone(act.activity)
  if (beatsOf(v.story, 'quote').some((q) => q.at.getTime() === t))
    return NOTE.milestone('quotation')
  return NOTE.moved(from, to)
}

/** The stage clock after a resumed hold: the real end door pushes `stage_since` forward. */
function shifted(hold: HoldRow | null, start: Date, until: Date): Date {
  if (!hold?.endedAt || hold.endKind !== 'resumed') return start
  const inside = hold.setAt && hold.setAt >= start && hold.endedAt <= until
  const held = inside && hold.setAt ? hold.endedAt.getTime() - hold.setAt.getTime() : 0
  return new Date(Math.min(until.getTime(), start.getTime() + held))
}

export function stageEvents(v: DealView, hold: HoldRow | null) {
  const out = [
    stageEventOf({
      code: v.op,
      from: null,
      to: 'new',
      stageSince: null,
      at: v.opened.at,
      by: v.hand(v.opened.by),
      note: NOTE.opened(v.ld),
    }),
  ]
  let since = v.opened.at
  let stage: OppStage = 'new'
  for (const m of v.moves) {
    out.push(
      stageEventOf({
        code: v.op,
        from: m.from,
        to: m.to,
        stageSince: shifted(hold, since, m.at),
        at: m.at,
        by: v.hand(m.by),
        note: moveNote(v, m.at.getTime(), m.from, m.to),
      }),
    )
    since = m.at
    stage = m.to
  }
  const exit = v.lost
    ? {
        at: v.lost.at,
        by: v.lost.by,
        note: NOTE.stopped(v.lost.reasonKey, v.stopNote ?? undefined),
      }
    : v.signed && v.ctx.ids.contract.get(v.story.key)
      ? {
          at: v.signed.at,
          by: v.signed.by,
          note: NOTE.signed(v.ctx.ids.contract.get(v.story.key)!),
        }
      : null
  if (exit) {
    out.push(
      stageEventOf({
        code: v.op,
        from: stage,
        to: null,
        stageSince: shifted(hold, since, exit.at),
        at: exit.at,
        by: v.hand(exit.by),
        note: exit.note,
      }),
    )
  }
  return { events: out, stage, since: shifted(hold, since, v.ctx.now) }
}

type OppAmount = { amount: number; currency: 'VND' | 'USD' } | null

export function dealAmount(v: DealView): OppAmount {
  const quotes = beatsOf(v.story, 'quote')
  const value = v.signed?.value ?? quotes.at(-1)?.amount ?? v.story.amount
  return value > 0 ? { amount: value, currency: v.d.currency } : null
}

export function emitDealRows(
  v: DealView,
  money: OppAmount,
  at: { stage: OppStage; since: Date },
): void {
  const { ctx } = v
  const closed = v.closedAt !== null
  const { stage, since } = at
  const holder = v.accepted ? v.finalSale : (v.d.bd ?? v.story.knobs.worker)
  const holderHand = holder ? handOf(ctx, holder) : null
  const lostAtStage = v.lost ? stage : null
  const doneDay = v.closedAt ? dayOf(v.closedAt) : null
  const open = addDays(dayOf(v.opened.at), 45)
  const expectedClose =
    doneDay ?? (open < ctx.today ? addDays(ctx.today, 7 + ctx.rng.int(0, 21)) : open)
  ctx.plan.object.push({
    code: v.op,
    kind: 'OP',
    branch: 'Sales',
    label: v.name,
    owner: holderHand?.name ?? null,
    ownerId: holderHand?.id ?? null,
    state: closed ? null : stage,
    amount: money?.amount ?? null,
  })
  ctx.plan.edge.push({ fromCode: v.ld, toCode: v.op, kind: 'spawned' })
  ctx.plan.opportunity.push({
    code: v.op,
    leadCode: v.ld,
    state: v.lost ? 'lost' : 'open',
    stage: closed ? null : stage,
    stageSince: closed ? null : since,
    name: v.name,
    accountCode: v.ac,
    workstreamCode: v.ws,
    amount: money?.amount ?? null,
    currency: money?.currency ?? null,
    expectedClose,
    probability: v.signed ? 100 : v.lost ? 0 : PROBABILITY[stage],
    closedAt: v.closedAt,
    stoppedAtStage: lostAtStage,
    stopReason: v.lost?.reasonKey ?? null,
    stopNote: v.lost ? v.stopNote : null,
    acceptedById: v.accepted?.by ?? null,
    acceptedAt: v.accepted?.at ?? null,
    createdAt: v.opened.at,
  })
}

export function emitLanes(v: DealView): void {
  const { ctx, op } = v
  const bd = v.d.bd ?? v.story.knobs.worker
  if (v.accepted) {
    ctx.plan.opportunityOwner.push({
      opportunityCode: op,
      actorId: v.finalSale,
      role: 'SALE',
      isPrimary: true,
    })
  }
  if (bd)
    ctx.plan.opportunityOwner.push({
      opportunityCode: op,
      actorId: bd,
      role: 'BD',
      isPrimary: false,
    })
  if (v.accepted && v.d.presales) {
    ctx.plan.opportunityOwner.push({
      opportunityCode: op,
      actorId: v.d.presales,
      role: 'PRESALES',
      isPrimary: false,
    })
  }
}

const ROLES = ['user', 'influencer'] as const

/** The decision-maker is primary; up to two more contacts of the lead join.
 *  `ctx.ids.contact` keeps only the first journey's codes, so the lead's own
 *  contact rows are read back from the plan. */
export function emitContacts(v: DealView): void {
  const { ctx, company } = v
  const rows = ctx.plan.contact.filter((c) => c.leadCode === v.ld)
  const boss = new Set(company.contacts.filter((c) => c.isDecisionMaker).map((c) => c.name))
  const dm = rows.find((c) => boss.has(c.name)) ?? rows.find((c) => c.isPrimary) ?? rows[0]
  if (!dm) throw new Error(`deals: no contact row for lead ${v.ld} (${v.story.key})`)
  const others = rows.filter((c) => c !== dm)
  const joined: typeof rows = []
  for (let n = ctx.rng.int(0, Math.min(2, others.length)); n > 0; n--) {
    joined.push(...others.splice(ctx.rng.int(0, others.length - 1), 1))
  }
  ;[dm, ...joined].forEach((c, n) => {
    ctx.plan.opportunityContact.push({
      opportunityCode: v.op,
      contactCode: c.code,
      role: n === 0 ? 'decision-maker' : ROLES[(n - 1) % 2]!,
      isPrimary: n === 0,
    })
  })
}
