import { CALL_NOTES, CHAT_OUT, MAIL_OUT, REPLIES, TALK_SUMMARIES } from './emit-comms-text'
import type { Kit, Person } from './emit-comms-kit'
import type { Beat } from './story.types'

/** One logged exchange (a first touch or a care beat on a lead) becomes the
 *  rows `CommRecordService` plus the thread door write: thread, an outbound
 *  turn, maybe the customer's answer, the link and the record. The leads
 *  emitter already wrote the timeline touch, so none is written here. */

type Talk = Extract<Beat, { kind: 'first-touch' | 'care' }>
const MIN = 60_000
const DAY = 86_400_000

const THREAD_OF = { call: 'phone', message: 'zalo-oa', mail: 'email' } as const

export function emitTalk(kit: Kit, ld: string, person: Person, b: Talk): void {
  const { ctx } = kit
  const { rng, plan, now } = ctx
  const reached = b.kind === 'first-touch' ? true : b.reached
  const at = b.at
  const ageDays = (now.getTime() - at.getTime()) / DAY
  const wire = b.channel === 'mail' ? 'email' : 'phone'
  const from = kit.memberId(b.by)
  const to = kit.guestId(person, wire, at)
  const threadId = rng.uuid()
  const outId = rng.uuid()

  /* Only a record 3-20 days old may stay open: the late sweeper rings the
     fresher ones, and older ones would read as neglect nobody drew. */
  const pending = reached && ageDays >= 3 && ageDays <= 20 && rng.chance(0.12)
  const bare = pending && rng.chance(0.5)
  const seconds = b.channel === 'call' ? (reached ? rng.int(40, 600) : 0) : null
  const pool = b.channel === 'mail' ? MAIL_OUT : b.channel === 'call' ? CALL_NOTES : CHAT_OUT
  const writes = b.channel !== 'call' || (reached && rng.chance(0.55))
  const body = bare || !writes ? null : rng.pick(pool)

  plan.message.push({
    id: outId,
    threadId,
    at,
    direction: 'out',
    fromIdentityId: from,
    bodyText: body,
    durationSec: seconds,
    captureSource: 'manual',
    createdAt: at,
  })
  plan.messageParty.push(
    { messageId: outId, identityId: from, role: 'from' },
    { messageId: outId, identityId: to, role: 'to' },
  )

  let lastAt = at
  const replyAt = new Date(at.getTime() + rng.int(30, 360) * MIN)
  if (reached && !pending && b.channel !== 'call' && replyAt <= now && rng.chance(0.65)) {
    const inId = rng.uuid()
    lastAt = replyAt
    plan.message.push({
      id: inId,
      threadId,
      at: replyAt,
      direction: 'in',
      fromIdentityId: to,
      bodyText: rng.pick(REPLIES),
      durationSec: null,
      captureSource: 'manual',
      createdAt: replyAt,
    })
    plan.messageParty.push(
      { messageId: inId, identityId: to, role: 'from' },
      { messageId: inId, identityId: from, role: 'to' },
    )
  }

  const debriefId = rng.uuid()
  const lag = (seconds ?? 0) * 1000 + rng.int(5, 300) * MIN
  const closedAt = pending
    ? null
    : new Date(Math.min(Math.max(at.getTime() + lag, lastAt.getTime()), now.getTime()))
  const done = reached && !pending ? kit.closing(TALK_SUMMARIES, person.name, closedAt!) : null
  plan.thread.push({
    id: threadId,
    channel: THREAD_OF[b.channel],
    subject: b.channel === 'mail' ? 'Trao đổi về giải pháp quản lý sản xuất' : null,
    startedAt: at,
    lastAt,
    state: closedAt && ageDays > 30 && rng.chance(0.4) ? 'archived' : 'open',
    createdAt: at,
  })
  plan.link.push({ threadId, objectCode: ld, linkedBy: 'human', createdAt: at })
  plan.debrief.push({
    id: debriefId,
    threadId,
    messageId: outId,
    ownerId: b.by,
    createdAt: at,
    closedAt,
    subjectCode: ld,
    summary: done?.summary ?? null,
    ...(done?.next ?? {}),
    booked: false,
    unreached: !reached,
    cancelled: false,
  })
  for (const a of done?.answers ?? []) plan.debriefAnswer.push({ debriefId, ...a })
}
