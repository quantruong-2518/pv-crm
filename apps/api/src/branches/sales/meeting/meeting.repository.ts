import { and, asc, count, desc, eq, exists, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { contact } from '../contact/contact.schema'
import { lead } from '../lead/lead.schema'
import { opportunity, type OpportunityRowDb } from '../opportunity/opportunity.schema'
import { touch } from '../touch/touch.schema'
import {
  meeting,
  meetingAttendee,
  type MeetingAttendeeRowDb,
  type MeetingAttendeeValues,
  type MeetingRowDb,
  type MeetingValues,
} from './meeting.schema'

/** SQL của sổ cuộc họp. Không quyết định gì, không biết quyền.
 *
 *  Hai bảng luôn đi cùng nhau: một buổi họp không có người dự là một dòng chưa
 *  đọc được, nên mọi lượt đọc lấy cả hai và mọi lượt ghi đặt cả hai trong CÙNG
 *  một transaction. Đó là lý do các hàm ghi đều nhận `tx` từ ngoài chứ không
 *  tự mở — service là chỗ biết một lượt ghi gồm mấy việc (còn một dòng `touch`
 *  nữa), và một transaction phải bọc trọn cả cụm. */
@Injectable()
export class MeetingRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** The meetings of one lead or deal, newest first — `meeting_subject_idx` order. */
  async bySubject(code: string): Promise<MeetingRowDb[]> {
    return this.db
      .select()
      .from(meeting)
      .where(eq(meeting.subjectCode, code))
      .orderBy(desc(meeting.at))
  }

  /** The actor's not-yet-held meetings starting in `[from, to)` and not over by
   *  `now`, earliest first. Own = booked by them or hosted by them. */
  async upcomingOf(actorId: string, from: Date, to: Date, now: Date): Promise<MeetingRowDb[]> {
    const hosts = this.db
      .select({ one: sql`1` })
      .from(meetingAttendee)
      .where(
        and(
          eq(meetingAttendee.meetingId, meeting.id),
          eq(meetingAttendee.side, 'host'),
          eq(meetingAttendee.actorId, actorId),
        ),
      )
    return this.db
      .select()
      .from(meeting)
      .where(
        and(
          isNull(meeting.heldAt),
          gte(meeting.at, from),
          lt(meeting.at, to),
          /* A pre-0050 row has no duration: it is over the moment it starts. */
          sql`${meeting.at} + make_interval(mins => COALESCE(${meeting.durationMinutes}, 0)) > ${now.toISOString()}::timestamptz`,
          or(eq(meeting.createdBy, actorId), exists(hosts)),
        ),
      )
      .orderBy(asc(meeting.at), asc(meeting.id))
  }

  /** Người dự của NHIỀU buổi trong một câu.
   *
   *  Một câu cho cả trang chứ không một câu mỗi buổi: mười buổi họp là mười
   *  vòng tới Neon, và Neon tính tiền theo lượt hỏi. `inArray` rỗng là một câu
   *  SQL hợp lệ nhưng vô nghĩa, nên chặn trước. */
  async attendeesOf(ids: readonly string[], handle: Db = this.db): Promise<MeetingAttendeeRowDb[]> {
    if (ids.length === 0) return []
    return handle
      .select()
      .from(meetingAttendee)
      .where(inArray(meetingAttendee.meetingId, [...ids]))
      .orderBy(asc(meetingAttendee.side), asc(meetingAttendee.name))
  }

  /** Một buổi, để biết nó có thật và treo vào lead nào — câu hỏi phạm vi hỏi
   *  trước khi cho sửa hay xoá. */
  async byId(id: string, handle: Db = this.db): Promise<MeetingRowDb | null> {
    const [row] = await handle.select().from(meeting).where(eq(meeting.id, id)).limit(1)
    return row ?? null
  }

  /** The row under `FOR UPDATE`: a change and close-meeting on one meeting
   *  take turns, so neither judges "not held yet" on a stale read. */
  async lock(tx: Db, id: string): Promise<MeetingRowDb | null> {
    const [row] = await tx.select().from(meeting).where(eq(meeting.id, id)).limit(1).for('update')
    return row ?? null
  }

  async byIds(ids: readonly string[]): Promise<MeetingRowDb[]> {
    if (ids.length === 0) return []
    return this.db
      .select()
      .from(meeting)
      .where(inArray(meeting.id, [...ids]))
  }

  /** Whether a meeting touch already sits at this exact moment — a write-up
   *  booked before 0084 got its touch at booking, so close-meeting must not
   *  write a second. Keyed on `at`: the booking set it to the meeting's start. */
  async hasMeetingTouch(tx: Db, code: string, at: Date): Promise<boolean> {
    const [row] = await tx
      .select({ one: sql`1` })
      .from(touch)
      .where(
        and(
          eq(touch.subjectCode, code),
          eq(touch.at, at),
          inArray(touch.kind, ['first-meeting', 'contacted']),
        ),
      )
      .limit(1)
    return row !== undefined
  }

  /** The deal a meeting on an `OP-` hangs off, for its edit rule. */
  async dealOf(code: string, handle: Db = this.db): Promise<OpportunityRowDb | null> {
    const [row] = await handle.select().from(opportunity).where(eq(opportunity.code, code)).limit(1)
    return row ?? null
  }

  async insert(tx: Db, values: MeetingValues): Promise<string> {
    const [row] = await tx.insert(meeting).values(values).returning({ id: meeting.id })
    /* `returning` trên một `INSERT` một dòng luôn trả một dòng; nếu không thì
       chuyện đã hỏng ở tầng dưới và ném ở đây là đúng chỗ. */
    if (!row) throw new Error('INSERT sales.meeting không trả về id')
    return row.id
  }

  async update(tx: Db, id: string, values: Partial<MeetingValues>): Promise<void> {
    await tx
      .update(meeting)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(meeting.id, id))
  }

  /** The calendar mirror, written on the pool AFTER the booking committed.
   *  The Meet URL fills `link` only while it is still empty, in SQL: a link
   *  pasted meanwhile wins, with no read-then-write window. */
  async setEvent(
    id: string,
    event: { eventId: string; eventUrl: string | null; ownerId: string },
    meetUrl: string | null,
  ): Promise<void> {
    await this.db
      .update(meeting)
      .set({
        googleEventId: event.eventId,
        googleEventUrl: event.eventUrl,
        googleOwnerId: event.ownerId,
        ...(meetUrl ? { link: sql`COALESCE(${meeting.link}, ${meetUrl})` } : {}),
      })
      .where(eq(meeting.id, id))
  }

  /** Work emails of the hosts, for the calendar invite. */
  async actorEmails(ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) return []
    const rows = await this.db
      .select({ email: actor.email })
      .from(actor)
      .where(inArray(actor.id, [...ids]))
    return rows.map((r) => r.email)
  }

  /** Emails of guests picked from the contact book; typed-in guests have none. */
  async contactEmails(codes: readonly string[]): Promise<string[]> {
    if (codes.length === 0) return []
    const rows = await this.db
      .select({ email: contact.email })
      .from(contact)
      .where(inArray(contact.code, [...codes]))
    return rows.flatMap((r) => (r.email ? [r.email] : []))
  }

  /** The customer's address — where an `onsite` meeting happens. */
  async siteOf(subjectCode: string): Promise<string | null> {
    const leadCode = await this.leadOfSubject(subjectCode)
    if (!leadCode) return null
    const [row] = await this.db
      .select({ address: lead.address })
      .from(lead)
      .where(eq(lead.code, leadCode))
      .limit(1)
    return row?.address ?? null
  }

  async setAttendees(tx: Db, id: string, rows: readonly MeetingAttendeeValues[]): Promise<void> {
    /* Thay nguyên danh sách, không hợp nhất — `MeetingPatch` đã hứa đúng thế.
       Hợp nhất cần một id ổn định cho từng người, tức người dự phải là tài
       nguyên có cửa riêng; hôm nay màn sửa cả buổi trong một biểu mẫu. */
    await tx.delete(meetingAttendee).where(eq(meetingAttendee.meetingId, id))
    if (rows.length > 0) await tx.insert(meetingAttendee).values([...rows])
  }

  async remove(tx: Db, id: string): Promise<void> {
    /* Người dự đi theo bằng `ON DELETE CASCADE`, không xoá tay ở đây — hàng rào
       ở lược đồ là thứ còn đúng cả khi dòng bị xoá từ một cửa khác. */
    await tx.delete(meeting).where(eq(meeting.id, id))
  }

  /** Which lead each of these contact codes belongs to.
   *
   *  `sales.contact.lead_code` is `NOT NULL`, so one statement answers the whole
   *  question and a code missing from the result simply is not in the book.
   *  Edits run it on their `tx`; a booking runs it on the pool BEFORE the
   *  comm record's transaction, since a refusal must come before any write.
   *
   *  Lives in this repository rather than reaching for `ContactRepository`
   *  because it is one projection of one column — importing a sibling module's
   *  service to ask it would pull `MeetingModule` into a dependency it needs for
   *  nothing else. Same-branch table import, the rule `meeting.schema.ts`
   *  already follows for the foreign key itself. */
  async contactLeadsOf(
    codes: readonly string[],
    handle: Db = this.db,
  ): Promise<{ code: string; leadCode: string }[]> {
    if (codes.length === 0) return []
    return handle
      .select({ code: contact.code, leadCode: contact.leadCode })
      .from(contact)
      .where(inArray(contact.code, [...codes]))
  }

  /** The lead whose contact book serves a subject: itself for an `LD-`, its
   *  `lead_code` for an `OP-` (a deal has no contact book of its own). */
  async leadOfSubject(code: string, handle: Db = this.db): Promise<string | null> {
    if (!code.startsWith('OP-')) return code
    const [row] = await handle
      .select({ leadCode: opportunity.leadCode })
      .from(opportunity)
      .where(eq(opportunity.code, code))
      .limit(1)
    return row?.leadCode ?? null
  }

  /** Buổi họp SỚM NHẤT của lead (hoặc cơ hội) đã có chưa — câu duy nhất cửa ghi cần để biết
   *  dòng `touch` sắp ghi là `first-meeting` hay `contacted`.
   *
   *  Đếm chứ không đọc dòng: câu hỏi là "đã có buổi nào chưa", và một `count`
   *  không kéo transcript của buổi cũ về chỉ để bị vứt đi.
   *  `createdBefore` asks what the book held when a given row was typed. */
  async countOf(tx: Db, code: string, createdBefore?: Date): Promise<number> {
    const [row] = await tx
      .select({ n: count() })
      .from(meeting)
      .where(
        and(
          eq(meeting.subjectCode, code),
          createdBefore ? lt(meeting.createdAt, createdBefore) : undefined,
        ),
      )
    return row?.n ?? 0
  }
}
