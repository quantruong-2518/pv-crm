import {
  bigint,
  boolean,
  index,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
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
   *  (`ref.owner !== actor.name`) — đó là nợ số 2 của
   *  `docs/ban-giao-backend.md`. Lọc ở SQL thì đã so bằng `id`; ngày trả nợ
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
 *  `kind` mang giá trị CÓ DẤU ('chờ', 'thuộc-về') vì đó là union của engine
 *  hôm nay — nợ số 1 của `docs/ban-giao-backend.md`. Đổi ở engine trước, rồi
 *  một migration đổi dữ liệu; đổi ở đây trước là làm hai bên lệch nhau. */
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

export type ActorRow = typeof actor.$inferSelect
export type ObjectRow = typeof objectRef.$inferSelect
export type EdgeRow = typeof edge.$inferSelect
export type AuditRow = typeof audit.$inferSelect
