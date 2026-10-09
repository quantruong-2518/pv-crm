import { Injectable, Logger } from '@nestjs/common'
import { z } from 'zod'
import { GoogleAccess } from './google-access'
import { GOOGLE_TIMEOUT_MS } from './google-oauth.client'

/** Events on ONE person's primary Google Calendar — knows nothing about
 *  meetings; `branches/sales/meeting/meeting-calendar.ts` builds the event.
 *
 *  Never throws: every failure is an outcome the caller reports, because a
 *  calendar is a mirror and the booking it mirrors has already committed.
 *  One deadline (`GOOGLE_TIMEOUT_MS`) spans the token refresh AND the event
 *  call, so the wait a booker sees is bounded once, not per hop.
 *
 *  No access-token cache: each call refreshes first (`GoogleAccess.tokenFor`).
 *  A booking is a handful of calls a day per person, and a cache would be
 *  state to expire and evict. */

const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

export type CalendarEvent = {
  summary: string
  description?: string
  location?: string
  start: Date
  end: Date
  attendees: readonly string[]
  /** Ask Google for a Meet room on this write. The caller's stable key makes
   *  the request idempotent: a patch with the same key never mints a second room. */
  meetRequestId?: string
}

export type CalendarFailure = 'off' | 'not_connected' | 'failed'

export type CalendarOutcome =
  | { state: 'synced'; eventId: string; eventUrl: string; meetUrl?: string }
  | { state: CalendarFailure }

const EventBody = z.object({
  id: z.string().min(1),
  htmlLink: z.string().min(1),
  hangoutLink: z.string().optional(),
})

@Injectable()
export class GoogleCalendar {
  private readonly log = new Logger('google')

  constructor(private readonly access: GoogleAccess) {}

  /** Insert, or patch `eventId`. An event deleted on Google's side (404/410)
   *  is inserted again rather than reported failed for ever. */
  async put(
    ownerId: string,
    eventId: string | null,
    event: CalendarEvent,
  ): Promise<CalendarOutcome> {
    const signal = AbortSignal.timeout(GOOGLE_TIMEOUT_MS)
    const access = await this.access.tokenFor(ownerId, signal)
    if (access.state !== 'ok') return { state: access.state }
    const token = access.token

    const body = JSON.stringify(eventBody(event))
    const query = '?conferenceDataVersion=1&sendUpdates=all'
    let response = await this.call(
      eventId ? `${EVENTS_URL}/${encodeURIComponent(eventId)}${query}` : `${EVENTS_URL}${query}`,
      eventId ? 'PATCH' : 'POST',
      token,
      signal,
      body,
    )
    if (eventId && (response?.status === 404 || response?.status === 410)) {
      response = await this.call(`${EVENTS_URL}${query}`, 'POST', token, signal, body)
    }
    if (!response?.ok) return { state: 'failed' }

    const parsed = EventBody.safeParse(await response.json().catch(() => null))
    if (!parsed.success) return { state: 'failed' }
    return {
      state: 'synced',
      eventId: parsed.data.id,
      eventUrl: parsed.data.htmlLink,
      ...(parsed.data.hangoutLink ? { meetUrl: parsed.data.hangoutLink } : {}),
    }
  }

  /** Best effort, cancellation mailed to the guests; an event already gone is fine. */
  async remove(ownerId: string, eventId: string): Promise<void> {
    const signal = AbortSignal.timeout(GOOGLE_TIMEOUT_MS)
    const access = await this.access.tokenFor(ownerId, signal)
    if (access.state !== 'ok') return
    await this.call(
      `${EVENTS_URL}/${encodeURIComponent(eventId)}?sendUpdates=all`,
      'DELETE',
      access.token,
      signal,
    )
  }

  private async call(
    url: string,
    method: string,
    token: string,
    signal: AbortSignal,
    body?: string,
  ): Promise<Response | null> {
    try {
      const response = await fetch(url, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body }),
        signal,
      })
      if (!response.ok) this.log.warn(`calendar ${method} refused — status=${response.status}`)
      return response
    } catch {
      this.log.warn(`calendar ${method} unreachable — timeout or network`)
      return null
    }
  }
}

/** Google's event resource, every field sent whole even on a patch — `''`
 *  clears a location the meeting no longer has, where an absent key keeps it. */
function eventBody(e: CalendarEvent) {
  return {
    summary: e.summary,
    description: e.description ?? '',
    location: e.location ?? '',
    start: { dateTime: e.start.toISOString() },
    end: { dateTime: e.end.toISOString() },
    attendees: e.attendees.map((email) => ({ email })),
    ...(e.meetRequestId
      ? {
          conferenceData: {
            createRequest: {
              requestId: e.meetRequestId,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        }
      : {}),
  }
}
