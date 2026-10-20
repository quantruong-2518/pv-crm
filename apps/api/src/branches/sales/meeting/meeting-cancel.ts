import { Injectable, Logger } from '@nestjs/common'
import { MEETING_CANCELLED, type Actor } from '@pv/engines'
import {
  MEETING_CANCEL_CAUSE_LABEL,
  NOTIFICATION_DETAIL_COUNT,
  NOTIFICATION_DETAIL_REASON,
  type MeetingCancelCause,
} from '@pv/contracts'
import { CommRecordService } from '@api/platform/comms/comm-record.service'
import type { Db } from '@api/platform/db/db.module'
import { conflict } from '@api/platform/http/problem'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { MeetingCalendar } from './meeting-calendar'
import { CALENDAR_BATCH } from './meeting-calendar.repository'
import { MeetingRepository } from './meeting.repository'
import type { MeetingRowDb } from './meeting.schema'

/** The server's soft cancel: a lead or deal closed (deal lost, lead stopped,
 *  lead switched off), so its meetings still ahead will not happen. Called by
 *  those doors INSIDE their transaction — the meeting rows, their booked comm
 *  records and the booker's bell commit with the close, or not at all.
 *
 *  Google is told after the commit (`forgetCancelled`), never inside it, for
 *  `MeetingCalendar`'s reason; what fails there the worker's `MeetingCancelSweeper`
 *  retries, a batch an hour.
 *  Reopening the subject restores nothing, as withheld mail is not released
 *  (ADR 0068 §5). A person never cancels — they drop (`MeetingService.drop`). */
@Injectable()
export class MeetingCancel {
  private readonly log = new Logger('meeting.cancel')

  constructor(
    private readonly repo: MeetingRepository,
    private readonly records: CommRecordService,
    private readonly calendar: MeetingCalendar,
    private readonly hub: NotificationHub,
  ) {}

  /** Cancels and returns the subjects' future meetings. One bell per subject
   *  and booker, unless the booker closed it or `ring` is off (lead disable: a
   *  switched-off lead's line would open nothing). `who` null is the backfill:
   *  no bell, and the audit line is the system's. */
  async cancelFor(
    tx: Db,
    who: Actor | null,
    codes: readonly string[],
    cause: MeetingCancelCause,
    ring = true,
  ): Promise<MeetingRowDb[]> {
    const rows = await this.repo.cancelUpcoming(tx, codes, cause)
    if (rows.length === 0) return rows
    await this.records.cancelBooked(tx, rows, { actorId: who?.id ?? 'system', why: cause })
    if (who && ring) await this.ring(tx, who, rows, cause)
    return rows
  }

  /** After commit: each cancelled event leaves its booker's calendar, which
   *  mails the guests. Never throws — a failure is the sweeper's to retry. */
  async forgetCancelled(rows: readonly MeetingRowDb[]): Promise<void> {
    for (const row of rows) {
      if (!row.googleEventId && !row.calendarDirtyAt) continue
      try {
        if (await this.calendar.forget(row)) await this.repo.clearEvent(row.id)
        else await this.repo.forgetFailed(row.id)
      } catch (error) {
        this.log.warn(`forget cancelled ${row.id} failed — ${(error as Error).message}`)
      }
    }
  }

  /** The sweeper's pass: cancelled rows that may still hold an event, tried again. */
  async retryForget(): Promise<number> {
    const rows = await this.repo.cancelledWithEvent(CALENDAR_BATCH)
    await this.forgetCancelled(rows)
    return rows.length
  }

  private async ring(
    tx: Db,
    who: Actor,
    rows: readonly MeetingRowDb[],
    cause: MeetingCancelCause,
  ): Promise<void> {
    const groups = new Map<string, { bookerId: string; rows: MeetingRowDb[] }>()
    for (const row of rows) {
      if (!row.createdBy || row.createdBy === who.id) continue
      const key = `${row.subjectCode} ${row.createdBy}`
      const group = groups.get(key) ?? { bookerId: row.createdBy, rows: [] }
      groups.set(key, { ...group, rows: [...group.rows, row] })
    }
    if (groups.size === 0) return
    const labels = await this.repo.labelsOf(tx, [...new Set(rows.map((r) => r.subjectCode))])
    for (const { bookerId, rows: group } of groups.values()) {
      const [first] = group.sort((a, b) => (a.id < b.id ? -1 : 1))
      if (!first) continue
      await this.hub.announce(tx, {
        event: {
          name: MEETING_CANCELLED,
          ref: { code: first.subjectCode },
          actorId: who.id,
          audiences: { owner: [bookerId] },
          /* A meeting is cancelled once, so its id names this cancel for good. */
          occurrence: first.id,
        },
        subject: {
          kind: first.subjectCode.startsWith('OP-') ? 'opportunity' : 'lead',
          code: first.subjectCode,
          label: labels.get(first.subjectCode) ?? null,
        },
        detail: {
          [NOTIFICATION_DETAIL_COUNT]: group.length,
          [NOTIFICATION_DETAIL_REASON]: MEETING_CANCEL_CAUSE_LABEL[cause],
        },
      })
    }
  }
}

/** The refusal of every door that would change or close a cancelled meeting. */
export function refuseCancelled(row: Pick<MeetingRowDb, 'cancelCause'>): void {
  if (row.cancelCause) {
    throw conflict(`Lịch họp đã huỷ (${MEETING_CANCEL_CAUSE_LABEL[row.cancelCause]}).`)
  }
}
