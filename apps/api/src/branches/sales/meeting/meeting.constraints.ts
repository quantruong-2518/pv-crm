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

  meeting_link_is_web: {
    kind: 'invalid',
    message: 'Link họp phải bắt đầu bằng http:// hoặc https://.',
  },

  /** The booking drawer's two closed pickers. zod already refuses a stray
   *  value at the HTTP door, so a row breaking these arrived by another road
   *  (a migration, a hand) — still worth a sentence, because a bare 500 names
   *  no field. */
  meeting_mode_known: {
    kind: 'invalid',
    message: 'Hình thức họp không nằm trong danh sách chọn được trên màn đặt lịch.',
  },

  meeting_duration_known: {
    kind: 'invalid',
    message: 'Thời lượng họp phải chọn từ danh sách có sẵn trên màn đặt lịch.',
  },

  /** A code with no `platform.object` row — rare, since leads and deals are
   *  never deleted, but cheaper than a 500 nobody can read. */
  meeting_subject_code_object_code_fk: {
    kind: 'invalid',
    message: 'Lead hoặc cơ hội của buổi họp này không có trong sổ.',
  },

  /** zod gates the code first; a row breaking this came by another road. */
  meeting_subject_known: {
    kind: 'invalid',
    message: 'Buổi họp chỉ gắn được vào một lead hoặc một cơ hội.',
  },

  meeting_attendee_side_known: {
    kind: 'invalid',
    message: 'Người dự phải đứng về phía chủ trì hoặc phía khách.',
  },

  /** Ràng buộc DUY NHẤT ở đây mà người dùng gặp thật, và gặp thường: chọn
   *  người chủ trì bằng cách gõ tên thay vì chọn từ sổ nhân sự. */
  meeting_attendee_host_is_actor: {
    kind: 'invalid',
    message: 'Người chủ trì phải chọn từ sổ nhân sự, không gõ tay — khách thì gõ tay.',
  },

  /** Somebody picked from the contact book, deleted between opening the form
   *  and pressing save. As rare as `meeting_subject_code_object_code_fk`, and worth
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
