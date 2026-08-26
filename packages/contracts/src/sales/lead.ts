import { z } from 'zod'
import { Bool, MaObject, Moc } from '../primitives'
import { PageQuery, paged } from '../pagination'
import { ContactChannel, ExitReason, LeadCategory, LeadTier, StageKey } from './enums'

/** Sổ lead — module 2 của nhánh Sales. `GET /sales/leads`.
 *
 *  Đây là hợp đồng của MỘT DÒNG SỔ, không phải của cả hồ sơ lead. Hai mươi
 *  trường hồ sơ (`pain`, `budget`, `decision_maker`…), `history` và bản ghi hội
 *  thoại thuộc về `GET /sales/leads/:code`: bắt sổ 100 dòng chở theo hồ sơ đầy
 *  đủ của từng dòng là gửi vài trăm KB cho một cái bảng chỉ hiện chín cột.
 *
 *  ------------------------------------------------------------------
 *  BA TRƯỜNG BẮT BUỘC, PHẦN CÒN LẠI TUỲ CHỌN
 *  ------------------------------------------------------------------
 *  `company` · `contactName` · `email` — đối xứng đúng ba cột `NOT NULL` của
 *  bảng. Lý do nằm ở luồng chính: lead được chọn từ sổ để bắn MAS mail, và một
 *  lead không có email không tham gia được luồng đó.
 *
 *  Những trường từng bắt buộc mà nay không còn (`province`, `category`,
 *  `tier`, `source`) đổi vì cùng một lý do: lead vào bằng landing page chỉ có
 *  ba thứ trên, phần còn lại là thứ MOI được về sau. Bắt buộc chúng ở hợp đồng
 *  là bắt cửa vào phải bịa dữ liệu để qua cổng. */

export const LeadRow = z.object({
  code: MaObject,
  company: z.string().min(1),
  /** Người liên hệ — đích thật sự của mọi lần chạm. */
  contactName: z.string().min(1),
  email: z.string().email(),

  province: z.string().min(1).optional(),
  category: LeadCategory.optional(),
  tier: LeadTier.optional(),
  phone: z.string().min(1).optional(),
  contactChannel: ContactChannel.optional(),

  /** Số ô BẮT BUỘC đã moi được, 0…6. Đây là thứ cổng init data nhìn vào.
   *  Máy chủ tính bằng cột sinh, không ai ghi tay. */
  requiredFilled: z.number().int().min(0).max(6),
  /** Số ô tuỳ chọn đã moi được, 0…4. */
  optionalFilled: z.number().int().min(0).max(4),

  /** Ai đang giữ. Vắng = còn ở kho chung, chưa ai nhận.
   *
   *  Là `id` chứ KHÔNG phải tên hiển thị — nợ số 2 của
   *  `docs/ban-giao-backend.md`: hai người trùng tên là hai người thấy sổ của
   *  nhau. Hợp đồng chốt ở id; chỗ nào cần tên thì tra bảng actor. */
  ownerId: z.string().min(1).optional(),

  stage: StageKey.optional(),

  /** Số ngày nằm ở chỗ hiện tại. KHÔNG phải một cột — máy chủ tính từ
   *  `stage_since` lúc đọc, vì con số này đổi theo thời gian ngay cả khi không
   *  ai chạm vào dòng dữ liệu. */
  daysHere: z.number().int().nonnegative(),

  /** Mã nguồn — dây nối module 1 (chiến dịch) ↔ module 2 (lead). Vắng = lead
   *  vào thẳng, không qua chiến dịch nào; màn phải có nhóm "Không nguồn". */
  source: z.string().min(1).optional(),

  /** Điểm khả quan, cộng dồn từ các lần chạm. */
  score: z.number().int().nonnegative(),
  lastTouchAt: Moc.optional(),

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
  /** Chỉ dòng còn trong luồng.
   *
   *  "Còn chạy" = CHƯA rơi và CHƯA ký. Vế thứ hai không còn đọc được từ một
   *  cột trên lead — hợp đồng nay là một dòng của bảng `contract`, nối qua
   *  `lead_code`. Cùng định nghĩa với `isRunning()` bên engine; hai bên lệch
   *  nhau là hai màn cùng đọc một sổ mà hiện hai con số. */
  running: Bool.optional(),
  q: z.string().trim().min(1).max(120).optional(),
})

export const LeadBookResponse = paged(LeadRow)

export type LeadRow = z.infer<typeof LeadRow>
export type LeadBookQuery = z.infer<typeof LeadBookQuery>
export type LeadBookResponse = z.infer<typeof LeadBookResponse>
