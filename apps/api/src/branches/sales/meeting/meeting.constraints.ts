import type { ConstraintBook } from '@api/platform/http/db-error'

/** Ràng buộc của `sales.meeting` và `sales.meeting_attendee` → câu nói với
 *  người dùng.
 *
 *  Khác `TOUCH_CONSTRAINTS` ở một điểm quyết định độ dài của sổ này: buổi họp
 *  do NGƯỜI gõ. Một ràng buộc gãy ở đây thường là ô nhập sai chứ không phải
 *  code sai, nên câu trả về phải nói được người ta phải sửa gì — và `kind:
 *  'invalid'` để màn tô đỏ đúng ô thay vì đổ một thông báo chung lên đầu
 *  biểu mẫu. */
export const MEETING_CONSTRAINTS: ConstraintBook = {
  meeting_no_blank: {
    kind: 'invalid',
    message: 'Buổi họp phải có tiêu đề — một dòng trống không kể lại được gì.',
  },

  meeting_link_la_web: {
    kind: 'invalid',
    message: 'Link họp phải bắt đầu bằng http:// hoặc https://.',
  },

  /** Lead bị xoá đúng giữa lúc mở biểu mẫu và lúc bấm lưu. Hiếm, nhưng câu này
   *  rẻ hơn một 500 không ai đọc được. */
  meeting_lead_code_lead_code_fk: {
    kind: 'invalid',
    message: 'Lead của buổi họp này không còn trong sổ.',
  },

  meeting_attendee_side_known: {
    kind: 'invalid',
    message: 'Người dự phải đứng về phía chủ trì hoặc phía khách.',
  },

  /** Ràng buộc DUY NHẤT ở đây mà người dùng gặp thật, và gặp thường: chọn
   *  người chủ trì bằng cách gõ tên thay vì chọn từ sổ nhân sự. */
  meeting_attendee_host_co_actor: {
    kind: 'invalid',
    message: 'Người chủ trì phải chọn từ sổ nhân sự, không gõ tay — khách thì gõ tay.',
  },

  /** Somebody picked from the contact book, deleted between opening the form
   *  and pressing save. As rare as `meeting_lead_code_lead_code_fk`, and worth
   *  its own sentence for the same reason. */
  meeting_attendee_contact_code_contact_code_fk: {
    kind: 'invalid',
    message: 'Người liên hệ được chọn không còn trong sổ.',
  },

  meeting_attendee_contact_only_guest: {
    kind: 'invalid',
    message: 'Chỉ khách mới gắn được người liên hệ — người chủ trì lấy từ sổ nhân sự.',
  },

  meeting_attendee_no_blank: {
    kind: 'invalid',
    message: 'Người dự phải có tên.',
  },

  meeting_attendee_actor_id_actor_id_fk: {
    kind: 'invalid',
    message: 'Người chủ trì không còn trong sổ nhân sự.',
  },
}
