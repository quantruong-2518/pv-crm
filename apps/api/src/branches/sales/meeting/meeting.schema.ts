import { check, index, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { MeetingSide } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'
import { lead } from '../lead/lead.schema'

/** Cuộc họp với một lead — sổ các lần đã gặp, và chỗ ở của transcript.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO KHÔNG NHÉT VÀO `sales.touch`
 *  ------------------------------------------------------------------
 *  `touch` chở đúng một câu tiếng Việt cho mỗi sự kiện. Nó không có chỗ cho
 *  link họp, transcript và hai danh sách người — và nới nó ra nghĩa là bốn cột
 *  gần như luôn NULL nằm trên MỌI dòng của bảng bận nhất nhánh này, để đúng
 *  một loại dòng dùng tới.
 *
 *  Hai bảng KHÔNG tranh nhau: ghi một cuộc họp thì `MeetingService` ghi kèm
 *  một dòng `touch`, nên dòng thời gian vẫn kể đủ chuyện. Dòng đó là
 *  `gap-lan-dau` cho cuộc họp sớm nhất của lead và `cham` cho mọi cuộc sau —
 *  đây chính là cửa ghi mà `TouchKind` đã chừa chỗ từ đầu với ghi chú "no door
 *  writes this yet".
 *
 *  ------------------------------------------------------------------
 *  KHÔNG CÓ CỘT `is_first`, VÀ ĐÓ LÀ QUYẾT ĐỊNH ĐÃ CHỐT
 *  ------------------------------------------------------------------
 *  "Lần gặp đầu" là cuộc họp có `at` NHỎ NHẤT của lead đó, tính lúc đọc. Cách
 *  còn lại — một cột cờ, hoặc một toggle người dùng bật — là nguồn sự thật thứ
 *  hai cho một sự kiện đã có nguồn, và ngày hai bên lệch nhau thì thẻ điểm Sổ
 *  lead nói một con số không ai truy được về dòng nào.
 *
 *  Hệ quả phải nói ra chứ không để ai tự phát hiện: ghi bổ sung một cuộc họp
 *  có `at` SỚM HƠN cuộc đang giữ ngôi thì ngôi đó chuyển. Đúng — sớm nhất là
 *  đầu tiên, bất kể thứ tự gõ vào — nhưng nghĩa là cờ ấy thuộc về TẬP dòng,
 *  không thuộc về một dòng, nên không client nào được nhớ nó qua một lượt ghi.
 *
 *  ------------------------------------------------------------------
 *  `at` LÀ LÚC HỌP, `created_at` LÀ LÚC GÕ
 *  ------------------------------------------------------------------
 *  Hai mốc khác nhau mỗi lần ai đó viết lại buổi hôm qua, và thẻ điểm đếm theo
 *  `at`. Gộp một cột là mất khả năng ghi bù — thứ chắc chắn xảy ra, vì không
 *  ai mở CRM giữa buổi họp. */
export const meeting = sales.table(
  'meeting',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Khoá ngoại THẬT, khác `touch.subject_code`: cuộc họp chỉ treo vào lead,
     *  không đa hình, nên không có lý do gì để bỏ hàng rào. Không
     *  `ON DELETE CASCADE` — `lead.schema.ts` viết rõ lead rời phễu bằng
     *  `exit_reason` chứ không bị xoá, nên một CASCADE ở đây là hàng rào cho
     *  một việc không được phép xảy ra. */
    leadCode: text('lead_code')
      .notNull()
      .references(() => lead.code),

    /** Lúc CUỘC HỌP diễn ra. Không mặc định `now()`: ghi bù là đường đi bình
     *  thường của bảng này, và một mặc định lặng lẽ biến buổi hôm qua thành
     *  buổi hôm nay ở đúng cột mà thẻ điểm đếm. */
    at: timestamp('at', { withTimezone: true }).notNull(),

    title: text('title').notNull(),
    link: text('link'),
    transcript: text('transcript'),

    /** Người GÕ dòng này, chụp lại tên như `touch.by` — hồ sơ một buổi họp là
     *  hồ sơ của lúc ĐÓ, nên join `actor` lúc đọc sẽ khiến buổi cũ mang tên
     *  mới của người ta, và không vẽ được gì cho người đã rời công ty. */
    by: text('by').notNull(),
    createdBy: text('created_by').references(() => actor.id),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** Câu hỏi duy nhất bảng này trả lời: "các buổi họp của lead X, mới trước".
     *  Hai cột đúng thứ tự đó nên câu đọc không cần lượt sort nào — và cùng chỉ
     *  mục đó phục vụ luôn `MIN(at)` của phép tính lần gặp đầu. */
    index('meeting_lead_idx').on(t.leadCode, t.at.desc()),
    check('meeting_no_blank', sql`"title" <> '' AND "by" <> '' AND "lead_code" <> ''`),
    /** Link đi thẳng vào `href` của màn. Một giá trị `javascript:` ở đó là một
     *  cú XSS lưu trữ, nên lược đồ từ chối nó chứ không chỉ zod ở cửa vào:
     *  bảng này còn nhận dữ liệu từ migration và từ tay người, không chỉ từ
     *  HTTP. */
    check('meeting_link_la_web', sql`"link" IS NULL OR "link" ~ '^https?://'`),
  ],
)

/** Người dự một buổi họp — cả hai phía, một bảng.
 *
 *  Bảng con chứ không phải hai cột `text[]` trên `meeting`: một người dự có
 *  ba thuộc tính (phía nào, có phải người của mình không, chức danh gì), và
 *  ba mảng song song là hình dạng chắc chắn lệch nhau ở lần sửa thứ hai.
 *
 *  `actor_id` NULL là trạng thái BÌNH THƯỜNG chứ không phải dữ liệu thiếu: nó
 *  đúng với mọi khách, vì phía khách chưa có sổ nào để trỏ tới — `LeadContact`
 *  hôm nay vẫn sinh ra từ fixture đóng băng. Ngày có bảng liên hệ thật thì đây
 *  là chỗ đầu tiên mọc thêm một khoá ngoại. */
export const meetingAttendee = sales.table(
  'meeting_attendee',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** CASCADE ở đây thì đúng, khác hẳn `lead_code` bên trên: người dự không
     *  tồn tại độc lập với buổi họp, và xoá một buổi họp phải mang họ theo —
     *  ngược lại là những dòng mồ côi không câu truy vấn nào còn tìm ra. */
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meeting.id, { onDelete: 'cascade' }),

    side: text('side').$type<MeetingSide>().notNull(),
    actorId: text('actor_id').references(() => actor.id),
    name: text('name').notNull(),
    role: text('role'),
  },
  (t) => [
    index('meeting_attendee_meeting_idx').on(t.meetingId),
    check('meeting_attendee_side_known', sql`"side" IN ('host', 'guest')`),
    /** Chủ trì là người của mình, và cả điểm của trường này là để sau sáu
     *  tháng còn trả lời được "ai chạy buổi đó" — một cái tên gõ tay không trả
     *  lời được khi có hai người trùng tên. */
    check('meeting_attendee_host_co_actor', sql`"side" <> 'host' OR "actor_id" IS NOT NULL`),
    check('meeting_attendee_no_blank', sql`"name" <> ''`),
  ],
)

export type MeetingRowDb = typeof meeting.$inferSelect
export type MeetingValues = typeof meeting.$inferInsert
export type MeetingAttendeeRowDb = typeof meetingAttendee.$inferSelect
export type MeetingAttendeeValues = typeof meetingAttendee.$inferInsert
