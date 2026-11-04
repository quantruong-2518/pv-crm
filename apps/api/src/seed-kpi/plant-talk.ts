import { randomUUID } from 'node:crypto'
import { MILESTONE_TOUCH, NOTE } from '@api/branches/sales/opportunity/opportunity.mapper'
import { TAG, idOf, plusHours, vn, type Key } from './cast'
import type { DealSpec, Talk } from './book'
import type { DealFrame } from './plant-deal'
import { pushTouch, type Ctx, type Hand } from './plan'

/** Meetings and logged exchanges on a deal — `demos-joined` and
 *  `debriefs-closed`. Both hang off the DEAL code, not the lead's, so neither
 *  counts as BD's first response on the lead (`realExchanges` reads the lead's
 *  ledgers only). No meeting carries a Google owner, so none is synced. */

export function plantDemos(ctx: Ctx, f: DealFrame, d: DealSpec, lostAt: Date | null): void {
  for (const demo of d.demos ?? []) {
    const id = randomUUID()
    const at = vn(demo.at)
    const held = demo.held !== false
    const cancelled = demo.cancelled === true && lostAt !== null
    const presales = ctx.hand(idOf(demo.with))
    ctx.plan.meetings.push({
      id,
      subjectCode: f.op,
      at,
      title: `${TAG}Demo giải pháp cho khách`,
      mode: 'online',
      durationMinutes: 60,
      by: f.sale.name,
      createdBy: f.sale.id,
      createdAt: plusHours(at, -48),
      heldAt: held ? plusHours(at, 1) : null,
      cancelledAt: cancelled ? lostAt : null,
      cancelCause: cancelled ? 'opportunity-lost' : null,
    })
    const attended = held ? true : null
    ctx.plan.attendees.push(
      { meetingId: id, side: 'host', actorId: f.sale.id, name: f.sale.name, attended },
      { meetingId: id, side: 'host', actorId: presales.id, name: presales.name, attended },
      { meetingId: id, side: 'guest', contactCode: f.contactCode, name: f.contactName },
    )
    if (held) {
      const deal = { code: f.op, kind: 'opportunity' as const }
      pushTouch(ctx, deal, MILESTONE_TOUCH.demo, at, f.sale, NOTE.milestone('demo'))
    }
  }
}

/** One thread per exchange: an outbound email turn from the owner, linked to
 *  the deal, and its debrief — closed with a summary, unreached, or still open. */
export function plantTalks(
  ctx: Ctx,
  f: DealFrame,
  talks: readonly Talk[],
  ownerOf: (key?: Key) => Hand,
): void {
  const { plan } = ctx
  for (const talk of talks) {
    const owner = ownerOf(talk.by)
    const at = vn(talk.at)
    const [threadId, messageId] = [randomUUID(), randomUUID()]
    if (!plan.speakers.includes(owner.id)) plan.speakers.push(owner.id)
    plan.threads.push({
      id: threadId,
      channel: 'email',
      subject: `${TAG}Trao đổi về ${f.name}`,
      startedAt: at,
      lastAt: at,
    })
    plan.messages.push({
      id: messageId,
      threadId,
      at,
      direction: 'out',
      fromActorId: owner.id,
      bodyText: 'Trao đổi với khách về phạm vi và tiến độ triển khai.',
      captureSource: 'manual',
    })
    plan.links.push({ threadId, objectCode: f.op, linkedBy: 'human' })
    const closedAt = talk.state === 'open' ? null : plusHours(at, 2)
    plan.debriefs.push({
      threadId,
      messageId,
      ownerId: owner.id,
      subjectCode: f.op,
      createdAt: at,
      closedAt,
      unreached: talk.state === 'unreached',
      summary: talk.state ? null : 'Khách đồng ý phạm vi, hẹn bước tiếp theo trong tuần.',
    })
  }
}
