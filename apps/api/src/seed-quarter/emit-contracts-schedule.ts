import { addDays, daysBetween, dayOf, vnAt } from './clock'
import type { Facts } from './emit-contracts-rows'
import { labelOf } from './emit-deals-sign'
import { beatsOf, handOf, type BeatOf } from './emit-deals-view'
import type { Ctx } from './types'

/** The money side: the schedule the sign door cuts, the reasons written against
 *  late instalments, and the termination that freezes the paper. The labels and
 *  the rounding are the sign approval's (`emit-deals-sign.ts`), so a contract
 *  and the request that created it agree line by line. */

export type Slot = {
  beat: BeatOf<'installment'>
  due: Date
  amount: number
  paid: boolean
}

const REASONS = {
  waiting: [
    'Khách báo kế toán đang chờ duyệt chi, hẹn chuyển tiền đầu tuần sau',
    'Khách chờ nghiệm thu nội bộ xong mới chuyển tiền',
    'Khách xin lùi thanh toán vì quý này chưa có nguồn vốn',
  ],
  approved: [
    'Khách xin lùi hai tuần do chờ ngân hàng giải ngân',
    'Khách đang kiểm kê cuối quý, kế toán chưa xử lý chi',
  ],
  rejected: ['Khách nói chưa nhận được hóa đơn', 'Khách hẹn trả nhưng chưa có ngày cụ thể'],
} as const

const DECISIONS = {
  approved: ['Đồng ý, theo dõi lại sau hạn mới', 'Đã trao đổi với khách, cho lùi'],
  rejected: [
    'Chưa rõ ngày trả, cần khách xác nhận bằng văn bản',
    'Hóa đơn đã gửi, yêu cầu khách thanh toán theo hạn',
  ],
} as const

export function emitInstallments(ctx: Ctx, f: Facts): Slot[] {
  const beats = beatsOf(f.story, 'installment').sort((a, b) => a.no - b.no)
  let left = f.value
  const slots: Slot[] = beats.map((beat, n) => {
    const part = n === beats.length - 1 ? left : Math.round((f.value * beat.share) / 100)
    left -= part
    return { beat, due: vnAt(beat.due, 12), amount: part, paid: beat.paidAt !== null }
  })
  slots.forEach(({ beat, due, amount }, n) => {
    const recorded = beat.paidAt
      ? new Date(
          Math.min(ctx.now.getTime(), beat.paidAt.getTime() + ctx.rng.int(1, 30) * 3_600_000),
        )
      : null
    ctx.plan.contractInstallment.push({
      contractCode: f.hd,
      no: beat.no,
      label: labelOf(n, slots.length),
      share: beat.share,
      amount,
      due,
      paidAt: beat.paidAt,
      paidById: beat.paidAt ? (beat.paidBy ?? f.collector) : null,
      paidRecordedAt: recorded,
    })
    const r = beat.reason
    if (!r) return
    const note = r.state === 'waiting' ? null : ctx.rng.pick(DECISIONS[r.state])
    ctx.plan.installmentOverdueReason.push({
      contractCode: f.hd,
      installmentNo: beat.no,
      due,
      reason: ctx.rng.pick(REASONS[r.state]),
      writtenById: r.by,
      writtenAt: r.at,
      state: r.state,
      decidedById: r.state === 'waiting' ? null : r.decidedBy,
      decidedAt: r.state === 'waiting' ? null : r.decidedAt,
      decisionNote: note,
    })
  })
  return slots
}

/** Round to a figure a person would type: whole millions in VND, hundreds in USD. */
const roundMoney = (n: number, currency: 'VND' | 'USD'): number => {
  const step = currency === 'VND' ? 1_000_000 : 100
  return Math.max(step, Math.round(n / step) * step)
}

const OTHER_NOTES = [
  'Hai bên thống nhất dừng hợp đồng, không tiếp tục triển khai',
  'Khách đổi hướng đầu tư, không dùng giải pháp nữa',
]

/** Collected is what the paid instalments sum to, as the real door reads it. */
export function emitTermination(ctx: Ctx, f: Facts, slots: Slot[]): void {
  const t = beatsOf(f.story, 'terminated')[0]
  if (!t) return
  const collected = slots.filter((s) => s.paid).reduce((sum, s) => sum + s.amount, 0)
  const refunded =
    collected > 0 && ctx.rng.chance(0.5) ? Math.floor(collected * ctx.rng.pick([0.3, 0.5, 1])) : 0
  const reasons = ctx.world.config.get('CONTRACT_TERMINATION_REASON') ?? []
  const other = reasons.length === 0 || ctx.rng.chance(0.1)
  const direction =
    t.knob === 'customer-pays'
      ? 'customer-pays'
      : t.knob.startsWith('company-pays')
        ? 'company-pays'
        : null
  const settled = t.knob === 'company-pays-settled'
  const room = Math.max(0, daysBetween(dayOf(t.at), ctx.today))
  const by = handOf(ctx, t.by)
  ctx.plan.contractTermination.push({
    contractCode: f.hd,
    reasonKey: other ? 'other' : ctx.rng.pick(reasons).id,
    note: other ? ctx.rng.pick(OTHER_NOTES) : null,
    collectedAmount: collected,
    refundedAmount: refunded,
    penaltyDirection: direction,
    penaltyAmount: direction
      ? roundMoney(f.value * ctx.rng.pick([0.05, 0.1, 0.15]), f.currency)
      : null,
    penaltySettledOn: settled ? addDays(dayOf(t.at), ctx.rng.int(0, Math.min(20, room))) : null,
    penaltySettledById: settled ? by.id : null,
    terminatedAt: t.at,
    terminatedById: by.id,
  })
  ctx.plan.audit.push({
    at: t.at,
    actorId: by.id,
    action: 'edit',
    code: f.hd,
    note: `contract terminated, refunded ${refunded} of ${collected}, ${direction ?? 'no penalty'}`,
  })
}
