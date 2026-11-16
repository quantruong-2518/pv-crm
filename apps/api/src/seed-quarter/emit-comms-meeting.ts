import {
  DEAL_MEETING_TITLES,
  LEAD_MEETING_TITLES,
  MEETING_GOALS,
  MEETING_SUMMARIES,
} from './emit-comms-text'
import type { Kit, Person } from './emit-comms-kit'
import type { Beat } from './story.types'

/** One meeting beat becomes what `MeetingService.record` plus
 *  `CommRecordService.open` write at booking: the meeting, its attendees, a
 *  meeting thread with the booked record, and (once held) the timeline touch.
 *  `google_event_id` and `calendar_dirty_at` stay NULL so no worker pushes it. */

export type MeetingBeat = Extract<Beat, { kind: 'meeting' }>
export type Booking = {
  beat: MeetingBeat
  subject: string
  company: string
  people: Person[]
  /** Booking floor: no meeting is typed before its journey exists. */
  since: Date
  /** The beat that cancelled it (deal lost, lead parked or disabled). */
  cancel: { at: Date; cause: 'opportunity-lost' | 'lead-nurtured' | 'lead-disabled' } | null
  first: boolean
  presales: string | null
}

const MIN = 60_000
const DAY = 86_400_000

export function emitMeeting(kit: Kit, bk: Booking): void {
  const { ctx } = kit
  const { rng, plan, now, world } = ctx
  const m = bk.beat
  const id = rng.uuid()
  const lead = bk.subject.startsWith('LD-')
  const title = `${rng.pick(lead ? LEAD_MEETING_TITLES : DEAL_MEETING_TITLES)} · ${bk.company}`
  const host = world.actors.get(m.host)
  if (!host) throw new Error(`seed-quarter comms: ${m.host} is not in the cast`)

  const cancelled = m.state === 'cancelled' ? bk.cancel : null
  const held = m.state === 'held'
  const anchor = cancelled ? cancelled.at : m.at
  const ceiling = Math.min(anchor.getTime(), now.getTime() - 10 * MIN)
  const early = Math.max(anchor.getTime() - rng.int(1, 5) * DAY, bk.since.getTime())
  const booked = new Date(Math.min(early, ceiling))
  const heldAt = held ? new Date(Math.min(m.at.getTime() + m.minutes * MIN, now.getTime())) : null

  plan.meeting.push({
    id,
    subjectCode: bk.subject,
    at: m.at,
    title,
    link: m.mode === 'online' ? `https://meet.example/pv-${id.slice(0, 8)}` : null,
    goal: rng.pick(MEETING_GOALS),
    durationMinutes: m.minutes,
    mode: m.mode,
    by: host.name,
    createdBy: host.id,
    createdAt: booked,
    updatedAt: booked,
    heldAt,
    cancelledAt: cancelled?.at ?? null,
    cancelCause: cancelled?.cause ?? null,
    googleEventId: null,
    calendarDirtyAt: null,
  })

  const guests = bk.people.slice(0, 1 + (bk.people.length > 1 && rng.chance(0.4) ? 1 : 0))
  const attended = held ? true : null
  plan.meetingAttendee.push({
    meetingId: id,
    side: 'host',
    actorId: host.id,
    name: host.name,
    attended,
  })
  const second = bk.presales ? world.actors.get(bk.presales) : undefined
  if (second && second.id !== host.id && rng.chance(0.4)) {
    plan.meetingAttendee.push({
      meetingId: id,
      side: 'host',
      actorId: second.id,
      name: second.name,
      attended,
    })
  }
  for (const g of guests) {
    plan.meetingAttendee.push({
      meetingId: id,
      side: 'guest',
      contactCode: g.code,
      name: g.name,
      attended: held ? !(g !== guests[0] && rng.chance(0.15)) : null,
    })
  }

  const threadId = rng.uuid()
  const messageId = rng.uuid()
  const from = kit.memberId(host.id)
  const to = kit.guestId(guests[0]!, 'phone', booked)
  const closedAt = heldAt
    ? new Date(Math.min(heldAt.getTime() + rng.int(10, 240) * MIN, now.getTime()))
    : (cancelled?.at ?? null)
  const done = heldAt ? kit.closing(MEETING_SUMMARIES, guests[0]!.name, closedAt!) : null
  plan.thread.push({
    id: threadId,
    channel: 'meeting',
    externalId: id,
    subject: null,
    startedAt: m.at,
    lastAt: m.at,
    state:
      closedAt && now.getTime() - m.at.getTime() > 30 * DAY && rng.chance(0.4)
        ? 'archived'
        : 'open',
    createdAt: booked,
  })
  plan.message.push({
    id: messageId,
    threadId,
    at: m.at,
    direction: 'out',
    fromIdentityId: from,
    bodyText: null,
    durationSec: null,
    captureSource: 'manual',
    createdAt: booked,
  })
  plan.messageParty.push(
    { messageId, identityId: from, role: 'from' },
    { messageId, identityId: to, role: 'to' },
  )
  plan.link.push({ threadId, objectCode: bk.subject, linkedBy: 'human', createdAt: booked })
  const debriefId = rng.uuid()
  plan.debrief.push({
    id: debriefId,
    threadId,
    messageId,
    ownerId: host.id,
    createdAt: booked,
    closedAt,
    subjectCode: bk.subject,
    summary: done?.summary ?? null,
    ...(done?.next ?? {}),
    booked: true,
    unreached: false,
    cancelled: !!cancelled,
  })
  for (const a of done?.answers ?? []) plan.debriefAnswer.push({ debriefId, ...a })

  if (held) {
    const ahead = booked < m.at
    const verb = bk.first ? 'Gặp lần đầu' : 'Họp'
    plan.touch.push({
      at: m.at,
      subjectCode: bk.subject,
      subjectKind: lead ? 'lead' : 'opportunity',
      kind: bk.first ? 'first-meeting' : 'contacted',
      actorId: host.id,
      by: host.name,
      note: `${ahead ? 'Đặt lịch ' + verb.toLowerCase() : verb}: ${title}`,
    })
  }
}
