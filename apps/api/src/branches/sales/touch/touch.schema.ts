import { check, index, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { LeadTier, RoleId, TouchKind, TouchSubject } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { stepTemplate } from '../config/step-frame.schema'
import { sales } from '../sales.schema'

/** Lần chạm — chuyện gì đã xảy ra với một lead hoặc một cơ hội.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO LÀ BẢNG THỨ BA, KHI ĐÃ CÓ `audit` VÀ `email_delivery`
 *  ------------------------------------------------------------------
 *  `platform.audit` ghi AI GỌI ĐƯỜNG NÀO — nó là vết bảo mật, khoá theo một
 *  `action` của HTTP, và tới lúc nó được ghi thì thứ duy nhất còn lại là
 *  `action: 'edit'`. Nó không nói được "đơn này vừa từ Đã demo sang Chờ ký".
 *  `platform.email_delivery` biết mọi lá thư đã gửi, tức đúng một loại tiếp xúc
 *  và là loại duy nhất hai bảng kia nhìn thấy.
 *
 *  Thứ dòng thời gian cần là SỰ KIỆN NGHIỆP VỤ, nói ra một lần, ngay lúc code
 *  còn cầm cả bản trước lẫn bản sau. `fromUpdate` biết đơn vừa đổi cột — nó
 *  tính `moved` để quyết định đồng hồ cột — và một dòng sau thì kiến thức đó
 *  biến mất. Nên dòng được ghi ở chỗ sự thật còn được biết, không phải dựng lại
 *  ở hạ nguồn từ thứ sống sót.
 *
 *  ------------------------------------------------------------------
 *  `subject_code` KHÔNG CÓ KHOÁ NGOẠI, VÀ ĐÓ LÀ QUYẾT ĐỊNH
 *  ------------------------------------------------------------------
 *  Một cột trỏ được vào HAI bảng thì không khoá ngoại được vào bảng nào —
 *  Postgres không có khoá ngoại đa hình. Ba đường đi qua chuyện đó, và đường
 *  này là đường rẻ nhất mà vẫn thành thật:
 *
 *   · hai cột `lead_code`/`opportunity_code`, mỗi cột một khoá ngoại, cộng một
 *     CHECK ép đúng một cột có giá trị — đúng nhất, và biến mọi câu đọc thành
 *     `WHERE lead_code = $1 OR opportunity_code = $1`, tức hai chỉ mục cho một
 *     câu hỏi;
 *   · khoá ngoại về `platform.object`, nơi CẢ HAI đều có dòng gương — hấp dẫn,
 *     nhưng dòng gương của cơ hội là KỶ LUẬT chứ chưa phải hàng rào
 *     (`opportunity.code` chưa trỏ về `platform.object`), nên khoá ngoại ở đây
 *     sẽ đổ một lượt ghi lần chạm vì một dòng gương thiếu — tức làm hỏng cửa
 *     ghi vì một khoản nợ ở chỗ khác;
 *   · một cột mã cộng một cột loại, có CHECK trên loại. Chọn đường này.
 *
 *  Cái mất là có thật và ghi ra ở đây: một lần chạm trỏ vào mã không tồn tại
 *  thì bảng nhận. Cái đỡ nó không phải hy vọng — cả ba chỗ ghi đều nằm TRONG
 *  transaction đã ghi chính dòng đó, nên mã không tồn tại nghĩa là dòng kia
 *  cũng đã rollback.
 *
 *  ------------------------------------------------------------------
 *  `by` LÀ TÊN, CHÉP LÚC GHI
 *  ------------------------------------------------------------------
 *  Không join `actor` lúc đọc, và đây là chỗ khác hẳn `opportunity_owner` —
 *  bảng nối kia chở id vì nó trả lời "đơn này của ai HÔM NAY", còn bảng này
 *  trả lời "hôm đó ai làm". Join sẽ làm mọi dòng lịch sử lặng lẽ đổi theo tên
 *  hiện tại của người ta, và làm dòng do máy ghi thành không vẽ được.
 *
 *  `actor_id` vẫn có, vẫn khoá ngoại, và vẫn NULL được: nó để lọc "việc tôi đã
 *  làm" ngày có màn hỏi câu đó. NULL = máy ghi, và `by` lúc đó là 'Hệ thống'. */
export const touch = sales.table(
  'touch',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),

    /** Mã lead hoặc mã cơ hội. Không khoá ngoại — xem docblock trên. */
    subjectCode: text('subject_code').notNull(),
    subjectKind: text('subject_kind').$type<TouchSubject>().notNull(),

    kind: text('kind').$type<TouchKind>().notNull(),

    /** Bậc lead SAU bước này. NULL ở mọi loại trừ hai loại chở bậc.
     *
     *  `kind` một mình không trả lời được câu hỏi của màn Hiệu suất: `tier-raised`
     *  nói "lên một bậc", không nói lên `mql` hay lên `sql`. Đường rẻ hơn là
     *  đếm theo THỨ TỰ — dòng `tier-raised` đầu tiên của một lead là `mql`, dòng
     *  thứ hai là `sql` — và nó chỉ đúng khi ba điều cùng đúng: dòng thời gian
     *  không thủng, không lượt ghi nào nhảy cách bậc, và mọi lead đều xuất phát
     *  từ cùng một bậc. Không điều nào trong ba là hàng rào; cả ba là thói quen
     *  hiện thời của code, và một phép đếm dựa vào thói quen sẽ hỏng lặng lẽ
     *  vào ngày thói quen đổi, ở một màn không ai soi lại.
     *
     *  Một dòng TỰ NÓI ĐƯỢC bậc của nó thì không cần điều kiện nào cả: một
     *  trường, không window function, không giả định về phần còn lại của dòng
     *  thời gian. `created` cũng chở được nó, để dòng thời gian bắt đầu từ một
     *  điểm được ghi ra chứ không phải một điểm được đoán. */
    toTier: text('to_tier').$type<LeadTier>(),

    actorId: text('actor_id').references(() => actor.id),
    by: text('by').notNull(),

    /** Both ends of one hand-over. NULL in all four on every other kind.
     *
     *  ONE ROW, NOT TWO — the open question settled by
     *  `docs/decisions/0017-record-a-handoff-as-one-touch-row.md`,
     *  answered in columns here because here is where
     *  it becomes columns. Two rows (one for the loser, one for the taker)
     *  count a single event twice: the activity card already treats `handed-over` as a
     *  conversation turn, so every "how many touches" count doubles on each
     *  hand-over. They would also share one `at` — Postgres freezes `now()` per
     *  transaction — leaving no readable order between them. And the "always
     *  two" rule breaks on the two commonest moves anyway: claiming out of the
     *  common pool has no loser, releasing back into it has no taker.
     *
     *  `by` is NEITHER end. It is whoever pressed the button, and a head of
     *  sales moving a lead between two Sales is a third person who lost
     *  nothing and gained nothing.
     *
     *  The names are COPIES taken at write time, for the same reason `by` is:
     *  joining `actor` on read makes every past step silently adopt the
     *  person's current name. The ids travel beside them so the flow vector can
     *  mark "this step is you" without comparing strings. */
    fromActorId: text('from_actor_id').references(() => actor.id),
    fromName: text('from_name'),
    toActorId: text('to_actor_id').references(() => actor.id),
    toName: text('to_name'),

    /** The role the RECEIVER held on the day — a copy, like the names beside it.
     *
     *  The flow vector prints a role under each name, and joining `actor` at
     *  read time would print the role that person holds TODAY. A step from
     *  March has to keep saying "BD" after the person moved to Sale in July;
     *  that is the whole reason `by`, `from_name` and `to_name` are copies, and
     *  a role read live beside three frozen names would be the one field that
     *  rewrites history.
     *
     *  Only the RECEIVING end has one, and one column is enough: the vector
     *  draws who holds it NEXT, and the giver is already on the chain as the
     *  previous step, wearing the role it was handed to them under.
     *
     *  Nullable for ever. Every row written before `0039` has no answer, and
     *  `stepsOf` prints nothing rather than borrowing one — an absent role is
     *  a row that predates the column, not a person with no job. */
    toRole: text('to_role').$type<RoleId>(),

    /** Config id of the stop reason (`EXIT_REASON` list) — the SAME catalogue
     *  `exited` and `nurtured` both write to, ADR 0070's point: a lead paused
     *  and a lead dropped share one list of reasons. May also carry the
     *  virtual key `'other'`, which is never a config row — an FK to
     *  `config_entry.id` could not accept it, so this stays a bare `text`,
     *  the same call `opportunity.stop_reason` already made.
     *
     *  NULL on every row written before this column existed and on every
     *  `kind` but the two above — `touch_reason_only_stop` below is
     *  one-way, like `touch_hand_over_sides`' sibling constraint, for the
     *  same reason: old code keeps writing reason-less rows between migrate
     *  and deploy. */
    reasonId: text('reason_id'),

    /** The template a finished step came from (ADR 0080 §5) — the step row is
     *  deleted on "done", so this row is the only place left to say it. A real
     *  FK, unlike `reason_id`: no virtual key, and templates are never deleted.
     *  No index: no screen asks "touches of template X" yet. */
    templateId: uuid('template_id').references(() => stepTemplate.id),

    note: text('note').notNull(),
  },
  (t) => [
    /** Câu hỏi DUY NHẤT bảng này trả lời: "dòng thời gian của mã X". Hai cột
     *  theo đúng thứ tự đó, `at` giảm dần — chỉ mục phục vụ cả lọc lẫn sắp xếp
     *  nên câu đọc không cần một lượt sort nào. */
    index('touch_subject_idx').on(t.subjectCode, t.at.desc()),
    /** "Việc tôi đã làm", chưa có màn nào hỏi. Rẻ, và cột đã có sẵn. */
    index('touch_actor_idx').on(t.actorId),
    check('touch_subject_kind_known', sql`"subject_kind" IN ('lead', 'opportunity')`),
    /** The twenty-seven `TouchKind` values, copied out: the enum changing must be a
     *  migration somebody reads (0073 added `demo-held`/`site-visited`). Legacy
     *  kinds (`first-action`, `verified`, `care-left`) stay — their rows are on disk. */
    check(
      'touch_kind_known',
      sql`"kind" IN ('created', 'contacted', 'field-filled', 'handed-over', 'tier-raised',
                     'care-planned', 'exchange-logged', 'first-action', 'verified',
                     'nurtured', 'resumed', 'archived', 'first-meeting',
                     'entered-pipeline', 'stage-changed', 'signed', 'exited',
                     'reopened', 'sample-sent', 'poc-run', 'demo-held', 'site-visited',
                     'quotation-sent', 'care-left', 'next-step-done',
                     'mail-failed', 'mail-sync-failed')`,
    ),
    /** Ba giá trị của `LeadTier`. Chép ra đây cùng lý do với `touch_kind_known`
     *  ở trên: enum dài thêm thì phải là một migration có người đọc. */
    check('touch_to_tier_known', sql`"to_tier" IS NULL OR "to_tier" IN ('prospect', 'mql', 'sql')`),
    /** `to_tier` exists so a rung-moving row can say WHICH rung. `verified` sets
     *  the first tier (ADR 0058), so it is fenced like `tier-raised`; the name
     *  predates it and stays, since renaming a constraint buys nothing. */
    check(
      'touch_tier_raised_has_tier',
      sql`"kind" NOT IN ('tier-raised', 'verified') OR "to_tier" IS NOT NULL`,
    ),
    /** The SHAPE of the four columns above, true of every row ever written:
     *
     *   · an end has a name and an id or neither — half an end cannot be drawn;
     *   · only `handed-over` names the person who LOST the lead;
     *   · only `handed-over` and `created` name the person who GOT it — `created` carries
     *     it for a lead that entered the book already assigned, exactly where
     *     `to_tier` carries the rung for a lead that entered already graded, so
     *     the vector's left half starts at a step that was WRITTEN DOWN. */
    check(
      'touch_hand_over_sides',
      sql`("from_actor_id" IS NULL) = ("from_name" IS NULL)
          AND ("to_actor_id" IS NULL) = ("to_name" IS NULL)
          AND ("from_actor_id" IS NULL OR "kind" = 'handed-over')
          AND ("to_actor_id" IS NULL OR "kind" IN ('handed-over', 'created'))`,
    ),
    /** A `handed-over` row naming neither end is a row nobody can read — but only from
     *  migration `0033` onward, and that is why this is a SECOND constraint
     *  rather than a fifth clause of the one above.
     *
     *  `setOwner` has been writing end-less `handed-over` rows since 29/08. Validating
     *  this against the table would abort `0033` on any database where somebody
     *  has pressed "Giao", so the migration adds it `NOT VALID`: enforced on
     *  every write from now on, silent about rows that predate the columns.
     *  Drizzle has no way to spell `NOT VALID`, so a schema diff generated from
     *  this file would ask to re-add it validated — read the migration, not the
     *  generator, before touching this one. */
    check(
      'touch_handed_over_names_an_end',
      sql`"kind" <> 'handed-over' OR "from_actor_id" IS NOT NULL OR "to_actor_id" IS NOT NULL`,
    ),
    /** A role with nobody wearing it is unreadable — the vector prints it UNDER
     *  a name, so a row with `to_role` and no `to_actor_id` would draw a job
     *  title floating free. */
    check('touch_to_role_needs_an_end', sql`"to_role" IS NULL OR "to_actor_id" IS NOT NULL`),
    /** The seven `RoleId` values, copied out for `touch_kind_known`'s reason:
     *  a role added to the contract must be a migration somebody reads, not a
     *  line that changes underneath the rows already written. */
    check(
      'touch_to_role_known',
      sql`"to_role" IS NULL OR "to_role" IN ('director', 'head-of-sales', 'marketing',
                                             'bd', 'presales', 'sale', 'account-executive')`,
    ),
    /** Một dòng thời gian không có câu nào để đọc là một dòng trống chiếm chỗ. */
    check('touch_no_blank', sql`"by" <> '' AND "note" <> '' AND "subject_code" <> ''`),
    /** Only `exited`/`nurtured` carry a reason. One-way, like
     *  `touch_hand_over_sides`: a pre-column or pre-deploy row stays NULL
     *  rather than fail. */
    check('touch_reason_only_stop', sql`"reason_id" IS NULL OR "kind" IN ('nurtured', 'exited')`),
    /** One-way for `touch_reason_only_stop`'s reason: a typed step, and every
     *  `next-step-done` row older than 0091, has no template. */
    check('touch_template_only_step_done', sql`"template_id" IS NULL OR "kind" = 'next-step-done'`),
  ],
)

export type TouchRowDb = typeof touch.$inferSelect
export type TouchValues = typeof touch.$inferInsert
