import type { ConstraintBook } from '@api/platform/http/db-error'

/** Ràng buộc của `sales.touch` → câu nói với người dùng.
 *
 *  Sổ này ngắn nhất nhánh, và ngắn là đúng: người dùng KHÔNG gõ một lần chạm.
 *  Mọi dòng ở đây do máy chủ dựng ngay cạnh lượt ghi sinh ra nó, nên một ràng
 *  buộc gãy ở bảng này không phải dữ liệu người ta nhập sai — nó là code của
 *  chính mình sai, và câu người dùng đọc được không giúp họ sửa gì.
 *
 *  Vẫn khai, vì cái đỡ nằm ở chỗ khác: không có sổ thì bộ dịch lùi về câu chung
 *  theo SQLSTATE và **ghi nguyên chi tiết Postgres vào log ở mức `warn`**, kèm
 *  tên bảng và tên ràng buộc. Mấy dòng dưới đây là chỗ để lại một câu cho người
 *  đọc log lúc 2 giờ sáng, và `fields` cố tình để trống — không ô nào trên màn
 *  tô đỏ được cho một lỗi không đến từ một ô nào. */
export const TOUCH_CONSTRAINTS: ConstraintBook = {
  touch_subject_kind_known: {
    kind: 'invalid',
    message: 'Lần chạm phải gắn vào một lead hoặc một cơ hội.',
  },

  touch_kind_known: {
    kind: 'invalid',
    message: 'Loại lần chạm không nằm trong mười loại đã biết.',
  },

  touch_no_blank: {
    kind: 'invalid',
    message: 'Lần chạm phải có người làm và câu mô tả — một dòng trống không kể được gì.',
  },

  /** Only a `giao` row names the two ends of a hand-over, and it names at least
   *  one of them. Nothing a person typed can break this — the service builds
   *  the pair from the lead's own `owner_id` — so this firing means the writer
   *  is wrong, and the sentence below exists for the log rather than the screen. */
  touch_hand_over_sides: {
    kind: 'invalid',
    message: 'Chỉ lần chạm loại giao mới chở được người giao và người nhận.',
  },

  touch_giao_names_an_end: {
    kind: 'invalid',
    message: 'Một lần giao phải nói ra người giao hoặc người nhận.',
  },

  /** Người ghi không còn trong sổ nhân sự. Chỉ ăn khi một tài khoản bị xoá
   *  đúng giữa lúc đọc phiên và lúc ghi — `actor_id` NULL là hợp lệ (máy ghi),
   *  nên khoá này không bao giờ ăn vì "để trống". */
  touch_actor_id_actor_id_fk: {
    kind: 'invalid',
    message: 'Người ghi lần chạm không còn trong sổ nhân sự.',
  },
}
