import type { ConstraintBook } from '@api/platform/http/db-error'

/** Constraints of `sales.config_entry`, and of the journey frame's two tables
 *  (`step_template`, `state_rule`, ADR 0080) → the sentence a user reads.
 *
 *  Reached only at approval time: the propose door asks the same questions
 *  first (`SalesConfigService` for `config_entry`, `StepFrameService` for the
 *  frame), so these speak to an approver whose request
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

  step_template_name_live: {
    kind: 'conflict',
    fields: ['name'],
    message: 'Trạng thái này đã có mẫu việc tiếp theo cùng tên đang bật — đặt tên khác.',
  },

  /** Unknown id, or a row of another list (`kind_list` folds the list in). */
  step_template_kind_fk: {
    kind: 'invalid',
    fields: ['kindId'],
    message: 'Loại việc không có trong danh mục — chọn lại loại việc.',
  },

  step_template_state_known: {
    kind: 'invalid',
    fields: ['address'],
    message: 'Trạng thái này không nhận mẫu việc tiếp theo — chọn lại trạng thái.',
  },

  step_template_object_kind_known: {
    kind: 'invalid',
    fields: ['address'],
    message: 'Mẫu việc tiếp theo chỉ gắn được vào lead hoặc cơ hội.',
  },

  state_rule_state_known: {
    kind: 'invalid',
    fields: ['address'],
    message: 'Trạng thái này không có thiết lập việc tiếp theo — chọn lại trạng thái.',
  },

  state_rule_object_kind_known: {
    kind: 'invalid',
    fields: ['address'],
    message: 'Thiết lập việc tiếp theo chỉ gắn được vào lead hoặc cơ hội.',
  },

  step_template_name_bounded: {
    kind: 'invalid',
    fields: ['name'],
    message: 'Mẫu việc tiếp theo phải có tên, tối đa 200 ký tự.',
  },

  step_template_due_days_bounded: {
    kind: 'invalid',
    fields: ['dueDays'],
    message: 'Hạn mặc định phải từ 1 đến 365 ngày, hoặc để trống.',
  },
}
