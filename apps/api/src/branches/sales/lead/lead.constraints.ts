import type { ConstraintBook } from '@api/platform/http/db-error'

/** Ràng buộc của bảng `lead` → câu nói với người dùng.
 *
 *  ------------------------------------------------------------------
 *  MỘT RÀNG BUỘC KHÔNG CÓ Ở ĐÂY LÀ MỘT CÂU "MÁY CHỦ GẶP SỰ CỐ"
 *  ------------------------------------------------------------------
 *  `lead.schema.ts` dựng năm ràng buộc và ba khoá ngoại. Chúng làm đúng việc
 *  của chúng — chặn dữ liệu sai từ MỌI cửa vào, kể cả cửa mà form quên kiểm —
 *  nhưng thứ Postgres ném lên là một mã năm ký tự cùng một câu tiếng Anh nói
 *  về cột và ràng buộc. Không có bảng dưới đây thì người điền form landing
 *  nhận "máy chủ gặp sự cố" cho một cái email họ gõ trùng.
 *
 *  Đây là bảng NHÃN, không phải bảng luật: luật đã nằm ở `lead.schema.ts` và
 *  chỉ nằm ở đó. Sửa ràng buộc thì sửa bên schema, rồi sang đây sửa câu.
 *
 *  ------------------------------------------------------------------
 *  KHOÁ PHẢI LÀ TÊN POSTGRES BÁO VỀ, KHÔNG PHẢI TÊN BIẾN DRIZZLE
 *  ------------------------------------------------------------------
 *  Tám khoá dưới đây chép từ `apps/api/drizzle/0000_reflective_legion.sql` —
 *  chỗ duy nhất nói chắc chắn tên nào đã thật sự đi vào cơ sở dữ liệu. Ba tên
 *  `*_fk` là tên Drizzle tự sinh; đổi tên cột thì tên khoá ngoại đổi theo, và
 *  bảng này lệch mà không ai báo. Gõ sai một khoá thì không có gì hỏng cả — bộ
 *  dịch lùi về câu chung theo SQLSTATE, vẫn đúng mã HTTP, chỉ mất phần cụ thể.
 *
 *  Tên ô ở `fields` là tên theo HỢP ĐỒNG (`exitReason`), không phải tên cột
 *  (`exit_reason`): màn tô đỏ theo tên nó biết. */
export const LEAD_CONSTRAINTS: ConstraintBook = {
  /** Một email = một lead ĐANG SỐNG. Cửa hay đâm vào nhất, vì nộp lại form là
   *  phản xạ tự nhiên của người không thấy phản hồi ngay. */
  lead_email_live_idx: {
    kind: 'conflict',
    fields: ['email'],
    message: 'Email này đã có trong sổ lead — một email không mở được hai lead cùng lúc.',
  },

  /** Tiền luôn mang đơn vị — nợ số 7 của `docs/ban-giao-backend.md`. */
  lead_money_pair: {
    kind: 'invalid',
    fields: ['budget', 'currency'],
    message: 'Ngân sách phải đi kèm đơn vị tiền: điền cả hai ô, hoặc bỏ trống cả hai.',
  },

  lead_exit_pair: {
    kind: 'invalid',
    fields: ['exitReason', 'exitedAt'],
    message: 'Đánh dấu lead rơi khỏi luồng phải kèm cả lý do lẫn ngày rơi.',
  },

  lead_exit_no_stage: {
    kind: 'invalid',
    fields: ['exitReason', 'stage'],
    message:
      'Lead đã rơi khỏi luồng thì không còn đứng ở cột nào của phễu — bỏ cột, hoặc bỏ đánh dấu rơi.',
  },

  /** CHECK trải trên mười lăm cột, nên không quy được về một ô nào. Câu chung,
   *  về khoá `(gốc)`. Zod ở cổng vào phải đổi `''` → `undefined` trước khi ghi;
   *  đây là lưới thứ hai cho ngày cổng quên. */
  lead_no_blank: {
    kind: 'invalid',
    message: 'Có ô nhập chỉ chứa khoảng trắng. Điền nội dung thật cho ô đó, hoặc để trống hẳn.',
  },

  /** Dòng gương ở `platform.object` phải có TRƯỚC dòng lead.
   *
   *  Đây là ràng buộc dễ đâm vào nhất của mọi cửa GHI, và trước khi có dòng
   *  này nó ra "Máy chủ gặp sự cố" — câu duy nhất không nói được người đọc
   *  phải đi đâu. Không phải lỗi của người gửi: họ không biết `platform.object`
   *  tồn tại và cũng không nên biết. Nên câu dưới đây nói với LẬP TRÌNH VIÊN
   *  đang mở một cửa vào mới, và về khoá `(gốc)` chứ không tô đỏ ô nào — không
   *  có ô nào trên form sai cả.
   *
   *  `invalid` chứ không `conflict`: không ai giẫm chân ai, chỉ là thứ tự ghi
   *  bị làm ngược. Xem `platform/graph/object-mirror.ts` để biết thứ tự đúng. */
  lead_code_object_code_fk: {
    kind: 'invalid',
    message:
      'Lead chưa được đăng ký vào đồ thị object nên không ghi được. Cửa vào nào cũng phải ghi dòng gương ở platform.object trước, trong cùng một transaction.',
  },

  /** Ba khoá ngoại về sổ nhân sự. `invalid` chứ không `conflict` — người gửi
   *  chọn sai một người, đó là lỗi ô nhập, không phải hai người giẫm chân nhau
   *  trên cùng một dòng. */
  lead_owner_id_actor_id_fk: {
    kind: 'invalid',
    fields: ['ownerId'],
    message: 'Người phụ trách không có trong sổ nhân sự.',
  },
  lead_bd_owner_id_actor_id_fk: {
    kind: 'invalid',
    fields: ['bdOwnerId'],
    message: 'Người BD được ghi công không có trong sổ nhân sự.',
  },
  lead_marketing_owner_id_actor_id_fk: {
    kind: 'invalid',
    fields: ['marketingOwnerId'],
    message: 'Người marketing được ghi công không có trong sổ nhân sự.',
  },
}
