import type { ConstraintBook } from '@api/platform/http/db-error'

/** `sales.hold` and `sales.lead_label` constraints → the sentence a person
 *  reads. Keys are the names migration 0111 gave them. The doors refuse these
 *  cases first under a row lock; this book is the fence for a race past them. */
export const HOLD_CONSTRAINTS: ConstraintBook = {
  hold_open_subject_uq: {
    kind: 'conflict',
    message: 'Đang có một lần tạm hoãn chưa kết thúc. Tải lại rồi thử lại.',
  },
  lead_label_config_fk: {
    kind: 'conflict',
    message: 'Có nhãn không còn dùng được. Tải lại rồi chọn lại.',
  },
}
