import { ConfigProposalChange, type ContractSignProposal } from '@pv/contracts'
import type { approval, approvalLink } from '@api/platform/approval/approval.schema'
import { addDays, dayOf, vnAt } from './clock'
import { creditsOf } from './emit-contracts-credits'
import { beatsOf, handOf, COLLECTOR_FALLBACK, type DealView } from './emit-deals-view'
import { CAST } from './params'
import type { Ctx } from './types'

/** Sign approvals follow the real chain: one director link, so the decider is
 *  always the director even where the generator's `sign-decided` names the head
 *  (the head signs directly, she is never asked). The payload is parsed with
 *  the contract the inbox reads it back through. */

export type ApprovalRow = typeof approval.$inferInsert
export type LinkRow = typeof approvalLink.$inferInsert

const money = (n: number, currency: string): string =>
  `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ${currency}`

export const labelOf = (n: number, of: number): string =>
  n === 0 ? 'Tạm ứng khi ký' : n === of - 1 ? 'Nghiệm thu cuối' : `Đợt ${n + 1}`

type Term = { share: number; due: Date }

/** The schedule of the contract this deal signs; a 30/70 stand-in for a deal
 *  that still waits, which has no contract story yet. */
function termsOf(v: DealView, from: Date): Term[] {
  const own = beatsOf(v.story, 'installment').map((b) => ({ share: b.share, due: vnAt(b.due, 12) }))
  if (own.length > 0) return own
  return [
    { share: 30, due: vnAt(addDays(dayOf(from), 30), 12) },
    { share: 70, due: vnAt(addDays(dayOf(from), 90), 12) },
  ]
}

export function scheduleOf(terms: Term[], amount: number) {
  let left = amount
  return terms.map((t, n) => {
    const part = n === terms.length - 1 ? left : Math.round((amount * t.share) / 100)
    left -= part
    return {
      label: labelOf(n, terms.length),
      share: t.share,
      amount: part,
      due: t.due.toISOString(),
    }
  })
}

/** The door stamps `signedAt` when the person presses sign, so a request that
 *  has waited is moved to the last days: nobody leaves one waiting for weeks. */
function recentRaise(v: DealView, at: Date): Date {
  const { ctx } = v
  if (at.getTime() >= vnAt(addDays(ctx.today, -6), 0).getTime()) return at
  const day = addDays(ctx.today, -ctx.rng.int(1, 6))
  const raised = vnAt(day, 9 + ctx.rng.int(0, 8), ctx.rng.int(0, 59))
  return new Date(Math.min(ctx.now.getTime(), Math.max(at.getTime(), raised.getTime())))
}

export function signApprovals(
  v: DealView,
  kind: { id: string; name: string },
  amount: number,
  quotationId?: string,
): { approvals: ApprovalRow[]; links: LinkRow[] } {
  const asks = beatsOf(v.story, 'sign-requested')
  const answers = beatsOf(v.story, 'sign-decided')
  const approvals: ApprovalRow[] = []
  const links: LinkRow[] = []
  const director = handOf(v.ctx, CAST.director)
  const collector = handOf(v.ctx, v.story.knobs.contract?.collector ?? COLLECTOR_FALLBACK)
  const lane = v.ctx.plan.opportunityOwner
    .filter((o) => o.opportunityCode === v.op)
    .map((o) => o.actorId)
  asks.forEach((ask, i) => {
    const answer = answers[i]
    const state = answer ? (answer.approved ? 'approved' : 'rejected') : 'waiting'
    /* The raiser of the approved request is the closer the contract names. */
    const by = v.hand(state === 'approved' && v.signed ? v.signed.by : ask.by)
    const raisedAt = state === 'waiting' ? recentRaise(v, ask.at) : ask.at
    const credits = creditsOf(v.ctx, v.story.key, by.id, lane)
    /* Typed, not parsed: the count pass mints placeholder codes, and the schema rejects an absent credit split. */
    const sign: ContractSignProposal = {
      opportunityCode: v.op,
      sign: {
        amount,
        currency: v.d.currency,
        kind: kind.id,
        signedAt: raisedAt.toISOString(),
        collectorId: collector.id,
        ...(quotationId ? { quotationId } : {}),
        installments: scheduleOf(termsOf(v, raisedAt), amount),
        ...(credits ? { credits } : {}),
      },
    }
    const id = v.ctx.rng.uuid()
    approvals.push({
      id,
      kind: 'contract-sign',
      state,
      raisedById: by.id,
      raisedBy: by.name,
      raisedAt,
      consequence: `Ký hợp đồng ${kind.name} cho cơ hội ${v.op} · ${v.company.shortName} · ${money(amount, v.d.currency)} · ${collector.name} thu tiền`,
      payload: sign,
      chain: [{ role: 'director', person: director.name, personId: director.id, state }],
      decidedAt: answer?.at ?? null,
      decidedBy: answer ? director.name : null,
      decidedReason:
        state === 'rejected' ? (answer?.reason ?? 'Cần bổ sung phụ lục phạm vi.') : null,
    })
    links.push({ requestId: id, objectCode: v.op, objectLabel: v.name })
  })
  return { approvals, links }
}

type FreshnessAsk = {
  warn: number
  alert: number
  daysAgo: number
  state: NonNullable<ApprovalRow['state']>
}

/* No approved one: approving writes a platform setting that a reset would not keep. */
const FRESHNESS: FreshnessAsk[] = [
  { warn: 5, alert: 8, daysAgo: 1, state: 'waiting' },
  { warn: 10, alert: 14, daysAgo: 5, state: 'rejected' },
]

/** Two requests to change the deal-freshness thresholds, one waiting and one
 *  rejected, from the head to the director: the one setting harmless to leave. */
export function configApprovals(ctx: Ctx): void {
  const head = handOf(ctx, CAST.head)
  const director = handOf(ctx, CAST.director)
  for (const ask of FRESHNESS) {
    const change = ConfigProposalChange.parse({
      kind: 'activity-freshness',
      value: { warnDays: ask.warn, alertDays: ask.alert },
    })
    const raisedAt = vnAt(
      addDays(ctx.today, -ask.daysAgo),
      9 + ctx.rng.int(0, 6),
      ctx.rng.int(0, 59),
    )
    const decided = ask.state !== 'waiting'
    ctx.plan.approval.push({
      id: ctx.rng.uuid(),
      kind: 'config-change',
      state: ask.state,
      raisedById: head.id,
      raisedBy: head.name,
      raisedAt,
      consequence: `Đổi ngưỡng hoạt động của cơ hội: vàng từ ${ask.warn} ngày, đỏ từ ${ask.alert} ngày`,
      payload: change,
      chain: [{ role: 'director', person: director.name, personId: director.id, state: ask.state }],
      decidedAt: decided ? new Date(raisedAt.getTime() + ctx.rng.int(2, 20) * 3_600_000) : null,
      decidedBy: decided ? director.name : null,
      decidedReason: ask.state === 'rejected' ? 'Giữ ngưỡng cũ để đội quen nhịp chăm khách.' : null,
    })
  }
}
