import type { ObjectRef } from '@pv/engines'
import type { LeadRow } from '@pv/contracts'
import type { LeadRowDb } from './lead.schema'

/** Một dòng đã đọc xong từ bảng, kèm thứ không phải cột.
 *
 *  `daysHere` KHÔNG có trong `LeadRowDb` vì nó không phải cột — máy chủ tính
 *  nó từ `stage_since` ngay trong câu truy vấn. Mang nó cạnh hàng thay vì nhét
 *  vào hàng để `tsc` vẫn phân biệt được "thứ bảng có" và "thứ câu hỏi tính
 *  ra".
 *
 *  Same reasoning now covers three more fields the contract needs:
 *  `ownerName` and `ownerEmail` come from the `actor` left join, `signed`
 *  from the `EXISTS(contract …)` subquery — none of the three is a column on
 *  `lead`, so none of them belongs inside `row` either. */
export type LeadRead = {
  row: LeadRowDb
  daysHere: number
  ownerName: string | null
  ownerEmail: string | null
  signed: boolean
}

/** Hàng trong bảng ↔ dòng trong hợp đồng. Chỗ DUY NHẤT biết cả hai hình.
 *
 *  Có một tầng chuyển đổi tường minh chứ không trả thẳng hàng Drizzle ra
 *  ngoài: cột thêm vào bảng thì lộ ngay ra API mà không ai quyết định, và cột
 *  đổi tên thì hợp đồng vỡ lặng lẽ. Ở đây `tsc` bắt được cả hai.
 *
 *  Hai mươi trường hồ sơ (`pain`, `budget`, `decision_maker`…) CỐ TÌNH vắng:
 *  chúng thuộc hợp đồng của `GET /sales/leads/:code`, không thuộc dòng sổ. */
export function toContract({ row, daysHere, ownerName, ownerEmail, signed }: LeadRead): LeadRow {
  return {
    code: row.code,
    company: row.company,
    contactName: row.contactName,
    email: row.email,
    ...(row.contactTitle ? { contactTitle: row.contactTitle } : {}),
    ...(row.province ? { province: row.province } : {}),
    ...(row.category ? { category: row.category } : {}),
    ...(row.tier ? { tier: row.tier } : {}),
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.contactChannel ? { contactChannel: row.contactChannel } : {}),
    requiredFilled: row.requiredFilled,
    optionalFilled: row.optionalFilled,
    ...(row.ownerId ? { ownerId: row.ownerId } : {}),
    ...(ownerName ? { ownerName } : {}),
    ...(ownerEmail ? { ownerEmail } : {}),
    ...(row.stage ? { stage: row.stage } : {}),
    daysHere,
    ...(row.source ? { source: row.source } : {}),
    signed,
    score: row.score,
    ...(row.lastTouchAt ? { lastTouchAt: row.lastTouchAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    ...(row.exitReason ? { exitReason: row.exitReason } : {}),
    ...(row.exitedAt ? { exitedAt: row.exitedAt.toISOString() } : {}),
  }
}

/** Hàng trong bảng → object của E1/E2.
 *
 *  `owner` là TÊN HIỂN THỊ, không phải id — vì trục phạm vi của E2 hiện so
 *  `ref.owner !== actor.name`. Đó là nợ số 2 của `docs/ban-giao-backend.md` và
 *  nó chưa được trả; câu truy vấn ở `lead.repository.ts` đã lọc bằng `id`
 *  (trục đúng), nên hàng rào thật không phụ thuộc vào chỗ này. Ngày engine so
 *  bằng `id`, xoá tham số `ownerName` và mọi thứ khớp lại. */
export function toRef(row: LeadRowDb, ownerName: string | null): ObjectRef {
  return {
    code: row.code,
    kind: 'LD',
    branch: 'Sales',
    label: row.company,
    ...(ownerName ? { owner: ownerName } : {}),
    ...(row.stage ? { state: row.stage } : {}),
  }
}
