import type { ConstraintBook } from '@api/platform/http/db-error'

/** Constraints of `sales.next_step` → the sentence a user reads.
 *
 *  A label book, not a rule book: the rules live in `next-step.schema.ts`. Only
 *  `text` and `doerId` come from a field on screen, so only those two carry
 *  `fields`; the rest fire when the writer is wrong, and speak to the log. */
export const NEXT_STEP_CONSTRAINTS: ConstraintBook = {
  /** Two first writes on one object in the same instant. A PUT that upserts
   *  never hits this; a writer that inserts blindly does. */
  next_step_pkey: {
    kind: 'conflict',
    message: 'Việc tiếp theo của mục này vừa được người khác đặt — tải lại để xem.',
  },

  next_step_subject_known: {
    kind: 'invalid',
    message: 'Việc tiếp theo chỉ gắn được vào một lead hoặc một cơ hội.',
  },

  /** No mirror row: the lead or deal does not exist (or its write rolled back). */
  next_step_subject_code_object_code_fk: {
    kind: 'invalid',
    message: 'Không tìm thấy lead hoặc cơ hội để gắn việc tiếp theo.',
  },

  next_step_text_bounded: {
    kind: 'invalid',
    fields: ['text'],
    message: 'Việc tiếp theo phải có nội dung, tối đa 200 ký tự.',
  },

  /** `kind: 'invalid'` for `contract_owner_id_actor_id_fk`'s reason: the sender
   *  picked a person who is not in the book, not a clash with another user. */
  next_step_doer_id_actor_id_fk: {
    kind: 'invalid',
    fields: ['doerId'],
    message: 'Người làm không còn trong sổ nhân sự — chọn lại người làm.',
  },

  next_step_created_by_actor_id_fk: {
    kind: 'invalid',
    message: 'Người đặt việc tiếp theo không còn trong sổ nhân sự.',
  },
}
