import type { ConstraintBook } from '@api/platform/http/db-error'

/** `comms.identity`'s fences → the sentence a person reads.
 *
 *  The unique one is the reason this book exists at all. `UNIQUE (channel,
 *  address)` fires on the most ordinary thing an operator does — writing down
 *  an address somebody already wrote down — and with no line here that arrives
 *  as the generic server-failure sentence, which is both untrue and the one
 *  that makes people press the button three more times. */
export const IDENTITY_CONSTRAINTS: ConstraintBook = {
  identity_channel_address_unique: {
    kind: 'conflict',
    fields: ['address'],
    message: 'Địa chỉ này đã có trong sổ định danh — một địa chỉ chỉ thuộc về một người.',
  },

  identity_channel_known: {
    kind: 'invalid',
    fields: ['channel'],
    message: 'Kênh không nằm trong danh sách hệ nhận.',
  },

  identity_side_known: {
    kind: 'invalid',
    fields: ['side'],
    message: 'Định danh phải đứng về phía người của ta hoặc phía khách.',
  },

  identity_one_side_only: {
    kind: 'invalid',
    fields: ['actorId', 'objectCode'],
    message:
      'Định danh của người mình phải có mã nhân sự, của khách phải có mã object — đúng một trong hai.',
  },

  identity_no_blank: {
    kind: 'invalid',
    fields: ['address'],
    message: 'Địa chỉ không được để trống.',
  },

  /** Both foreign keys are `invalid`, not the 23503 default of `conflict`: the
   *  caller picked a code that is not in the book, so the fix is in their hand
   *  and belongs on their field — not "somebody else changed the data". */
  identity_actor_id_actor_id_fk: {
    kind: 'invalid',
    fields: ['actorId'],
    message: 'Người này không còn trong sổ nhân sự.',
  },

  identity_object_code_object_code_fk: {
    kind: 'invalid',
    fields: ['objectCode'],
    message: 'Mã object này không có trong sổ.',
  },
}

/** The conversation book's fences → the sentence a person reads.
 *
 *  A separate book from `IDENTITY_CONSTRAINTS` rather than more keys in it:
 *  `registerConstraints` takes several books, and the split keeps the day
 *  `comms.identity` moves or splits from dragging four unrelated sentences
 *  with it.
 *
 *  Only the fences a CALLER can actually hit are listed. `thread_span_forward`
 *  is absent on purpose — `widenSpan` keeps it true, so if it ever fires the
 *  SERVER is wrong and the generic SQLSTATE default is the right answer. */
export const THREAD_CONSTRAINTS: ConstraintBook = {
  link_pk: {
    kind: 'conflict',
    fields: ['objectCode'],
    message: 'Luồng này đã gắn vào hồ sơ đó rồi.',
  },

  link_object_code_object_code_fk: {
    kind: 'invalid',
    fields: ['objectCode'],
    message: 'Mã object này không có trong sổ.',
  },

  /** Two people on one turn in one role, sent twice in one body. The caller
   *  fixes it in their own list, so `invalid` with the field named rather than
   *  the 23505 default of `conflict` — nobody else changed anything. */
  message_party_pk: {
    kind: 'invalid',
    fields: ['parties'],
    message: 'Một người chỉ đứng một lần trong mỗi vai của một lượt.',
  },

  message_party_identity_id_identity_id_fk: {
    kind: 'invalid',
    fields: ['parties'],
    message: 'Có người trong danh sách không còn trong sổ định danh.',
  },

  message_from_identity_id_identity_id_fk: {
    kind: 'invalid',
    fields: ['fromIdentityId'],
    message: 'Người gửi không còn trong sổ định danh.',
  },

  message_direction_known: {
    kind: 'invalid',
    fields: ['direction'],
    message: 'Một lượt chỉ có thể là gửi đi hoặc nhận về.',
  },

  message_body_not_blank: {
    kind: 'invalid',
    fields: ['bodyText'],
    message: 'Thân thư để trống thì bỏ hẳn ô này, đừng gửi một chuỗi rỗng.',
  },

  message_duration_nonneg: {
    kind: 'invalid',
    fields: ['durationSec'],
    message: 'Thời lượng không thể là số âm.',
  },

  thread_channel_known: {
    kind: 'invalid',
    fields: ['channel'],
    message:
      'Kênh không nằm trong danh sách hệ nhận (email, Zalo OA, Telegram, WhatsApp, điện thoại, trong app, họp).',
  },

  /** Reachable since meeting minutes write `external_id` = the meeting id. */
  thread_channel_external_unique: {
    kind: 'conflict',
    fields: ['meetingId'],
    message: 'Cuộc họp này đã có luồng biên bản — ghi tiếp vào luồng đó.',
  },
}

/** `comms.debrief` / `comms.debrief_answer` fences (ADR 0074, 0075) → the sentence a
 *  person reads. Most are kept true by the contract and the service first;
 *  these lines are what a writer that skipped them would be told. */
export const DEBRIEF_CONSTRAINTS: ConstraintBook = {
  debrief_closed_has_summary: {
    kind: 'invalid',
    fields: ['summary'],
    message: 'Xác nhận liên hệ cần một bản tóm tắt, tối đa 2000 ký tự.',
  },

  debrief_title_bounded: {
    kind: 'invalid',
    fields: ['title'],
    message: 'Tiêu đề liên hệ không được để trống, tối đa 120 ký tự.',
  },

  debrief_next_all_or_none: {
    kind: 'invalid',
    fields: ['step'],
    message:
      'Việc tiếp theo phải đủ loại việc, nội dung (tối đa 200 ký tự) và hạn — hoặc bỏ trống cả.',
  },

  debrief_subject_code_object_code_fk: {
    kind: 'invalid',
    fields: ['subjectCode'],
    message: 'Mã object này không có trong sổ.',
  },

  debrief_answer_pk: {
    kind: 'invalid',
    fields: ['answers'],
    message: 'Mỗi câu hỏi chỉ chọn một câu trả lời.',
  },

  debrief_answer_no_blank: {
    kind: 'invalid',
    fields: ['answers'],
    message: 'Câu hỏi và câu trả lời đánh giá không được để trống.',
  },
}

/** A comm file's fences (`platform.attachment`, migration 0075). The contract
 *  refuses both first; these reach a writer that skipped it. A lead's three
 *  types are fenced by its own contract, so the sentence names the comm list. */
export const COMM_ATTACHMENT_CONSTRAINTS: ConstraintBook = {
  attachment_mime_known: {
    kind: 'invalid',
    fields: ['mime'],
    message:
      'Loại tệp không nhận: ghi âm, ảnh (PNG, JPEG, WebP), PDF, Word (.docx) hoặc văn bản thuần.',
  },

  attachment_comm_bytes_capped: {
    kind: 'invalid',
    fields: ['bytes'],
    message: 'Tệp vượt dung lượng cho phép: ghi âm tối đa 50 MB, tệp khác tối đa 15 MB.',
  },
}
