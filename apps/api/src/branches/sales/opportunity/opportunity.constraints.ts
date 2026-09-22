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

  /** Going into care demands all three: off the board, a reason, and the column
   *  remembered. `POST /:code/care` writes them in one UPDATE, so this sentence
   *  only ever answers a second write door added later. */
  opportunity_care_closed: {
    kind: 'invalid',
    fields: ['reasonKey'],
    message:
      'Đẩy đơn sang danh sách chăm sóc thì phải có lý do và phải đóng sổ đơn — thiếu một trong hai thì không ai đọc lại được.',
  },

  opportunity_open_has_no_care: {
    kind: 'invalid',
    fields: ['reasonKey'],
    message: 'Đơn đang triển khai không mang lý do chăm sóc — mở lại đơn là xoá sạch ba ô đó.',
  },

  opportunity_care_from_stage_known: {
    kind: 'invalid',
    message: 'Cột để mở lại đơn không nằm trong năm cột của bảng.',
  },

  opportunity_state_known: {
    kind: 'invalid',
    message:
      'Trạng thái lưu chỉ có "đang triển khai" hoặc "danh sách chăm sóc". Đơn thắng là đơn CÓ HỢP ĐỒNG, ký ở hồ sơ cơ hội.',
  },

  /** A column and its clock travel together or not at all. Only the lifecycle
   *  writer sets the pair, so this is a net under a future write door. */
  opportunity_stage_clock: {
    kind: 'invalid',
    message: 'Đơn đứng ở một cột thì phải có mốc vào cột đó, và ngược lại.',
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

  opportunity_probability_range: {
    kind: 'invalid',
    fields: ['probability'],
    message: 'Xác suất thắng là một số từ 0 đến 100.',
  },

  /** The COMPOSITE foreign key `(product_id, list)` into `config_id_list`. It
   *  catches both kinds of mistake with one constraint, which is why the key is
   *  composite at all: an id that does not exist, and an id that exists but
   *  belongs to another list ('EX-03' is an exit reason, not a product). */
  opportunity_product_config_fk: {
    kind: 'invalid',
    fields: ['products'],
    message: 'Có mục không nằm trong danh mục Sản phẩm/dịch vụ — chọn lại từ danh sách.',
  },

  opportunity_product_pk: {
    kind: 'invalid',
    fields: ['products'],
    message: 'Một sản phẩm chỉ chọn được một lần trên cùng một đơn.',
  },

  /** A user should never see the two sentences below: every column move goes
   *  through `OpportunityLifecycle`, which writes a history row only when the
   *  column really changed. They exist so that a write door added later can read
   *  what it got wrong, instead of getting a 500 naming a constraint. */
  opportunity_stage_event_moved: {
    kind: 'invalid',
    message:
      'Một dòng lịch sử phải ghi một lượt đổi cột thật — cột đi và cột đến không được trùng.',
  },

  opportunity_stage_event_clock: {
    kind: 'invalid',
    message: 'Dòng lịch sử có cột đi thì phải có số ngày đứng ở cột đó, và ngược lại.',
  },

  /** A unique index on `platform.approval`, but its meaning is this module's:
   *  two sign presses racing past `OpportunitySign.propose`'s own check. */
  approval_contract_sign_waiting_uq: {
    kind: 'conflict',
    message: 'Cơ hội này đã có một yêu cầu ký đang chờ duyệt.',
  },
}
