import type { StageKey } from '@pv/contracts'
import { MILESTONE_TOUCH, NOTE } from '@api/branches/sales/opportunity/opportunity.mapper'
import { HEAD, idOf, plusHours, vn, vnDay, type Key } from './cast'
import type { DealSpec } from './book'
import { plantApprovals, plantContract } from './plant-contract'
import { plantDemos, plantTalks } from './plant-talk'
import { pushTouch, type Ctx, type Hand } from './plan'

/** One deal's walk, written the way the stage writer writes it (ADR 0071,
 *  0072): BD opens it at `new`, the head's accept moves it to `assigned` and
 *  puts the Sale on, the first care activity moves it to `engaged`, the
 *  quotation to `quotation`, and a signature or a stop takes it off the board.
 *  Never born accepted, so `opportunity-accept-rate` and `accept-lag-days`
 *  count every one of them. */

export type LeadFrame = {
  ld: string
  ws: string
  ac: string
  company: string
  contactCode: string
  contactName: string
}

const DAY = 86_400_000
export const CONTRACT_KIND = 'CK-02'

type Move = { at: Date; from: StageKey | null; to: StageKey; by: Hand }

/** Returns the signature's instant, or null when the deal was not signed. */
export function plantDeal(ctx: Ctx, frame: LeadFrame, d: DealSpec, k: number): Date | null {
  const { plan, mint, hand } = ctx
  const op = mint('OP')
  const name = `${frame.company} · ${k === 0 ? 'Triển khai MES' : 'Mở rộng MES'}`
  const opener = hand(idOf(d.by))
  const sale = d.sale ? hand(idOf(d.sale)) : null
  const acceptor = d.accepted ? hand(d.accepted.by === 'grace' ? HEAD : idOf('head2')) : null
  const opened = vn(d.opened)
  const signedAt = d.signed ? vn(d.signed.at) : null
  const lostAt = d.lost ? vn(d.lost.at) : null
  const closedAt = signedAt ?? lostAt
  const amount = d.quoted?.amount ?? d.amount ?? null
  const currency: 'VND' | 'USD' = d.currency ?? 'VND'
  const worker = sale ?? opener
  const deal = { code: op, kind: 'opportunity' as const }
  const lead = { code: frame.ld, kind: 'lead' as const }

  const moves: Move[] = [{ at: opened, from: null, to: 'new', by: opener }]
  const step = (at: string | undefined, to: StageKey, by: Hand | null) => {
    if (at && by) moves.push({ at: vn(at), from: moves.at(-1)!.to, to, by })
  }
  step(d.accepted?.at, 'assigned', acceptor)
  step(d.engaged, 'engaged', sale)
  step(d.quoted?.at, 'quotation', sale)
  const last = moves.at(-1)!
  moves.forEach((m, n) =>
    plan.moves.push({
      opportunityCode: op,
      at: m.at,
      fromStage: m.from,
      toStage: m.to,
      daysInFrom: n === 0 ? null : Math.round((m.at.getTime() - moves[n - 1]!.at.getTime()) / DAY),
      byId: m.by.id,
      by: m.by.name,
    }),
  )
  if (closedAt) {
    plan.moves.push({
      opportunityCode: op,
      at: closedAt,
      fromStage: last.to,
      toStage: null,
      daysInFrom: Math.round((closedAt.getTime() - last.at.getTime()) / DAY),
      byId: worker.id,
      by: worker.name,
    })
  }

  if (k === 0)
    pushTouch(ctx, lead, 'tier-raised', opened, opener, 'Đủ ô bắt buộc', { toTier: 'sql' })
  pushTouch(ctx, lead, 'entered-pipeline', opened, opener, NOTE.promoted(op, name))
  pushTouch(ctx, deal, 'entered-pipeline', opened, opener, NOTE.opened(frame.ld))
  if (d.accepted && acceptor) {
    pushTouch(
      ctx,
      deal,
      'stage-changed',
      vn(d.accepted.at),
      acceptor,
      NOTE.moved('new', 'assigned'),
    )
  }
  if (d.engaged && sale) {
    pushTouch(ctx, deal, MILESTONE_TOUCH.sample, vn(d.engaged), sale, NOTE.milestone('sample'))
  }
  if (d.quoted && sale) {
    const at = vn(d.quoted.at)
    pushTouch(ctx, deal, MILESTONE_TOUCH.quotation, at, sale, NOTE.milestone('quotation'))
  }
  if (d.lost) pushTouch(ctx, deal, 'exited', lostAt!, worker, NOTE.stopped(d.lost.reason))

  plan.objects.push({
    code: op,
    kind: 'OP',
    branch: 'Sales',
    label: name,
    owner: worker.name,
    ownerId: worker.id,
    state: closedAt ? null : last.to,
    amount,
  })
  plan.edges.push({ fromCode: frame.ld, toCode: op, kind: 'spawned' })
  plan.deals.push({
    code: op,
    leadCode: frame.ld,
    state: lostAt ? 'lost' : 'open',
    stage: closedAt ? null : last.to,
    stageSince: closedAt ? null : last.at,
    name,
    accountCode: frame.ac,
    workstreamCode: frame.ws,
    amount,
    currency: amount === null ? null : currency,
    expectedClose: vnDay(closedAt ?? new Date(opened.getTime() + 45 * DAY)),
    probability: signedAt ? 100 : lostAt ? 0 : 50,
    closedAt,
    stoppedAtStage: lostAt ? last.to : null,
    stopReason: d.lost?.reason ?? null,
    acceptedById: acceptor?.id ?? null,
    acceptedAt: d.accepted ? vn(d.accepted.at) : null,
    createdAt: opened,
  })
  const lanes: Lane[] = [
    ...(d.by.startsWith('bd')
      ? [{ actorId: opener.id, role: 'BD' as const, isPrimary: false }]
      : []),
    ...(sale ? [{ actorId: sale.id, role: 'SALE' as const, isPrimary: true }] : []),
  ]
  lanes.forEach((l) => plan.owners.push({ opportunityCode: op, ...l }))

  const frameDeal: DealFrame = { ...frame, op, name, amount, currency, sale: worker, lanes }
  const hd = d.signed && amount !== null ? plantContract(ctx, frameDeal, d.signed, amount) : null
  plantQuotation(ctx, frameDeal, d, hd)
  plantApprovals(ctx, frameDeal, d)
  plantDemos(ctx, frameDeal, d, lostAt)
  plantTalks(ctx, frameDeal, d.talks ?? [], (key?: Key) => (key ? hand(idOf(key)) : worker))
  return signedAt
}

export type DealFrame = LeadFrame & {
  op: string
  name: string
  amount: number | null
  currency: 'VND' | 'USD'
  sale: Hand
  lanes: Lane[]
}

type Lane = { actorId: string; role: 'BD' | 'SALE'; isPrimary: boolean }

/** One round per quoted deal: won by the signature, closed by the stop, or still waiting. */
function plantQuotation(ctx: Ctx, f: DealFrame, d: DealSpec, hd: string | null): void {
  if (!d.quoted) return
  const sentAt = vn(d.quoted.at)
  const closedAt = d.signed ? vn(d.signed.at) : d.lost ? vn(d.lost.at) : null
  ctx.plan.quotations.push({
    opportunityCode: f.op,
    kind: CONTRACT_KIND,
    negotiationNo: 1,
    roundNo: 1,
    amount: d.quoted.amount,
    currency: f.currency,
    sentAt,
    validUntil: vnDay(plusHours(sentAt, 30 * 24)),
    source: 'manual',
    outcome: d.signed ? 'won' : d.lost ? 'not-closed' : 'pending',
    closedAt,
    stopReasonKey: d.lost && !d.signed ? d.lost.reason : null,
    contractCode: hd,
    createdBy: f.sale.id,
  })
}
