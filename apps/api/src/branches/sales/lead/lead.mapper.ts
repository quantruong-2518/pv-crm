import type { ObjectRef } from '@pv/engines'
import type { LeadRow } from '@pv/contracts'
import type { LeadRowDb } from './lead.schema'

/** Hàng trong bảng ↔ dòng trong hợp đồng. Chỗ DUY NHẤT biết cả hai hình.
 *
 *  Có một tầng chuyển đổi tường minh chứ không trả thẳng hàng Drizzle ra
 *  ngoài: cột thêm vào bảng thì lộ ngay ra API mà không ai quyết định, và cột
 *  đổi tên thì hợp đồng vỡ lặng lẽ. Ở đây `tsc` bắt được cả hai. */
export function toContract(row: LeadRowDb): LeadRow {
  return {
    code: row.code,
    company: row.company,
    province: row.province,
    category: row.category,
    tier: row.tier,
    requiredFilled: row.requiredFilled,
    optionalFilled: row.optionalFilled,
    ...(row.ownerId ? { ownerId: row.ownerId } : {}),
    ...(row.stage ? { stage: row.stage } : {}),
    ...(row.dealCode ? { dealCode: row.dealCode } : {}),
    ...(row.contractCode ? { contractCode: row.contractCode } : {}),
    daysHere: row.daysHere,
    source: row.source,
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
