import type { MeetingAttendee, MeetingRow } from '@pv/contracts'
import type { MeetingAttendeeRowDb, MeetingRowDb } from './meeting.schema'

/** Bảng ↔ dây. Không đọc gì, không quyết định gì trừ đúng một phép so sánh.
 *
 *  Hai việc mọi mapper của nhánh này đều làm: `Date` ra chuỗi ISO ở ĐÚNG một
 *  chỗ, và cột NULL thành trường VẮNG MẶT chứ không thành `null` — hợp đồng
 *  dùng `.optional()`, và `null` ở đó là một 500 lúc `parse` chứ không phải
 *  một ô rỗng.
 *
 *  Việc thứ ba, riêng của file này: gắn cờ `isFirst`. Nó KHÔNG đọc được từ một
 *  dòng, vì "lần gặp đầu" là thuộc tính của cả TẬP — xem docblock của
 *  `meeting.schema.ts`. Nên nó được tính ở đây, một lần, trên nguyên tập vừa
 *  đọc lên. */
export function toContract(
  row: MeetingRowDb,
  attendees: readonly MeetingAttendeeRowDb[],
  isFirst: boolean,
): MeetingRow {
  const of = (side: 'host' | 'guest'): MeetingAttendee[] =>
    attendees
      .filter((a) => a.side === side)
      .map((a) => ({
        side: a.side,
        ...(a.actorId ? { actorId: a.actorId } : {}),
        name: a.name,
        ...(a.role ? { role: a.role } : {}),
      }))

  return {
    id: row.id,
    leadCode: row.leadCode,
    at: row.at.toISOString(),
    title: row.title,
    ...(row.link ? { link: row.link } : {}),
    ...(row.transcript ? { transcript: row.transcript } : {}),
    hosts: of('host'),
    guests: of('guest'),
    isFirst,
    by: row.by,
    createdAt: row.createdAt.toISOString(),
  }
}

/** Cuộc họp SỚM NHẤT của tập — id của nó, hoặc `null` khi tập rỗng.
 *
 *  Phá hoà bằng `createdAt` rồi `id`, và cả hai bậc đều cần thiết: hai buổi có
 *  thể trùng `at` tới từng giây (ai đó ghi bù hai buổi cùng một mốc tròn), và
 *  một ngôi "lần gặp đầu" nhảy qua nhảy lại giữa hai dòng theo thứ tự Postgres
 *  trả về là thứ không ai gỡ được. Thứ tự này ổn định vì `id` là duy nhất. */
export function firstMeetingId(rows: readonly MeetingRowDb[]): string | null {
  let best: MeetingRowDb | null = null

  for (const row of rows) {
    if (best === null || isEarlier(row, best)) best = row
  }

  return best?.id ?? null
}

function isEarlier(a: MeetingRowDb, b: MeetingRowDb): boolean {
  if (a.at.getTime() !== b.at.getTime()) return a.at.getTime() < b.at.getTime()
  if (a.createdAt.getTime() !== b.createdAt.getTime())
    return a.createdAt.getTime() < b.createdAt.getTime()
  return a.id < b.id
}
