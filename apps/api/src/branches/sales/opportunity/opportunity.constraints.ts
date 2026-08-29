import type { ConstraintBook } from '@api/platform/http/db-error'

/** Ràng buộc của `opportunity` + `opportunity_owner` → câu nói với người dùng.
 *
 *  Cùng luật với `lead.constraints.ts`: đây là bảng NHÃN, không phải bảng luật.
 *  Luật nằm ở `opportunity.schema.ts` và chỉ nằm ở đó; sửa ràng buộc thì sửa
 *  bên schema rồi sang đây sửa câu. Ràng buộc không có mặt ở đây không hỏng gì
 *  — bộ dịch lùi về câu chung theo SQLSTATE — nó chỉ đổi một câu người đọc
 *  được thành "máy chủ gặp sự cố".
 *
 *  Khoá là tên POSTGRES báo về, không phải tên biến Drizzle. Ba tên `*_fk` do
 *  Drizzle sinh từ tên bảng và tên cột, nên đổi tên cột là đổi khoá ở đây;
 *  chúng chép từ file migration, chỗ duy nhất nói chắc tên nào đã vào database.
 *
 *  Tên ô ở `fields` là tên theo HỢP ĐỒNG (`saleOwners`, `expectedClose`), không
 *  phải tên cột — màn tô đỏ theo tên nó biết. */
export const OPPORTUNITY_CONSTRAINTS: ConstraintBook = {
  /** Tiền luôn mang đơn vị. Cửa `POST /sales/opportunities` đòi cả hai nên zod
   *  chặn trước; đây là lưới cho cửa ghi thứ hai của ngày mai. */
  opportunity_money_pair: {
    kind: 'invalid',
    fields: ['amount', 'currency'],
    message: 'Giá trị đơn phải đi kèm đơn vị tiền: điền cả hai ô, hoặc bỏ trống cả hai.',
  },

  opportunity_lost_closed: {
    kind: 'invalid',
    fields: ['lossReason'],
    message:
      'Đơn có lý do thua thì phải được đóng — một đơn thua mà vẫn đang mở thì không ai đọc được.',
  },

  opportunity_lost_state_closed: {
    kind: 'invalid',
    fields: ['state'],
    message: 'Chọn Close lost là đóng sổ đơn — không để đơn thua nằm lại trong năm cột.',
  },

  opportunity_state_known: {
    kind: 'invalid',
    fields: ['state'],
    message:
      'Trạng thái không hợp lệ. "Close won" không đặt được ở đây: đơn thắng là đơn CÓ HỢP ĐỒNG, ký ở hồ sơ cơ hội.',
  },

  /** Lead không có thật. Service đã trả 404 gọi tên mã trước khi tới đây, nên
   *  khoá này chỉ ăn khi lead bị xoá đúng giữa lúc đọc và lúc ghi. */
  opportunity_lead_code_lead_code_fk: {
    kind: 'invalid',
    fields: ['leadCode'],
    message: 'Không có lead nào mang mã này — cơ hội phải mọc ra từ một lead có thật.',
  },

  /** Id người không có trong sổ nhân sự. Đây là hàng rào THẬT cho hai ô chọn
   *  người: service cố tình không kiểm trước, vì khoá ngoại giữ cho mọi cửa
   *  chứ không riêng cửa nào nhớ kiểm. */
  opportunity_owner_actor_id_actor_id_fk: {
    kind: 'invalid',
    fields: ['saleOwners', 'bdOwners'],
    message: 'Có người không còn trong sổ nhân sự — chọn lại người đứng đơn.',
  },

  opportunity_owner_role_known: {
    kind: 'invalid',
    fields: ['saleOwners', 'bdOwners'],
    message: 'Vai trên đơn chỉ có Sale đứng đơn hoặc BD mở cửa.',
  },
}
