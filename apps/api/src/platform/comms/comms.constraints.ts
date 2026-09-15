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
