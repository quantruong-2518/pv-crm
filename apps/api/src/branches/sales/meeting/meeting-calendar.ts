import { Injectable, Logger } from '@nestjs/common'
import { MeetingEventUrl, MeetingLink, type MeetingCalendarState } from '@pv/contracts'
import { GoogleCalendar } from '@api/platform/google/google-calendar.client'
import { meetingEndOf } from './meeting.mapper'
import { MeetingRepository } from './meeting.repository'
import type { MeetingRowDb } from './meeting.schema'

/** A meeting mirrored onto its booker's Google Calendar.
 *
 *  Called by `MeetingService` only AFTER the booking's transaction committed,
 *  and never throws: Google being slow, down or revoked must not undo or fail
 *  a save that already happened. The outcome is reported once, in the
 *  response that triggered it (`MeetingRow.calendar`), and not stored.
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
    private readonly google: GoogleCalendar,
  ) {}

  /** Insert or patch the event for meeting `id`, as the row now stands. */
  async push(id: string): Promise<MeetingCalendarState> {
    try {
      const row = await this.repo.byId(id)
      const owner = row?.googleEventId ? row.googleOwnerId : row?.createdBy
      if (!row || !owner) return 'not_connected'

      const meet = row.mode === 'online' && !row.link
      const outcome = await this.google.put(owner, row.googleEventId, {
        summary: row.title,
        ...(row.goal ? { description: row.goal } : {}),
        ...(await this.locationOf(row)),
        start: row.at,
        end: meetingEndOf(row) ?? row.at,
        attendees: await this.emailsOf(id),
        ...(meet ? { meetRequestId: id } : {}),
      })
      if (outcome.state !== 'synced') return outcome.state

      /* Google's URLs are checked against the contract before they are
         stored: an over-long one would fail every later read's parse. */
      const eventUrl = MeetingEventUrl.safeParse(outcome.eventUrl)
      const meetUrl = meet ? MeetingLink.safeParse(outcome.meetUrl) : null
      await this.repo.setEvent(
        id,
        {
          eventId: outcome.eventId,
          eventUrl: eventUrl.success ? eventUrl.data : null,
          ownerId: owner,
        },
        meetUrl?.success ? meetUrl.data : null,
      )
      return 'synced'
    } catch (error) {
      this.log.warn(`push ${id} failed — ${(error as Error).message}`)
      return 'failed'
    }
  }

  /** Best effort, after the meeting row is gone; nothing to report back. */
  async forget(row: MeetingRowDb): Promise<void> {
    if (!row.googleEventId || !row.googleOwnerId) return
    try {
      await this.google.remove(row.googleOwnerId, row.googleEventId)
    } catch (error) {
      this.log.warn(`forget ${row.id} failed — ${(error as Error).message}`)
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
