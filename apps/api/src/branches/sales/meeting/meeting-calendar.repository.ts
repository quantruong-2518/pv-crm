import { and, asc, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { meeting, meetingCalendarDrop, type MeetingRowDb } from './meeting.schema'

/** SQL of the Google mirror's durable half (0127): the dirty mark on
 *  `sales.meeting` and the tombstones of deleted meetings. Decides nothing.
 *
 *  The mark is read as TEXT and compared back as text: Postgres keeps
 *  microseconds and a JS Date keeps milliseconds, so a mark round-tripped
 *  through a Date would never equal itself. Writers set it from a JS Date
 *  (`new Date()`), which keeps a service free of SQL; equality is all it is asked. */

/** One sweep's worth: a backlog drains over several ticks instead of one long pass. */
export const CALENDAR_BATCH = 50

export type MeetingCalendarDrop = typeof meetingCalendarDrop.$inferSelect

/** What a push read, as text: the mark it may clear and the row's `updated_at`,
 *  which tells "the row changed meanwhile" from "another push cleared it". */
export type PushSeen = { mark: string | null; updatedAt: string }

/** Minutes after `since` each try is due: 1, 6, 21, 81, then one more each hour.
 *  Cumulative from a column no failure moves, since 0127 stores no last-try time. */
export const dueBy = (attempts: AnyPgColumn, since: AnyPgColumn): SQL =>
  sql`${since} + make_interval(mins => CASE ${attempts} WHEN 0 THEN 1 WHEN 1 THEN 6 WHEN 2 THEN 21
    ELSE 81 + 60 * (${attempts} - 3) END) <= now()`

@Injectable()
export class MeetingCalendarRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** The row as a push will send it, and what it saw. */
  async forPush(id: string): Promise<{ row: MeetingRowDb; seen: PushSeen } | null> {
    const [hit] = await this.db
      .select({
        row: meeting,
        mark: sql<string | null>`${meeting.calendarDirtyAt}::text`,
        updatedAt: sql<string>`${meeting.updatedAt}::text`,
      })
      .from(meeting)
      .where(eq(meeting.id, id))
      .limit(1)
    return hit ? { row: hit.row, seen: { mark: hit.mark, updatedAt: hit.updatedAt } } : null
  }

  /** Google has what the row said when `seen` was read (or has nothing to
   *  hold): the mirror columns, a fresh streak, and the mark cleared only if it
   *  is still the one read. A miss on a row edited since means two pushes
   *  overlapped and the older may have landed last at Google, so the row is
   *  marked again for one more push of what it says now; a miss with no edit
   *  (another push of the same state cleared it) stays as it is, so it converges.
   *  The Meet URL fills `link` only while still empty. */
  async settle(
    id: string,
    seen: PushSeen,
    event: { eventId: string; eventUrl: string | null; ownerId: string } | null,
    meetUrl: string | null,
  ): Promise<void> {
    await this.db
      .update(meeting)
      .set({
        ...(event
          ? {
              googleEventId: event.eventId,
              googleEventUrl: event.eventUrl,
              googleOwnerId: event.ownerId,
            }
          : {}),
        ...(meetUrl ? { link: sql`COALESCE(${meeting.link}, ${meetUrl})` } : {}),
        calendarDirtyAt: sql`CASE WHEN ${meeting.calendarDirtyAt} = ${seen.mark}::timestamptz THEN NULL
          WHEN ${seen.mark}::timestamptz IS NOT NULL
            AND ${meeting.updatedAt} IS DISTINCT FROM ${seen.updatedAt}::timestamptz THEN now()
          ELSE ${meeting.calendarDirtyAt} END`,
        calendarAttempts: 0,
        calendarAlertedAt: null,
      })
      .where(eq(meeting.id, id))
  }

  /** One more failed background push. `rang` = this very failure reached
   *  `alertAt` with nobody told yet, so the caller rings in this `tx`. */
  async failed(
    tx: Db,
    id: string,
    alertAt: number,
  ): Promise<{ rang: boolean; row: MeetingRowDb } | null> {
    const reached = sql`${meeting.calendarAlertedAt} IS NULL AND ${meeting.calendarAttempts} + 1 >= ${alertAt}`
    const [hit] = await tx
      .update(meeting)
      .set({
        calendarAttempts: sql`${meeting.calendarAttempts} + 1`,
        calendarAlertedAt: sql`CASE WHEN ${reached} THEN now() ELSE ${meeting.calendarAlertedAt} END`,
      })
      .where(and(eq(meeting.id, id), isNotNull(meeting.calendarDirtyAt)))
      .returning()
    if (!hit) return null
    /* Attempts reset only together with the alert (`settle`), so landing exactly
       on `alertAt` is the failure that rang. */
    return { rang: hit.calendarAttempts === alertAt, row: hit }
  }

  /** Dirty rows whose next try is due, oldest first. Seven days after the last
   *  write, given up, as `cancelledWithEvent` gives up: nobody is fixing it. */
  async duePushes(): Promise<string[]> {
    const rows = await this.db
      .select({ id: meeting.id })
      .from(meeting)
      .where(
        and(
          isNotNull(meeting.calendarDirtyAt),
          isNull(meeting.cancelledAt),
          sql`${meeting.calendarDirtyAt} > now() - interval '7 days'`,
          dueBy(meeting.calendarAttempts, meeting.calendarDirtyAt),
        ),
      )
      .orderBy(asc(meeting.calendarDirtyAt))
      .limit(CALENDAR_BATCH)
    return rows.map((r) => r.id)
  }

  /** In the transaction that deletes the meeting. A second drop of the same id
   *  cannot happen (the row is gone), so a conflict is only a replay. */
  async entomb(tx: Db, drop: { meetingId: string; eventId: string; ownerId: string }) {
    await tx.insert(meetingCalendarDrop).values(drop).onConflictDoNothing({
      target: meetingCalendarDrop.meetingId,
    })
  }

  async tombstoneOf(meetingId: string): Promise<MeetingCalendarDrop | null> {
    const [row] = await this.db
      .select()
      .from(meetingCalendarDrop)
      .where(eq(meetingCalendarDrop.meetingId, meetingId))
      .limit(1)
    return row ?? null
  }

  async dueTombstones(): Promise<MeetingCalendarDrop[]> {
    return this.db
      .select()
      .from(meetingCalendarDrop)
      .where(dueBy(meetingCalendarDrop.attempts, meetingCalendarDrop.createdAt))
      .orderBy(asc(meetingCalendarDrop.createdAt))
      .limit(CALENDAR_BATCH)
  }

  async bury(id: string): Promise<void> {
    await this.db.delete(meetingCalendarDrop).where(eq(meetingCalendarDrop.id, id))
  }

  /** The attempts count after this failure. */
  async tombstoneFailed(id: string): Promise<number> {
    const [row] = await this.db
      .update(meetingCalendarDrop)
      .set({ attempts: sql`${meetingCalendarDrop.attempts} + 1` })
      .where(eq(meetingCalendarDrop.id, id))
      .returning({ attempts: meetingCalendarDrop.attempts })
    return row?.attempts ?? 0
  }
}
