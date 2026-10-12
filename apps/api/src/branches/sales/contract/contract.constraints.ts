import type { ConstraintBook } from '@api/platform/http/db-error'

/** Ràng buộc của `sales.contract` → câu nói với người dùng.
 *
 *  Cùng luật với hai sổ kia: bảng NHÃN, không phải bảng luật. Luật nằm ở
 *  `contract.schema.ts`.
 *
 *  Bảng này ít ràng buộc nhưng ràng buộc của nó đắt nhất nhánh: một dòng ở đây
 *  là câu trả lời cho "khách này đã ký chưa", và câu đó đi vào doanh số. Nên
 *  mọi câu dưới đây nói rõ đơn nào, chứ không nói "có lỗi xảy ra". */
const LANE_MOVED = 'Người đứng tên cơ hội vừa thay đổi — tải lại trang rồi ký lại.'

export const CONTRACT_CONSTRAINTS: ConstraintBook = {
  /** Ký hai lần cùng một đơn. Service đã kiểm `signed` trước và trả 409 gọi tên
   *  mã hợp đồng đã có, nên khoá này chỉ ăn khi hai người bấm "Chốt thắng" trên
   *  cùng một đơn trong cùng một khoảnh khắc — và đó chính là lúc nó phải ăn. */
  contract_pkey: {
    kind: 'conflict',
    message: 'Mã hợp đồng này đã có. Thử lại.',
  },

  /** Cặp `(opportunity_code, lead_code)` không khớp dòng cơ hội nào. Chỉ ăn khi
   *  đơn bị xoá đúng giữa lúc đọc và lúc ghi — mapper đọc `lead_code` từ chính
   *  dòng đơn nên hai cột không lệch nhau được. */
  contract_opportunity_fk: {
    kind: 'invalid',
    message: 'Không tìm thấy cơ hội của hợp đồng này.',
  },

  contract_money_pair: {
    kind: 'invalid',
    fields: ['amount', 'currency'],
    message: 'Giá trị hợp đồng cần có đơn vị tiền. Điền cả hai ô hoặc để trống cả hai.',
  },

  contract_owner_id_actor_id_fk: {
    kind: 'invalid',
    fields: ['ownerId'],
    message: 'Không tìm thấy người hưởng hoa hồng. Chọn lại.',
  },

  /** The signing-day snapshot (ADR 0086) is copied from `opportunity_owner`,
   *  whose own fences already hold — only a deal changed mid-sign trips these. */
  contract_participant_role_known: {
    kind: 'conflict',
    message: LANE_MOVED,
  },

  contract_participant_primary_is_sale: {
    kind: 'conflict',
    message: LANE_MOVED,
  },

  contract_participant_one_primary_idx: {
    kind: 'conflict',
    message: LANE_MOVED,
  },
}
