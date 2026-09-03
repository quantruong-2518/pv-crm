import type { ConstraintBook } from '@api/platform/http/db-error'

/** Postgres constraint names -> the sentence a person reads.
 *
 *  Every key here is copied from what production actually reports, not from the
 *  Drizzle variable names: the table was created by migration 0018 and this
 *  book was written afterwards against the live schema. `contact_primary_idx`
 *  and `contact_no_blank` in particular are NOT the names a fresh generate
 *  would have chosen. */
export const CONTACT_CONSTRAINTS: ConstraintBook = {
  /** ONE check across eight columns, so it cannot name a single field.
   *
   *  `fields` is deliberately absent: the constraint fires for a blank name, a
   *  blank title or a blank note, and reddening whichever box we guessed would
   *  point the user at the wrong one. The sentence carries the rule instead. */
  contact_no_blank: {
    kind: 'invalid',
    message:
      'Ô nào không điền thì để trống hẳn — một ô chỉ có dấu cách không phải một câu trả lời.',
  },

  contact_channel_known: {
    kind: 'invalid',
    fields: ['channel'],
    message: 'Kênh liên lạc phải chọn từ danh sách — không gõ tay một kênh mới.',
  },

  /** The partial unique index behind `POST …/primary`.
   *
   *  A user should never see this one: the promote endpoint demotes the
   *  incumbent and promotes the new row inside a single transaction, in that
   *  order, precisely so the index is never violated. It is written down anyway
   *  because the day a second writer appears, this sentence is what tells
   *  whoever reads the log that they wrote in the wrong order — rather than a
   *  generic 409 naming an index nobody recognises. */
  contact_primary_idx: {
    kind: 'conflict',
    fields: ['isPrimary'],
    message:
      'Lead này đã có một người liên hệ chính. Đổi người chính bằng nút "Đặt làm chính", đừng gắn cờ trực tiếp.',
  },

  contact_lead_code_lead_code_fk: {
    kind: 'invalid',
    message: 'Lead của người liên hệ này không còn trong sổ.',
  },

  contact_created_by_actor_id_fk: {
    kind: 'invalid',
    message: 'Người ghi dòng này không còn trong sổ nhân sự.',
  },

  contact_code_object_code_fk: {
    kind: 'invalid',
    message:
      'Mã người liên hệ chưa có dòng gương trong đồ thị object — đây là lỗi máy chủ, không phải lỗi phiếu.',
  },
}
