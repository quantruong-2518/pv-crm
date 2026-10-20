import { Injectable, Logger } from '@nestjs/common'
import { MEETING_CALENDAR_FAILED } from '@pv/engines'
import {
  MeetingEventUrl,
  MeetingLink,
  NOTIFICATION_DETAIL_TITLE,
  type MeetingCalendarState,
} from '@pv/contracts'
import { GoogleCalendar } from '@api/platform/google/google-calendar.client'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { MeetingCalendarRepository, type MeetingCalendarDrop } from './meeting-calendar.repository'
import { meetingEndOf } from './meeting.mapper'
import { MeetingRepository } from './meeting.repository'
import type { MeetingRowDb } from './meeting.schema'

/** Failed background pushes before the booker's bell rings, once per streak. */
export const CALENDAR_ALERT_AFTER = 5
/** Failed removals of a deleted meeting's event before the tombstone is given up. */
export const CALENDAR_DROP_GIVE_UP = 10

/** The Google event id of a meeting, the same on every try: Google refuses a
 *  second insert under it (base32hex `a-v0-9`, 5–1024 chars; hex and `pv` fit). */
export const calendarEventId = (meetingId: string): string => `pv${meetingId.replace(/-/g, '')}`

type PushOutcome = Exclude<MeetingCalendarState, 'pending'>

/** A meeting mirrored onto its booker's Google Calendar, durably (0127).
 *
 *  A booking or an edit marks the row dirty in its own transaction; after the
 *  commit `push` tries once inline, and `MeetingCancelSweeper` (worker) retries
 *  what is still dirty. Never throws: Google slow, down or revoked must not
 *  undo or fail a save that already happened. A failure is `pending`, not lost.
 *
 *  The event lives on the booker's calendar (`created_by`) and stays with
 *  whoever holds it (`google_owner_id`): only that person's token can patch or
 *  delete it. Only `online` asks for a Meet room, and only while `link` is
 *  empty — a link the user pasted wins and goes into the event's location. */
@Injectable()
export class MeetingCalendar {
  private readonly log = new Logger('meeting.calendar')

  constructor(
    private readonly repo: MeetingRepository,
    private readonly marks: MeetingCalendarRepository,
    private readonly google: GoogleCalendar,
    private readonly hub: NotificationHub,
  ) {}

  /** The inline try after a commit. A failure stays dirty for the worker. */
  async push(id: string): Promise<MeetingCalendarState> {
    const { state } = await this.attempt(id)
    return state === 'failed' ? 'pending' : state
  }

  /** The worker's pass over dirty rows whose backoff elapsed. */
  async retryDue(): Promise<number> {
    const ids = await this.marks.duePushes()
    for (const id of ids) {
      if ((await this.attempt(id)).retry) await this.countFailure(id)
    }
    return ids.length
  }

  /** In the drop's transaction's wake, once inline; then by the worker. */
  async forgetDropped(meetingId: string): Promise<void> {
    const drop = await this.marks.tombstoneOf(meetingId)
    if (drop && (await this.forgetEvent(drop.ownerId, drop.eventId))) await this.marks.bury(drop.id)
  }

  /** The worker's pass over tombstones whose backoff elapsed. */
  async retryDropped(): Promise<number> {
    const drops = await this.marks.dueTombstones()
    for (const drop of drops) await this.retryDrop(drop)
    return drops.length
  }

  /** Best effort, after the row is cancelled. True = no event left on Google
   *  (none ever, or removed); the cancelled row then clears its mirror. A row
   *  still owing a push may have one under the stable id (`entombEvent`'s rule). */
  async forget(row: MeetingRowDb): Promise<boolean> {
    const eventId = row.googleEventId ?? (row.calendarDirtyAt ? calendarEventId(row.id) : null)
    const owner = row.googleEventId ? row.googleOwnerId : row.createdBy
    /* No event, or its owner gone (SET NULL): no token can reach it, nothing to retry. */
    if (!eventId || !owner) return true
    return this.forgetEvent(owner, eventId)
  }

  /** Insert or patch the event for meeting `id`, as the row now stands.
   *  `retry` = the mark stays for the worker: Google failed, or a stored event's
   *  owner lost the link (a reconnect must still receive the edits; the 7-day
   *  cutoff bounds it). Any other outcome settles the mark: nothing to retry with. */
  private async attempt(id: string): Promise<{ state: PushOutcome; retry: boolean }> {
    try {
      const hit = await this.marks.forPush(id)
      /* An amend racing a cancel must not re-create the event and re-invite. */
      if (hit?.row.cancelledAt) return { state: 'off', retry: false }
      const row = hit?.row
      const owner = row?.googleEventId ? row.googleOwnerId : row?.createdBy
      if (!hit || !row) return { state: 'not_connected', retry: false }
      /* Nobody's token can reach the event (owner gone), so the mark has nothing to wait for. */
      if (!owner) {
        await this.marks.settle(id, hit.seen, null, null)
        return { state: 'not_connected', retry: false }
      }

      const meet = row.mode === 'online' && !row.link
      const outcome = await this.google.put(owner, row.googleEventId, calendarEventId(id), {
        summary: row.title,
        ...(row.goal ? { description: row.goal } : {}),
        ...(await this.locationOf(row)),
        start: row.at,
        end: meetingEndOf(row) ?? row.at,
        attendees: await this.emailsOf(id),
        ...(meet ? { meetRequestId: id } : {}),
      })
      if (outcome.state === 'failed') return { state: 'failed', retry: true }
      if (outcome.state === 'not_connected' && row.googleEventId) {
        return { state: 'not_connected', retry: true }
      }
      if (outcome.state !== 'synced') {
        await this.marks.settle(id, hit.seen, null, null)
        return { state: outcome.state, retry: false }
      }

      /* Google's URLs are checked against the contract before they are
         stored: an over-long one would fail every later read's parse. */
      const eventUrl = MeetingEventUrl.safeParse(outcome.eventUrl)
      const meetUrl = meet ? MeetingLink.safeParse(outcome.meetUrl) : null
      await this.marks.settle(
        id,
        hit.seen,
        {
          eventId: outcome.eventId,
          eventUrl: eventUrl.success ? eventUrl.data : null,
          ownerId: owner,
        },
        meetUrl?.success ? meetUrl.data : null,
      )
      return { state: 'synced', retry: false }
    } catch (error) {
      this.log.warn(`push ${id} failed — ${(error as Error).message}`)
      return { state: 'failed', retry: true }
    }
  }

  /** One more failure, and the booker's bell when it is the streak's fifth. The
   *  alert time is the occurrence: a later streak, after a success, rings again. */
  private async countFailure(id: string): Promise<void> {
    await this.marks.run(async (tx) => {
      const hit = await this.marks.failed(tx, id, CALENDAR_ALERT_AFTER)
      const row = hit?.row
      const owner = row?.googleEventId ? row.googleOwnerId : row?.createdBy
      if (!hit?.rang || !row?.calendarAlertedAt || !owner) return
      const labels = await this.repo.labelsOf(tx, [row.subjectCode])
      await this.hub.announce(tx, {
        event: {
          name: MEETING_CALENDAR_FAILED,
          ref: { code: row.subjectCode },
          audiences: { owner: [owner] },
          occurrence: `${row.id}:${row.calendarAlertedAt.getTime()}`,
        },
        subject: {
          kind: row.subjectCode.startsWith('OP-') ? 'opportunity' : 'lead',
          code: row.subjectCode,
          label: labels.get(row.subjectCode) ?? null,
        },
        detail: { [NOTIFICATION_DETAIL_TITLE]: row.title },
      })
    })
  }

  private async retryDrop(drop: MeetingCalendarDrop): Promise<void> {
    if (await this.forgetEvent(drop.ownerId, drop.eventId)) return this.marks.bury(drop.id)
    if ((await this.marks.tombstoneFailed(drop.id)) < CALENDAR_DROP_GIVE_UP) return
    this.log.warn(`drop ${drop.meetingId}: event ${drop.eventId} not removed, given up`)
    await this.marks.bury(drop.id)
  }

  /** True = the event is gone (a 404/410 counts); false = try again later. */
  private async forgetEvent(ownerId: string, eventId: string): Promise<boolean> {
    try {
      return await this.google.remove(ownerId, eventId)
    } catch (error) {
      this.log.warn(`forget ${eventId} failed — ${(error as Error).message}`)
      return false
    }
  }

  /** `onsite` is at the customer's address; `office` is ours, which no table
   *  records, so it is left out rather than guessed. */
  private async locationOf(row: MeetingRowDb): Promise<{ location?: string }> {
    if (row.mode === 'online') return row.link ? { location: row.link } : {}
    if (row.mode !== 'onsite') return {}
    const site = await this.repo.siteOf(row.subjectCode)
    return site ? { location: site } : {}
  }

  private async emailsOf(id: string): Promise<string[]> {
    const people = await this.repo.attendeesOf([id])
    const hosts = people.flatMap((p) => (p.side === 'host' && p.actorId ? [p.actorId] : []))
    const guests = people.flatMap((p) => (p.contactCode ? [p.contactCode] : []))
    const emails = [
      ...(await this.repo.actorEmails(hosts)),
      ...(await this.repo.contactEmails(guests)),
    ]
    return [...new Set(emails.map((e) => e.trim().toLowerCase()))]
  }
}
