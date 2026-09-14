import type { ConstraintBook } from '@api/platform/http/db-error'

/** `platform.approval` constraints → the sentence a person reads.
 *
 *  Short for the reason `TOUCH_CONSTRAINTS` is short: nobody types an approval
 *  row. Every one of these is built by a service beside the write that raised
 *  it, so a constraint firing here means our own code is wrong, not that
 *  somebody filled a box badly. The sentences exist for whoever reads the log
 *  at two in the morning — `fields` stays empty because no box on any screen
 *  can be painted red for a fault that came from no box. */
export const APPROVAL_CONSTRAINTS: ConstraintBook = {
  approval_state_known: {
    kind: 'invalid',
    message: 'Trạng thái duyệt không nằm trong ba trạng thái đã biết.',
  },

  approval_kind_known: {
    kind: 'invalid',
    message: 'Loại yêu cầu duyệt chưa được khai ở tầng nền.',
  },

  /** Rule 9, at the table. An AI proposal reaching here without its grounds
   *  means a door built a request by hand instead of going through the one
   *  entrance AI has. */
  approval_ai_has_basis: {
    kind: 'invalid',
    message: 'Đề xuất của Trợ lý AI phải kèm căn cứ.',
  },

  approval_decided_when_settled: {
    kind: 'invalid',
    message: 'Một yêu cầu đã quyết phải ghi rõ ai quyết và quyết lúc nào.',
  },

  approval_chain_not_empty: {
    kind: 'invalid',
    message: 'Yêu cầu duyệt phải có ít nhất một người trong chuỗi duyệt.',
  },

  approval_reason_only_on_refusal: {
    kind: 'invalid',
    message: 'Từ chối thì phải nói lý do; đồng ý thì không cần.',
  },

  approval_raised_by_id_actor_id_fk: {
    kind: 'invalid',
    message: 'Người mở yêu cầu không còn trong sổ nhân sự.',
  },

  /** The object a request hangs off has to exist in the object graph. Fires
   *  when a branch links a request to a code with no mirror row — the same debt
   *  `ObjectMirror` exists to keep paid. */
  approval_link_object_code_object_code_fk: {
    kind: 'invalid',
    message: 'Yêu cầu duyệt trỏ vào một object không có trong sổ đối tượng.',
  },
}
