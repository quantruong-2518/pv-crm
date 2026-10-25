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

  contract_collector_id_actor_id_fk: {
    kind: 'invalid',
    fields: ['collectorId'],
    message: 'Không tìm thấy người thu tiền. Chọn lại.',
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

  /** Two people ending one contract at once: the service checked first, so
   *  only that race reaches the key. */
  contract_termination_pkey: {
    kind: 'conflict',
    message: 'Hợp đồng này đã chấm dứt.',
  },

  contract_termination_other_has_note: {
    kind: 'invalid',
    fields: ['note'],
    message: 'Chọn "Khác" thì phải ghi lý do.',
  },

  contract_termination_collected_nonneg: {
    kind: 'invalid',
    message: 'Số tiền đã thu không hợp lệ.',
  },

  contract_termination_refunded_nonneg: {
    kind: 'invalid',
    fields: ['refundedAmount'],
    message: 'Số tiền hoàn lại không được âm.',
  },

  contract_termination_refund_within_collected: {
    kind: 'conflict',
    fields: ['refundedAmount'],
    message: 'Số tiền hoàn lại không được lớn hơn số đã thu.',
  },

  contract_termination_contract_code_contract_code_fk: {
    kind: 'invalid',
    message: 'Không tìm thấy hợp đồng này.',
  },

  contract_termination_terminated_by_id_actor_id_fk: {
    kind: 'invalid',
    message: 'Không tìm thấy tài khoản của bạn. Đăng nhập lại.',
  },

  /** The 0146 penalty fences (ADR 0124). zod and the service refuse first, so
   *  these only answer a body that slipped past both. */
  contract_termination_penalty_direction_known: {
    kind: 'invalid',
    fields: ['penalty.direction'],
    message: 'Chọn bên trả phạt.',
  },

  contract_termination_penalty_amount_positive: {
    kind: 'invalid',
    fields: ['penalty.amount'],
    message: 'Tiền phạt phải lớn hơn 0.',
  },

  contract_termination_penalty_direction_amount: {
    kind: 'invalid',
    fields: ['penalty.amount'],
    message: 'Tiền phạt cần có cả bên trả và số tiền.',
  },

  contract_termination_penalty_settled_pair: {
    kind: 'invalid',
    fields: ['penalty.settledOn'],
    message: 'Ngày tiền phạt chưa ghi được. Thử lại.',
  },

  contract_termination_penalty_settled_needs_penalty: {
    kind: 'invalid',
    fields: ['penalty.settledOn'],
    message: 'Chưa có tiền phạt nên chưa ghi được ngày trả.',
  },

  contract_termination_penalty_settled_by_id_actor_id_fk: {
    kind: 'invalid',
    message: 'Không tìm thấy tài khoản của bạn. Đăng nhập lại.',
  },
}
