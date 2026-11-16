import { addDays, dayOf, vnAt } from './clock'
import type { Facts } from './emit-contracts-rows'
import type { Slot } from './emit-contracts-schedule'
import { beatsOf, handOf } from './emit-deals-view'
import type { Ctx } from './types'

/** What hangs off each instalment: the paper it needs, the unlock checklist,
 *  the chasing record and free notes. All of it is keyed by instalment, so a
 *  terminated contract keeps only what already happened. */

const DOCS = [
  { name: 'Phiếu đề nghị thanh toán', hint: 'Kế toán khách cần bản có dấu' },
  { name: 'Biên bản nghiệm thu', hint: 'Khách ký xác nhận khối lượng' },
  { name: 'Hóa đơn đã ghi nhận', hint: 'Gửi kèm đề nghị thanh toán' },
]

type Doc = { name: string; state: 'complete' | 'awaiting-signature' | 'missing'; hint: string }

function docsOf(ctx: Ctx, slot: Slot, late: boolean, forceMissing: boolean): Doc[] {
  const picked = ctx.rng.chance(0.5) ? DOCS.slice(0, 2) : DOCS.slice(1, 3)
  return picked.map((d, i) => {
    if (forceMissing && i === 0) return { ...d, state: 'missing' }
    if (slot.paid) return { ...d, state: 'complete' }
    if (late) return { ...d, state: i === 0 ? 'awaiting-signature' : 'missing' }
    return { ...d, state: ctx.rng.chance(0.6) ? 'complete' : 'awaiting-signature' }
  })
}

type Step = {
  days: number
  channel: 'email' | 'zalo-oa' | 'in-app' | 'call'
  what: string
  detail: string
}

const BEFORE: Step[] = [
  {
    days: -10,
    channel: 'email',
    what: 'Gửi đề nghị thanh toán',
    detail: 'Kèm biên bản và hóa đơn',
  },
  { days: -3, channel: 'in-app', what: 'Nhắc trước hạn', detail: 'Nhắc người thu tiền gọi khách' },
]
const AFTER: Step[] = [
  { days: 1, channel: 'email', what: 'Nhắc quá hạn', detail: 'Email nhắc kế toán khách' },
  { days: 4, channel: 'call', what: 'Gọi nhắc thanh toán', detail: 'Gọi cho kế toán khách' },
  { days: 8, channel: 'zalo-oa', what: 'Nhắn Zalo nhắc lần hai', detail: 'Chờ khách phản hồi' },
]

/** Past steps are done, the last one of a late instalment waits for the
 *  customer; a step still ahead is queued (the next) or upcoming. */
type RecordState = 'done' | 'awaiting-reply' | 'scheduled' | 'upcoming'

function recordsOf(ctx: Ctx, f: Facts, slot: Slot) {
  const late = !slot.paid && slot.due.getTime() < ctx.now.getTime()
  const steps = slot.paid ? BEFORE.slice(0, 1) : late ? [...BEFORE, ...AFTER] : BEFORE
  const due = dayOf(slot.due)
  let queued = false
  return steps.map((s, i) => {
    const at = vnAt(addDays(due, s.days), 9 + (i % 5))
    let state: RecordState
    if (at.getTime() <= ctx.now.getTime()) {
      state = late && i === steps.length - 1 ? 'awaiting-reply' : 'done'
    } else {
      state = queued ? 'upcoming' : 'scheduled'
      queued = true
    }
    return { contractCode: f.hd, installmentNo: slot.beat.no, at, ...s, state }
  })
}

const NOTES = [
  'Khách báo đã duyệt chi, chờ kế toán chuyển khoản',
  'Đã gửi lại bản gốc theo yêu cầu của khách',
  'Kế toán khách đổi người, cần gửi lại hồ sơ',
]

export function emitExtras(ctx: Ctx, f: Facts, slots: Slot[], missing: boolean): void {
  const dead = beatsOf(f.story, 'terminated')[0]
  const collector = handOf(ctx, f.collector).name
  const target = slots.findIndex((s) => !s.paid)
  const flagged = missing ? (target >= 0 ? target : slots.length - 1) : -1
  slots.forEach((slot, i) => {
    const no = slot.beat.no
    const late = !slot.paid && slot.due.getTime() < ctx.now.getTime()
    const live = !dead || slot.paid
    if (live || i === flagged) {
      for (const d of docsOf(ctx, slot, late, i === flagged)) {
        ctx.plan.contractDocument.push({ contractCode: f.hd, installmentNo: no, ...d })
      }
    }
    if (!live) return
    ctx.plan.contractRecord.push(...recordsOf(ctx, f, slot))
    const ours = {
      side: 'ours' as const,
      what: 'Gửi biên bản nghiệm thu cho khách',
      who: collector,
      due: vnAt(addDays(dayOf(slot.due), -7), 12),
    }
    const theirs = {
      side: 'customer' as const,
      what: 'Khách ký biên bản và gửi lại',
      who: f.contactName,
      due: vnAt(addDays(dayOf(slot.due), -3), 12),
    }
    const done = (at: Date): Date => new Date(Math.min(at.getTime(), ctx.now.getTime()))
    for (const c of [ours, theirs]) {
      const finished = slot.paid || (c.side === 'ours' && c.due.getTime() < ctx.now.getTime())
      ctx.plan.contractCondition.push({
        contractCode: f.hd,
        installmentNo: no,
        ...c,
        doneAt: finished ? done(c.due) : null,
      })
    }
    if (late && ctx.rng.chance(0.5)) {
      ctx.plan.contractNote.push({
        contractCode: f.hd,
        installmentNo: no,
        at: new Date(Math.min(ctx.now.getTime(), slot.due.getTime() + 3 * 86_400_000)),
        who: collector,
        text: ctx.rng.pick(NOTES),
      })
    }
  })
  const last = slots.at(-1)
  if (dead && last) {
    ctx.plan.contractNote.push({
      contractCode: f.hd,
      installmentNo: last.beat.no,
      at: dead.at,
      who: handOf(ctx, dead.by).name,
      text: 'Chấm dứt hợp đồng, ngừng thu các đợt còn lại',
    })
  }
}
