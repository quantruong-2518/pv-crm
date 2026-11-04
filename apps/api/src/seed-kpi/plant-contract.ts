import { randomUUID } from 'node:crypto'
import type { ContractSignProposal } from '@pv/contracts'
import { NOTE } from '@api/branches/sales/opportunity/opportunity.mapper'
import { DIRECTOR, HEAD, plusHours, vn } from './cast'
import type { DealSpec, Term } from './book'
import { CONTRACT_KIND, type DealFrame } from './plant-deal'
import { pushTouch, type Ctx } from './plan'

/** The signature and the money: the contract with its lanes snapshot (ADR
 *  0086), its schedule, and the sign requests the director decided — the
 *  facts behind `signed-value`, `collected-value`, `overdue-receivables` and
 *  `approval-turnaround-hours`. The head of sales collects every paper, as
 *  the owner asked: the real seats stay the ones that act on money. */

const DAY = 86_400_000

const labelOf = (n: number, of: number): string =>
  n === 0 ? 'Tạm ứng khi ký' : n === of - 1 ? 'Nghiệm thu cuối' : `Đợt ${n + 1}`

/** Shares as given; the last instalment takes the rounding so both sums close. */
function scheduleOf(terms: readonly Term[], amount: number) {
  let left = amount
  return terms.map((t, n) => {
    const part = n === terms.length - 1 ? left : Math.round((amount * t.share) / 100)
    left -= part
    return { ...t, amount: part, label: labelOf(n, terms.length), due: vn(t.due) }
  })
}

export function plantContract(
  ctx: Ctx,
  f: DealFrame,
  signed: NonNullable<DealSpec['signed']>,
  amount: number,
): string {
  const { plan, mint } = ctx
  const hd = mint('HĐ')
  const signedAt = vn(signed.at)
  plan.objects.push({
    code: hd,
    kind: 'HĐ',
    branch: 'Sales',
    label: f.name,
    owner: f.sale.name,
    ownerId: f.sale.id,
    amount,
  })
  plan.edges.push({ fromCode: f.op, toCode: hd, kind: 'spawned' })
  plan.contracts.push({
    code: hd,
    opportunityCode: f.op,
    leadCode: f.ld,
    amount,
    currency: f.currency,
    signedAt,
    ownerId: f.sale.id,
    collectorId: HEAD,
    workstreamCode: f.ws,
    kind: CONTRACT_KIND,
  })
  f.lanes.forEach((l) => plan.participants.push({ contractCode: hd, ...l }))
  scheduleOf(signed.terms, amount).forEach((t, n) => {
    const paidAt = t.paid ? vn(t.paid) : null
    plan.terms.push({
      contractCode: hd,
      no: n + 1,
      label: t.label,
      share: t.share,
      amount: t.amount,
      due: t.due,
      paidAt,
      paidById: paidAt ? HEAD : null,
      paidRecordedAt: paidAt,
    })
    if (t.excused) {
      plan.excuses.push({
        contractCode: hd,
        installmentNo: n + 1,
        due: t.due,
        reason: 'Khách xin lùi hạn vì chờ ngân sách quý IV.',
        writtenById: f.sale.id,
        writtenAt: new Date(t.due.getTime() + DAY),
        state: 'approved',
        decidedById: HEAD,
        decidedAt: new Date(t.due.getTime() + 2 * DAY),
      })
    }
  })
  pushTouch(ctx, { code: f.ld, kind: 'lead' }, 'signed', signedAt, f.sale, NOTE.signed(hd))
  pushTouch(ctx, { code: f.op, kind: 'opportunity' }, 'signed', signedAt, f.sale, NOTE.signed(hd))
  return hd
}

type Ask = { at: Date; state: 'approved' | 'rejected' | 'waiting'; hours?: number }

/** Every sign request the deal raised: the approved one behind its contract,
 *  a refused one, or one still waiting on the director. */
export function plantApprovals(ctx: Ctx, f: DealFrame, d: DealSpec): void {
  if (f.amount === null) return
  const asks: Ask[] = [
    ...(d.refused
      ? [{ at: vn(d.refused.at), state: 'rejected' as const, hours: d.refused.hours }]
      : []),
    ...(d.signed
      ? [{ at: vn(d.signed.at), state: 'approved' as const, hours: d.signed.hours }]
      : []),
    ...(d.waiting ? [{ at: vn(d.waiting), state: 'waiting' as const }] : []),
  ]
  const director = ctx.hand(DIRECTOR)
  const collector = ctx.hand(HEAD)
  const money = `${f.amount.toLocaleString('vi-VN')} ${f.currency}`
  for (const ask of asks) {
    const id = randomUUID()
    const terms = d.signed?.terms ?? [
      { share: 30, due: '2026-12-15' },
      { share: 70, due: '2027-03-15' },
    ]
    const proposal: ContractSignProposal = {
      opportunityCode: f.op,
      sign: {
        amount: f.amount,
        currency: f.currency,
        kind: CONTRACT_KIND,
        signedAt: ask.at.toISOString(),
        collectorId: HEAD,
        installments: scheduleOf(terms, f.amount).map((t) => ({
          label: t.label,
          share: t.share,
          amount: t.amount,
          due: t.due.toISOString(),
        })),
      },
    }
    const decidedAt = ask.hours === undefined ? null : plusHours(ask.at, ask.hours)
    ctx.plan.approvals.push({
      id,
      kind: 'contract-sign',
      state: ask.state,
      raisedById: f.sale.id,
      raisedBy: f.sale.name,
      raisedAt: ask.at,
      consequence: `Ký hợp đồng Triển khai cho cơ hội ${f.op} · ${f.company} · ${money} · ${collector.name} thu tiền`,
      payload: proposal,
      chain: [{ role: 'director', person: director.name, personId: director.id, state: ask.state }],
      decidedAt,
      decidedBy: decidedAt ? director.name : null,
      decidedReason:
        ask.state === 'rejected' ? 'Thiếu phụ lục phạm vi, gửi lại khi khách xác nhận.' : null,
    })
    ctx.plan.approvalLinks.push({ requestId: id, objectCode: f.op, objectLabel: f.name })
  }
}
