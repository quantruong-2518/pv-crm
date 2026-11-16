import type { Facts } from './emit-contracts-rows'
import { beatsOf, handOf } from './emit-deals-view'
import type { Ctx } from './types'

/** A temperature reading never stands alone: the product writes it in the close-out
 *  of a care call (`debrief_id` is NOT NULL and UNIQUE), so each beat becomes a phone
 *  thread with one outgoing call, its closed debrief and the reading. The call is a
 *  real contact, so it moves the re-care clock the way a salesperson's call does. */

const SUMMARY = {
  hot: [
    'Khách đang dùng tốt, muốn mở thêm một dây chuyền',
    'Khách hài lòng, hẹn bàn gói mở rộng đầu quý sau',
  ],
  warm: [
    'Khách dùng ổn định, chưa có nhu cầu mới',
    'Khách hỏi thêm về bảo trì, chưa quyết định mở rộng',
  ],
  cold: ['Khách ít phản hồi, đang cắt giảm chi phí', 'Khách đổi người phụ trách, chưa còn nhu cầu'],
} as const

/** One member phone identity per carer, shared by all of that person's calls. */
function phoneIdentity(ctx: Ctx, actorId: string): string {
  const address = `care-${actorId}`
  const found = ctx.plan.identity.find((i) => i.channel === 'phone' && i.address === address)
  if (found?.id) return found.id
  const id = ctx.rng.uuid()
  ctx.plan.identity.push({ id, channel: 'phone', address, side: 'member', actorId })
  return id
}

export function emitTemperatures(ctx: Ctx, f: Facts): void {
  for (const b of beatsOf(f.story, 'temperature')) {
    const who = handOf(ctx, b.by)
    const threadId = ctx.rng.uuid()
    const messageId = ctx.rng.uuid()
    const debriefId = ctx.rng.uuid()
    ctx.plan.thread.push({
      id: threadId,
      channel: 'phone',
      subject: `Chăm sóc sau bán · ${f.customer}`,
      startedAt: b.at,
      lastAt: b.at,
    })
    ctx.plan.message.push({
      id: messageId,
      threadId,
      at: b.at,
      direction: 'out',
      fromIdentityId: phoneIdentity(ctx, who.id),
      durationSec: ctx.rng.int(120, 900),
      captureSource: 'manual',
    })
    ctx.plan.link.push({ threadId, objectCode: f.ld, linkedBy: 'human', createdAt: b.at })
    ctx.plan.debrief.push({
      id: debriefId,
      threadId,
      messageId,
      ownerId: who.id,
      createdAt: b.at,
      closedAt: b.at,
      subjectCode: f.ld,
      summary: ctx.rng.pick(SUMMARY[b.temperature]),
    })
    ctx.plan.customerTemperature.push({
      workstreamCode: f.ws,
      leadCode: f.ld,
      temperature: b.temperature,
      debriefId,
      recordedBy: who.id,
      recordedAt: b.at,
    })
  }
}
