import type { ConstraintBook } from '@api/platform/http/db-error'

/** Ràng buộc của `sales.contract` → câu nói với người dùng.
 *
 *  Cùng luật với hai sổ kia: bảng NHÃN, không phải bảng luật. Luật nằm ở
 *  `contract.schema.ts`.
 *
 *  Bảng này ít ràng buộc nhưng ràng buộc của nó đắt nhất nhánh: một dòng ở đây
 *  là câu trả lời cho "khách này đã ký chưa", và câu đó đi vào doanh số. Nên
 *  mọi câu dưới đây nói rõ đơn nào, chứ không nói "có lỗi xảy ra". */
export const CONTRACT_CONSTRAINTS: ConstraintBook = {
  /** Ký hai lần cùng một đơn. Service đã kiểm `signed` trước và trả 409 gọi tên
   *  mã hợp đồng đã có, nên khoá này chỉ ăn khi hai người bấm "Chốt thắng" trên
   *  cùng một đơn trong cùng một khoảnh khắc — và đó chính là lúc nó phải ăn. */
  contract_pkey: {
    kind: 'conflict',
    message: 'Mã hợp đồng này đã tồn tại — thử lại, máy chủ sẽ cấp số kế tiếp.',
  },

  /** Cặp `(opportunity_code, lead_code)` không khớp dòng cơ hội nào. Chỉ ăn khi
   *  đơn bị xoá đúng giữa lúc đọc và lúc ghi — mapper đọc `lead_code` từ chính
   *  dòng đơn nên hai cột không lệch nhau được. */
  contract_opportunity_fk: {
    kind: 'invalid',
    message: 'Không có cơ hội nào khớp — hợp đồng phải mọc ra từ một đơn có thật.',
  },

  contract_money_pair: {
    kind: 'invalid',
    fields: ['amount', 'currency'],
    message: 'Giá trị hợp đồng phải đi kèm đơn vị tiền: điền cả hai ô, hoặc bỏ trống cả hai.',
  },

  contract_owner_id_actor_id_fk: {
    kind: 'invalid',
    fields: ['ownerId'],
    message: 'Người ăn hoa hồng không còn trong sổ nhân sự — chọn lại người ký.',
  },
}
