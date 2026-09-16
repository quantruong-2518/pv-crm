import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { SettingKey } from '@pv/contracts'
import type { Action, Branch, EdgeKind, ObjectKind, RoleId } from '@pv/engines'

/** Union của E2 cộng 'ai-read' — trợ lý AI đọc gì cũng để lại vết. */
type AuditAction = Action | 'ai-read'

/** Schema `platform` — thứ KHÔNG thuộc nhánh nào.
 *
 *  Người, phiên, nhật ký, đồ thị object. Mọi nhánh đều đọc; không nhánh nào sở
 *  hữu. Đây là lý do luật "một nhánh một schema, không JOIN chéo schema" có
 *  ngoại lệ đúng ở đây: `platform` không phải một nhánh, nó là nền. */
export const platform = pgSchema('platform')

export const actor = platform.table('actor', {
  id: text('id').primaryKey(),

  /** NHÃN hiển thị. Trục phạm vi của E2 hiện đang so bằng trường này
   *  (`ref.owner !== actor.name`) — một khoản nợ chưa trả. Lọc ở SQL thì đã so
   *  bằng `id`; ngày trả nợ
   *  xong, engine cũng so bằng `id` và trường này thôi làm khoá. */
  name: text('name').notNull(),

  email: text('email').notNull().unique(),

  /** Nhãn vai, có mang tên ngành ("Sale · chip"). Không bám quyền vào đây. */
  role: text('role').notNull(),

  /** Khoá của ma trận quyền E2. Đây mới là thứ quyền bám vào. */
  roleId: text('role_id').$type<RoleId>().notNull(),

  /** Trục 1 · LICENSE — nhánh công ty đã mua. Rỗng = chỉ One Core. */
  branches: text('branches').array().$type<Branch[]>().notNull().default([]),

  /** Trục 3 · PHẠM VI — chỉ thấy object mình đứng tên. */
  ownOnly: boolean('own_only').notNull().default(false),

  // ── xác thực ───────────────────────────────────────────────────────────
  // Ba cột dưới đây KHÔNG thuộc ba trục quyền ở trên, và đó là lý do chúng
  // đứng thành cụm riêng: ba trục kia trả lời "người này được làm gì", ba cột
  // này trả lời "người này có vào được không". Một người có đủ quyền nhưng
  // đang bị khoá thì không vào; một người vào được nhưng sai vai thì vào rồi
  // không thấy gì. Hai câu hỏi, hai cụm.

  /** Mật khẩu đã băm, dạng `scrypt$N,r,p$salt$hash` — xem `password.ts`.
   *
   *  `null` KHÔNG phải lỗi dữ liệu: đó là tài khoản quản lý vừa mở mà chủ nó
   *  chưa đặt mật khẩu. Trạng thái đó có thật, kéo dài từ lúc mở tài khoản tới
   *  lúc người ta bấm link trong thư, và nó phải phân biệt được với "có mật
   *  khẩu nhưng gõ sai". Một cột `NOT NULL DEFAULT ''` gộp hai thứ đó lại và
   *  biến chuỗi rỗng thành một mật khẩu hợp lệ với đúng một người: người quên
   *  kiểm nó. */
  passwordHash: text('password_hash'),

  /** Owes a password change SINCE WHEN. `null` = owes nothing.
   *
   *  Set while the account holds a password somebody else chose:
   *  `reset-staff.ts` planting the whole book with `DEFAULT_PASSWORD`, or an
   *  administrator pressing reset. Cleared when the owner picks their own.
   *
   *  While it is set, `PasswordChangeGuard` shuts every door but the four that
   *  survive. That is what turns a password living in git into a one-time
   *  ticket, and it is the condition on which `DEFAULT_PASSWORD` may exist at
   *  all without breaking the rule stated on `UserCreate` — that a manager must
   *  never know a password an account then acts under.
   *
   *  A mark rather than a `boolean`, same convention as `disabled_at` just
   *  below: the question asked about a blocked account is "since when". */
  mustChangePasswordAt: timestamp('must_change_password_at', { withTimezone: true }),

  /** Bị khoá từ LÚC NÀO. `null` = đang hoạt động.
   *
   *  Mốc thời gian chứ không phải `boolean`, vì câu người ta thật sự hỏi về
   *  một tài khoản bị khoá là "khoá từ bao giờ" — và `disabled = true` trả lời
   *  câu đó bằng một cái nhún vai. Cùng quy ước với `closed_at`, `exited_at`,
   *  `revoked_at` ở khắp repo này. */
  disabledAt: timestamp('disabled_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// E1 · đồ thị object — dữ liệu, KHÔNG phải logic
// ---------------------------------------------------------------------------

/** Một object bất kỳ của hệ: account, contact, lead, cơ hội, báo giá, hợp
 *  đồng, sales order, work order… Mọi nhánh đổ vào cùng một bảng, vì đồ thị
 *  chỉ có nghĩa khi nó XUYÊN nhánh — `story()` đi từ lead sang hợp đồng sang
 *  lệnh sản xuất, và đó là toàn bộ lý do E1 tồn tại. */
export const objectRef = platform.table(
  'object',
  {
    code: text('code').primaryKey(),
    kind: text('kind').$type<ObjectKind>().notNull(),
    /** Nhánh SỞ HỮU object. Nhánh khác đọc qua đồ thị, không sửa. */
    branch: text('branch').$type<Branch>().notNull(),
    label: text('label').notNull(),
    owner: text('owner'),
    state: text('state'),
    /** Tiền, đơn vị ĐỒNG. `bigint` vì một hợp đồng vài tỷ đã vượt `int4`, và
     *  `mode: 'number'` an toàn tới 2^53 — hơn 9 triệu tỷ đồng. */
    amount: bigint('amount', { mode: 'number' }),
  },
  (t) => [index('object_kind_idx').on(t.kind), index('object_branch_idx').on(t.branch)],
)

/** Cạnh có hướng giữa hai object.
 *
 *  `kind` is part of the primary key and mirrors the engine's `EdgeKind`, so a
 *  renamed value ships with a data migration (`0046`), never on its own. */
export const edge = platform.table(
  'edge',
  {
    fromCode: text('from_code')
      .notNull()
      .references(() => objectRef.code),
    toCode: text('to_code')
      .notNull()
      .references(() => objectRef.code),
    kind: text('kind').$type<EdgeKind>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.fromCode, t.toCode, t.kind] }),
    /* Hai chỉ mục vì đồ thị được đi theo CẢ HAI chiều: `children` đi xuôi,
       `parents` đi ngược, và `story()` dùng cả hai. */
    index('edge_from_idx').on(t.fromCode),
    index('edge_to_idx').on(t.toCode),
  ],
)

// ---------------------------------------------------------------------------
// E2 · ghi vết
// ---------------------------------------------------------------------------

/** Nhật ký — bảng CHỈ THÊM.
 *
 *  Không `UPDATE`, không `DELETE`; quyền của ứng dụng trên bảng này chỉ nên có
 *  `INSERT` và `SELECT`. Một nhật ký sửa được là một nhật ký không trả lời
 *  được câu nó sinh ra để trả lời.
 *
 *  E2 có `log()`/`trail()` in-memory dùng cho phía trình duyệt. Ở máy chủ, bản
 *  BỀN là bảng này — guard ghi thẳng vào đây, không đi qua mảng trong RAM của
 *  engine (mảng đó chết theo tiến trình, và có hai bản thì không bản nào là sự
 *  thật). */
export const audit = platform.table(
  'audit',
  {
    /** `uuid` chứ không `text`: Postgres lưu 16 byte thay vì 36, so sánh và
     *  đánh chỉ mục nhanh hơn, và `defaultRandom()` bỏ được một lời gọi
     *  `randomUUID()` ở tầng ứng dụng. */
    id: uuid('id').primaryKey().defaultRandom(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorId: text('actor_id').notNull(),
    action: text('action').$type<AuditAction>().notNull(),
    code: text('code'),
    note: text('note'),
  },
  (t) => [index('audit_code_idx').on(t.code), index('audit_actor_idx').on(t.actorId)],
)

// ---------------------------------------------------------------------------
// System constants an operator tunes
// ---------------------------------------------------------------------------

/** One OVERRIDE of a system constant. Not a definition of one.
 *
 *  ------------------------------------------------------------------
 *  A ROW IS AN OVERRIDE, SO THE TABLE IS FOUR COLUMNS AND NO MORE
 *  ------------------------------------------------------------------
 *  Default value, unit, bounds and the sentence an operator reads all live in
 *  `SETTING_REGISTRY` (`@pv/contracts`, `setting.ts`), in code. A key with no
 *  row here is not missing data — it is the ordinary state of a system nobody
 *  has tuned, and the read serves the default straight from the registry.
 *
 *  The first sketch of this table was
 *  `key · value · unit · updated_by · updated_at`. `unit` is dropped, and so is
 *  every other descriptive column that sketch implies: the registry already
 *  states that `sequence.max-steps` counts steps and the rest count days. A
 *  column repeating it would be a second source for one fact, and the copy down
 *  here drifts from the copy up there the first time a key changes — silently,
 *  because nothing can compare them. The same argument retires min/max and the
 *  operator-facing description.
 *
 *  ------------------------------------------------------------------
 *  WHICH FENCE IS THE TABLE'S AND WHICH IS THE CONTRACT'S
 *  ------------------------------------------------------------------
 *  The table guards what is true of ALL SIX keys and will stay true however the
 *  registry is retuned: the key is one of six known names, and the number is
 *  positive. Zero days of retention, zero steps in a sequence, a link expiring
 *  in zero days — each is a value the reading code cannot act on, so it belongs
 *  to the table and not to a validator somebody can route around.
 *
 *  The PER-KEY bound (`sequence.max-steps` tops out at 50,
 *  `comms.blob.retention-days` at 730) is `SettingPatch`'s, enforced by zod at
 *  the door. It stays out of here for the reason above — it is registry data,
 *  it is expected to be retuned, and a CHECK carrying a copy of it would turn
 *  every retune into a migration AND leave the two disagreeing until then.
 *
 *  `setting_key_known` is the opposite case and deliberately so: the day a
 *  seventh key exists, that has to be a migration a person reads, same as
 *  `identity_channel_known` and `touch_kind_known`. The key list is not a
 *  number to tune, it is the shape of the table. */
export const setting = platform.table(
  'setting',
  {
    /** The key IS the identity of the row — one override per key, no surrogate
     *  id and no `UNIQUE` beside it. */
    key: text('key').$type<SettingKey>().primaryKey(),

    /** Days for five of the six keys, a count of steps for the sixth. Which one
     *  applies is the registry's `unit`, not a column here. `integer` is ample:
     *  the widest bound any key holds today is 730. */
    value: integer('value').notNull(),

    /** Who turned the dial. A real foreign key, unlike `touch.subject_code` and
     *  the trap its docblock describes: an override is only ever written by a
     *  signed-in operator holding `setting.manage`, so the `actor` row exists by
     *  the time the write runs. There is no machine writer to leave NULL for —
     *  a value nobody chose is the registry default, which is the absence of a
     *  row rather than a row without an author. */
    updatedBy: text('updated_by')
      .notNull()
      .references(() => actor.id),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  /* No parameter: nothing below names a column through the table object,
     because both CHECKs quote their columns the way the migration does. */
  () => [
    /* No index beyond the primary key. The only two reads are "this key's
       override" — the primary key answers it — and "every override", which is
       at most six rows and so a scan whatever an index says. An index on
       `updated_by` would answer a question nobody asks and cost every write. */

    /** The six members of `SettingKey`, copied out by hand rather than
     *  generated, character for character from the contract's enum. */
    check(
      'setting_key_known',
      sql`"key" IN ('comms.reply.silence-days', 'comms.unmatched.retention-days', 'comms.blob.retention-days', 'sequence.step.default-wait-days', 'sequence.max-steps', 'content.share.expires-days')`,
    ),
    /** True of all six keys and of any key added later: a non-positive constant
     *  is one the reading code cannot act on. The per-key ceiling is zod's. */
    check('setting_value_positive', sql`"value" > 0`),
  ],
)

export type ActorRow = typeof actor.$inferSelect
export type ObjectRow = typeof objectRef.$inferSelect
export type EdgeRow = typeof edge.$inferSelect
export type AuditRow = typeof audit.$inferSelect
export type SettingRowDb = typeof setting.$inferSelect
export type SettingValues = typeof setting.$inferInsert
