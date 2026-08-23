import { z } from 'zod'
import { Bool, MaObject, Moc } from '../primitives'
import { PageQuery, paged } from '../pagination'
import { ExitReason, LeadCategory, LeadTier, StageKey } from './enums'

/** Sổ lead — module 2 của nhánh Sales. `GET /sales/leads`.
 *
 *  Đây là hợp đồng của MỘT DÒNG SỔ, không phải của cả hồ sơ lead. `history`,
 *  `profile` 32 trường và bản ghi hội thoại thuộc về `GET /sales/leads/:code`:
 *  bắt sổ 100 dòng chở theo lịch sử của từng dòng là gửi vài trăm KB cho một
 *  cái bảng chỉ hiện chín cột. */

export const LeadRow = z.object({
  code: MaObject,
  company: z.string().min(1),
  province: z.string().min(1),
  category: LeadCategory,
  tier: LeadTier,

  /** Số ô BẮT BUỘC đã điền, 0…6. Đây là thứ cổng init data nhìn vào. */
  requiredFilled: z.number().int().min(0).max(6),
  /** Số ô tuỳ chọn đã điền, 0…4. */
  optionalFilled: z.number().int().min(0).max(4),

  /** Ai đang giữ. Vắng = còn ở kho chung, chưa ai nhận.
   *
   *  Là `id` chứ KHÔNG phải tên hiển thị — nợ số 2 của
   *  `docs/ban-giao-backend.md`: trục phạm vi của E2 đang so
   *  `ref.owner === actor.name`, nên hai người trùng tên là hai người thấy sổ
   *  của nhau. Hợp đồng chốt ở id; chỗ nào cần tên thì tra bảng actor. */
  ownerId: z.string().min(1).optional(),

  stage: StageKey.optional(),
  dealCode: MaObject.optional(),
  contractCode: MaObject.optional(),

  /** Số ngày nằm ở chỗ hiện tại. */
  daysHere: z.number().int().nonnegative(),

  /** Mã nguồn — dây nối module 1 (chiến dịch) ↔ module 2 (lead). */
  source: z.string().min(1),

  createdAt: Moc,
  exitReason: ExitReason.optional(),
  exitedAt: Moc.optional(),
})

/** Ô lọc của sổ. Trùng đúng hợp đồng query trên URL bên
 *  `apps/web/src/app/url.ts` — một bộ lọc, một tên, hai đầu. */
export const LeadBookQuery = PageQuery.extend({
  stage: StageKey.optional(),
  tier: LeadTier.optional(),
  category: LeadCategory.optional(),
  /** Chỉ dòng còn trong luồng (chưa rơi, chưa ký). */
  running: Bool.optional(),
  q: z.string().trim().min(1).max(120).optional(),
})

export const LeadBookResponse = paged(LeadRow)

export type LeadRow = z.infer<typeof LeadRow>
export type LeadBookQuery = z.infer<typeof LeadBookQuery>
export type LeadBookResponse = z.infer<typeof LeadBookResponse>
