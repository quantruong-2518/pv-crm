import type { ConstraintBook } from '@api/platform/http/db-error'

/** Postgres constraint names -> the sentence a person reads.
 *
 *  `account_identity_uniq` is the one that earns this file. Without an entry it
 *  surfaces as a generic 409 naming an index, on the single most common thing a
 *  user will do wrong here: opening a company that is already in the book under
 *  a slightly different name. The message has to say which of the two halves of
 *  the identity rule refused, because the fix differs — a duplicate tax code
 *  means "open the existing company", a duplicate name might mean "add the tax
 *  code to tell them apart". */
export const ACCOUNT_CONSTRAINTS: ConstraintBook = {
  account_identity_uniq: {
    kind: 'invalid',
    fields: ['taxCode', 'name'],
    message:
      'Công ty này đã có trong sổ — trùng mã số thuế, hoặc trùng tên khi cả hai đều chưa có mã số thuế. Mở dòng đang có thay vì tạo dòng thứ hai.',
  },
  account_name_not_blank: {
    kind: 'invalid',
    fields: ['name'],
    message: 'Công ty phải có tên.',
  },
  account_code_code_fk: {
    kind: 'invalid',
    message:
      'Mã công ty chưa có dòng gương trong đồ thị object — đây là lỗi máy chủ, không phải lỗi phiếu.',
  },
  /** Fired from the LEAD side, not from this book: attaching an enquiry to a
   *  company that has since gone. Lives here because the constraint belongs to
   *  the account relation, and `registerConstraints` is keyed by constraint
   *  name rather than by which screen tripped it. */
  lead_account_code_account_code_fk: {
    kind: 'invalid',
    fields: ['accountCode'],
    message: 'Công ty được gắn vào lead này không còn trong sổ khách.',
  },
  opportunity_account_code_account_code_fk: {
    kind: 'invalid',
    fields: ['accountCode'],
    message: 'Công ty của đơn này không còn trong sổ khách.',
  },
}
