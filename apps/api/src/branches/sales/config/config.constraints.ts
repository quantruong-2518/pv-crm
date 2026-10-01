import type { ConstraintBook } from '@api/platform/http/db-error'

/** Constraints of `sales.config_entry` → the sentence a user reads.
 *
 *  Reached only at approval time: the propose door asks the same questions
 *  first (`SalesConfigService`), so these speak to an approver whose request
 *  collided with a change applied while it waited. */
export const CONFIG_CONSTRAINTS: ConstraintBook = {
  /** Since 0075 unique per question for answers, per list for every other row. */
  config_name_live: {
    kind: 'conflict',
    fields: ['name'],
    message: 'Tên này đã có trong danh mục (với câu trả lời: trong cùng câu hỏi) — đặt tên khác.',
  },

  config_criterion_only_answer: {
    kind: 'invalid',
    fields: ['criterionId'],
    message:
      'Chỉ câu trả lời mới gắn với câu hỏi, và câu trả lời nào cũng phải gắn với một câu hỏi.',
  },

  config_criterion_fk: {
    kind: 'invalid',
    fields: ['criterionId'],
    message: 'Câu hỏi này không có trong danh mục — chọn lại câu hỏi.',
  },
}
