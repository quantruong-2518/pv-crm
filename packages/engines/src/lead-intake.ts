/** Lead vào hệ bằng cách nào — HAI trục, không phải một danh sách.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO HAI TRỤC
 *  ------------------------------------------------------------------
 *  Fixture đã có `OriginKind` (`campaign · event · referral · self-sourced`) và
 *  nó trả lời đúng MỘT câu: lead này từ nguồn nào ra. Hai câu còn lại mà mọi
 *  phòng kinh doanh đều hỏi thì không có chỗ nào để kê:
 *
 *   · **Ai chủ động** — khách gọi vào hay mình gọi ra. Đây là trục quyết định
 *     cách chạm: lead inbound đang giơ tay nên gọi trong giờ, lead outbound
 *     chưa biết mình là ai nên phải có cớ để mở lời. Cùng một chiến dịch đẻ ra
 *     cả hai loại — chuỗi email là outbound, nhưng người bấm vào landing rồi
 *     điền form là inbound. Trộn vào `OriginKind` thì mất đúng chỗ đó.
 *   · **Dòng chui vào sổ bằng đường nào** — tự đổ về từ đợt, gõ tay, nạp tệp,
 *     quét mã tại chỗ, hay một hệ khác đẩy sang. Đây là trục quyết định LÒNG
 *     TIN vào dòng đó: một dòng quét badge có người thật đứng trước mặt, một
 *     dòng trong tệp mua về thì chưa ai xác minh gì.
 *
 *  Hai trục ĐỘC LẬP, và đó là điểm chính. Một lead `event` vào bằng `scan`
 *  (quét badge tại gian hàng) hoặc bằng `file` (danh sách đăng ký hôm sau mới
 *  xuất ra) — cùng một buổi, hai mức tin cậy khác nhau. Gộp hai trục thành một
 *  enum ba chục giá trị là cách chắc chắn để không ai lọc được theo trục nào.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO NẰM Ở @pv/engines CHỨ KHÔNG Ở FIXTURE
 *  ------------------------------------------------------------------
 *  Đây là TỪ VỰNG, không phải số liệu của một kỳ. Sáu thế và năm đường vào đúng
 *  y như vậy ở kịch bản Sao Đỏ, ở kịch bản thứ ba chưa có, và ở backend thật —
 *  còn `SOURCES` thì mỗi kịch bản một bảng. Để trong fixture thì kịch bản thứ
 *  hai phải chép lại, và hai bản chép sẽ lệch.
 *
 *  Cách VẼ (nhãn, hình, câu giải thích) không nằm ở đây — nó ở tầng app
 *  (`data/intake.ts`), cùng lý do `ORIGIN_FACE` nằm ở đó chứ không ở fixture:
 *  "inbound trông như thế nào" là cách trình bày của phòng kinh doanh, không
 *  phải kiến thức của platform (biên giới package · CLAUDE.md). */

import type { IntakeTrust } from '@pv/contracts'

// ---------------------------------------------------------------------------
// Trục A · Thế — ai chủ động
// ---------------------------------------------------------------------------

/** SÁU thế. Danh sách ĐÓNG, cùng luật với `EXIT_REASONS` và `CostKind`: không
 *  có thế thứ bảy, không có ô "khác".
 *
 *  Một ô "khác" ở đây đặc biệt độc: nó là chỗ mọi lead khó phân loại chui vào,
 *  và sau một quý nó thành thế lớn nhất bảng — lúc đó câu "kênh nào ra khách"
 *  hết trả lời được. Lead thật sự không xếp được vào sáu thế này là lead thiếu
 *  thông tin, và đó là một VẤN ĐỀ chứ không phải một hạng mục. */
export const LEAD_MOTIONS = [
  'inbound',
  'outbound',
  'event',
  'referral',
  'partner',
  'recycle',
] as const

export type LeadMotion = (typeof LEAD_MOTIONS)[number]

// ---------------------------------------------------------------------------
// Trục B · Đường vào — dòng chui vào sổ bằng cách nào
// ---------------------------------------------------------------------------

/** NĂM đường vào. Cũng là danh sách đóng, và cũng vì lý do trên.
 *
 *  `sync` là đường vào duy nhất mà hệ tự đi: đợt chạy xong, lead đổ về sổ.
 *  Bốn cái còn lại đều có người hoặc có hệ khác đứng sau. */
export const LEAD_INTAKES = ['sync', 'manual', 'file', 'scan', 'api'] as const

export type LeadIntake = (typeof LEAD_INTAKES)[number]

// ---------------------------------------------------------------------------
// Mức tin — hệ quả của đường vào, không phải một trường gõ tay
// ---------------------------------------------------------------------------

/** The trust levels are declared once, in `@pv/contracts`; this table only
 *  maps the five doors onto them. `scan` and `api` are VERIFIED because the
 *  customer handed over the data themselves; `sync` and `manual` are DECLARED
 *  because someone on our side owns the row; `file` is RAW until touched. */
export const INTAKE_TRUST: Record<LeadIntake, IntakeTrust> = {
  sync: 'DECLARED',
  manual: 'DECLARED',
  file: 'RAW',
  scan: 'VERIFIED',
  api: 'VERIFIED',
}

// ---------------------------------------------------------------------------
// Đường vào nào chở được thế nào
// ---------------------------------------------------------------------------

/** Cặp (thế, đường vào) nào có thật.
 *
 *  Không phải mọi cặp đều tồn tại, và bảng này nói ra chỗ đó thay vì để màn tự
 *  đoán: `sync` chỉ chở `outbound` và `inbound` (đợt gửi đi, hoặc người bấm
 *  landing của đợt) — một lead `referral` không bao giờ tự đổ về từ một đợt vì
 *  không có đợt nào gửi cho nó; `scan` chỉ chở `event` vì máy quét chỉ đứng ở
 *  sự kiện.
 *
 *  Dùng ở màn nạp tệp để lọc danh sách thế theo chỗ người dùng đang đứng, và ở
 *  module Cấu hình để in ra bảng sáu-nhân-năm. Cặp không có trong bảng thì
 *  không phải "chưa hỗ trợ" — nó là cặp KHÔNG XẢY RA. */
export const MOTION_BY_INTAKE: Record<LeadIntake, readonly LeadMotion[]> = {
  sync: ['outbound', 'inbound'],
  manual: ['inbound', 'outbound', 'referral', 'partner', 'recycle'],
  file: ['outbound', 'event', 'partner', 'recycle'],
  scan: ['event'],
  api: ['inbound', 'partner'],
}

/** Cặp này có thật không. */
export function intakeCarries(intake: LeadIntake, motion: LeadMotion): boolean {
  return MOTION_BY_INTAKE[intake].includes(motion)
}
