import { asc, count, desc, eq, inArray } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
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

  /** Các buổi của một lead, mới trước. Đúng thứ tự chỉ mục `meeting_lead_idx`. */
  async byLead(code: string): Promise<MeetingRowDb[]> {
    return this.db
      .select()
      .from(meeting)
      .where(eq(meeting.leadCode, code))
      .orderBy(desc(meeting.at))
  }

  /** Người dự của NHIỀU buổi trong một câu.
   *
   *  Một câu cho cả trang chứ không một câu mỗi buổi: mười buổi họp là mười
   *  vòng tới Neon, và Neon tính tiền theo lượt hỏi. `inArray` rỗng là một câu
   *  SQL hợp lệ nhưng vô nghĩa, nên chặn trước. */
  async attendeesOf(ids: readonly string[]): Promise<MeetingAttendeeRowDb[]> {
    if (ids.length === 0) return []
    return this.db
      .select()
      .from(meetingAttendee)
      .where(inArray(meetingAttendee.meetingId, [...ids]))
      .orderBy(asc(meetingAttendee.side), asc(meetingAttendee.name))
  }

  /** Một buổi, để biết nó có thật và treo vào lead nào — câu hỏi phạm vi hỏi
   *  trước khi cho sửa hay xoá. */
  async byId(id: string): Promise<MeetingRowDb | null> {
    const [row] = await this.db.select().from(meeting).where(eq(meeting.id, id)).limit(1)
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

  /** Buổi họp SỚM NHẤT của lead đã có chưa — câu duy nhất cửa ghi cần để biết
   *  dòng `touch` sắp ghi là `gap-lan-dau` hay `cham`.
   *
   *  Đếm chứ không đọc dòng: câu hỏi là "đã có buổi nào chưa", và một `count`
   *  không kéo transcript của buổi cũ về chỉ để bị vứt đi. */
  async countOf(tx: Db, code: string): Promise<number> {
    const [row] = await tx.select({ n: count() }).from(meeting).where(eq(meeting.leadCode, code))
    return row?.n ?? 0
  }
}
