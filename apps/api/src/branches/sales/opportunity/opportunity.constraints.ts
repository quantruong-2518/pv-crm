import type { ConstraintBook } from '@api/platform/http/db-error'

/** Ràng buộc của `opportunity` + `opportunity_owner` → câu nói với người dùng.
 *
 *  Cùng luật với `lead.constraints.ts`: đây là bảng NHÃN, không phải bảng luật.
 *  Luật nằm ở `opportunity.schema.ts` và chỉ nằm ở đó; sửa ràng buộc thì sửa
 *  bên schema rồi sang đây sửa câu. Ràng buộc không có mặt ở đây không hỏng gì
 *  — bộ dịch lùi về câu chung theo SQLSTATE — nó chỉ đổi một câu người đọc
 *  được thành "hệ thống gặp sự cố".
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
    message: 'Giá trị đơn cần có đơn vị tiền. Điền cả hai ô hoặc để trống cả hai.',
  },

  /** A stop writes the whole fail log: the column, a reason, the close date.
   *  `POST /:code/stop` writes them in one UPDATE, so this sentence only ever
   *  answers a second write door added later. */
  opportunity_lost_closed: {
    kind: 'invalid',
    fields: ['reasonKey'],
    message: 'Dừng đơn phải ghi cột đang đứng, lý do và ngày đóng.',
  },

  opportunity_lost_off_board: {
    kind: 'invalid',
    message: 'Đơn đã dừng không thuộc cột nào của bảng.',
  },

  opportunity_open_has_no_stop: {
    kind: 'invalid',
    fields: ['reasonKey'],
    message: 'Đơn đang chạy không có lý do dừng.',
  },

  /** Fences 0073 added (ADR 0072): only a writer still on the old five
   *  columns trips them, so the answer says to reload, not to fix a field. */
  opportunity_stage_known: {
    kind: 'conflict',
    message: 'Cột của cơ hội không có trong bảng. Tải lại trang rồi thử lại.',
  },

  opportunity_stage_event_stage_known: {
    kind: 'conflict',
    message: 'Cột đã chọn không còn trên bảng. Tải lại trang rồi thử lại.',
  },

  opportunity_stopped_at_stage_known: {
    kind: 'invalid',
    message: 'Cột đơn dừng lại không có trong bảng.',
  },

  opportunity_state_known: {
    kind: 'invalid',
    message: 'Trạng thái chỉ có "Đang chạy" hoặc "Đã dừng". Ký hợp đồng ở hồ sơ cơ hội.',
  },

  /** A column and its clock travel together or not at all. Only the lifecycle
   *  writer sets the pair, so this is a net under a future write door. */
  opportunity_stage_clock: {
    kind: 'invalid',
    message: 'Cột của đơn và ngày vào cột phải đi cùng nhau.',
  },

  /** Lead không có thật. Service đã trả 404 gọi tên mã trước khi tới đây, nên
   *  khoá này chỉ ăn khi lead bị xoá đúng giữa lúc đọc và lúc ghi. */
  opportunity_lead_code_lead_code_fk: {
    kind: 'invalid',
    fields: ['leadCode'],
    message: 'Không tìm thấy lead mang mã này.',
  },

  /** Id người không có trong sổ nhân sự. Đây là hàng rào THẬT cho hai ô chọn
   *  người: service cố tình không kiểm trước, vì khoá ngoại giữ cho mọi cửa
   *  chứ không riêng cửa nào nhớ kiểm. */
  opportunity_owner_actor_id_actor_id_fk: {
    kind: 'invalid',
    fields: ['saleOwners', 'bdOwners'],
    message: 'Không tìm thấy người đứng đơn. Chọn lại.',
  },

  opportunity_owner_role_known: {
    kind: 'invalid',
    fields: ['saleOwners', 'bdOwners'],
    message: 'Vai trên đơn chỉ có Sale đứng đơn hoặc BD mở cửa.',
  },

  /** The two fences of ADR 0086. `salePrimaryOf` picks one SALE person on
   *  every door, so these only answer two writes racing, or a door added later. */
  opportunity_owner_primary_is_sale: {
    kind: 'invalid',
    fields: ['salePrimary'],
    message: 'Sale chính phải là một người trong danh sách Sale đứng đơn',
  },

  opportunity_owner_one_primary_idx: {
    kind: 'conflict',
    message: 'Cơ hội chỉ có một Sale chính — tải lại trang rồi thử lại.',
  },

  opportunity_probability_range: {
    kind: 'invalid',
    fields: ['probability'],
    message: 'Xác suất thắng phải từ 0 đến 100.',
  },

  /** The COMPOSITE foreign key `(product_id, list)` into `config_id_list`. It
   *  catches both kinds of mistake with one constraint, which is why the key is
   *  composite at all: an id that does not exist, and an id that exists but
   *  belongs to another list ('EX-03' is an exit reason, not a product). */
  opportunity_product_config_fk: {
    kind: 'invalid',
    fields: ['products'],
    message: 'Có mục không nằm trong danh mục Sản phẩm/dịch vụ. Chọn lại từ danh sách.',
  },

  opportunity_product_pk: {
    kind: 'invalid',
    fields: ['products'],
    message: 'Mỗi sản phẩm chỉ chọn một lần trên một đơn.',
  },

  /** A user should never see the two sentences below: every column move goes
   *  through `OpportunityLifecycle`, which writes a history row only when the
   *  column really changed. They exist so that a write door added later can read
   *  what it got wrong, instead of getting a 500 naming a constraint. */
  opportunity_stage_event_moved: {
    kind: 'invalid',
    message: 'Cột đi và cột đến không được trùng nhau.',
  },

  opportunity_stage_event_clock: {
    kind: 'invalid',
    message: 'Cột đi và số ngày ở cột đó phải đi cùng nhau.',
  },

  /** A unique index on `platform.approval`, but its meaning is this module's:
   *  two sign presses racing past `OpportunitySign.propose`'s own check. */
  approval_contract_sign_waiting_uq: {
    kind: 'conflict',
    message: 'Cơ hội này đã có yêu cầu ký đang chờ duyệt.',
  },
}
