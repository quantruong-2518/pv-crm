import type { ConstraintBook } from '@api/platform/http/db-error'

/** Constraints of `sales.quote` and `sales.quote_line` turned into sentences.
 *
 *  A LABEL table, not a rule table, same as the other three: the rules live in
 *  `quote.schema.ts` and are enforced by Postgres. What is here is only what a
 *  person reads when one of them fires.
 *
 *  Worth saying out loud for this table: several of these fire on a path where
 *  the service has ALREADY refused the same thing with a clearer message. That
 *  is not duplication — the service refusal covers the ordinary case, and the
 *  constraint covers two people pressing at the same instant, which is exactly
 *  when the money invariant matters most. */
export const QUOTE_CONSTRAINTS: ConstraintBook = {
  quote_pkey: {
    kind: 'conflict',
    message: 'Mã báo giá này đã tồn tại — thử lại, máy chủ sẽ cấp số kế tiếp.',
  },

  /** Two people drafting a new version of one deal at the same moment. Both read
   *  the same `max(version)`, the second loses here. Retrying gets the next
   *  number, which is why the message says so instead of just naming a clash. */
  quote_opportunity_version_key: {
    kind: 'conflict',
    message: 'Vừa có bản mới hơn cho cơ hội này — tải lại rồi soạn tiếp.',
  },

  /** One deal, at most one accepted version. The decide door refuses this first
   *  with a sentence about the quote; this fires when two people answer for two
   *  different versions at once. */
  quote_one_accepted_idx: {
    kind: 'conflict',
    message: 'Cơ hội này đã có một bản khách chốt — bỏ chốt bản đó trước.',
  },

  quote_opportunity_fk: {
    kind: 'invalid',
    fields: ['opportunityCode'],
    message: 'Không có cơ hội nào khớp — báo giá phải mọc ra từ một đơn có thật.',
  },

  quote_created_by_actor_id_fk: {
    kind: 'invalid',
    message: 'Người soạn không còn trong sổ nhân sự.',
  },

  quote_status_known: {
    kind: 'invalid',
    fields: ['status'],
    message: 'Trạng thái báo giá không hợp lệ.',
  },

  /** Draft and un-sent are one fact in two columns. Only reachable through a
   *  write path that moved one without the other, which is a bug in that path
   *  rather than in the request — so the sentence points at the machine. */
  quote_sent_pair: {
    kind: 'invalid',
    message: 'Trạng thái và mốc gửi của báo giá không khớp nhau.',
  },

  quote_line_pk: {
    kind: 'invalid',
    fields: ['lines'],
    message: 'Hai dòng hàng trùng số thứ tự — mỗi dòng một số.',
  },

  quote_line_qty_positive: {
    kind: 'invalid',
    fields: ['lines'],
    message: 'Số lượng phải lớn hơn 0 — dòng không bán gì thì xoá dòng đó.',
  },

  quote_line_price_nonneg: {
    kind: 'invalid',
    fields: ['lines'],
    message: 'Đơn giá không được âm.',
  },

  quote_line_pct_range: {
    kind: 'invalid',
    fields: ['lines'],
    message: 'Chiết khấu và VAT phải nằm trong khoảng 0…100%.',
  },
}
