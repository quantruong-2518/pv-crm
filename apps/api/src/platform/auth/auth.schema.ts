import { index, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { actor, platform } from '../db/platform.schema'

/** Hai bảng của xác thực: phiên đang sống, và vé đặt mật khẩu.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG BẢNG NÀO GIỮ THỨ NGƯỜI DÙNG CẦM
 *  ------------------------------------------------------------------
 *  Cả hai bảng chỉ lưu `sha256` của token, không bao giờ lưu token. Đây là
 *  quyết định đắt nhất trong file này và cũng dễ bỏ qua nhất, nên nói rõ vì
 *  sao: token phiên là thứ ĐỦ để đóng vai người khác. Lưu nguyên văn thì bất kỳ
 *  đường rò đọc-được-database nào — một bản backup, một câu `SELECT` trong log
 *  chậm, một người có quyền đọc Neon — đều biến thành quyền đăng nhập thành mọi
 *  người đang online, và nạn nhân không có cách nào biết.
 *
 *  Băm một chiều thì bảng này chỉ còn trả lời được đúng câu nó cần trả lời:
 *  "token tôi vừa nhận có khớp dòng nào không". Không thêm salt, và đó không
 *  phải cẩu thả — salt chống bảng tra sẵn cho thứ có entropy thấp (mật khẩu
 *  người nghĩ ra). Token ở đây là 32 byte ngẫu nhiên từ `randomBytes`; không có
 *  bảng tra nào cho một không gian 2^256, nên salt chỉ thêm một vòng I/O mà
 *  không mua được gì. Mật khẩu thì ngược lại — xem `password.ts`. */

// ---------------------------------------------------------------------------
// Phiên đăng nhập
// ---------------------------------------------------------------------------

/** Một lần đăng nhập còn sống.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO LÀ MỘT BẢNG, KHÔNG PHẢI MỘT JWT
 *  ------------------------------------------------------------------
 *  JWT không cần bảng, và đó vừa là ưu điểm vừa là toàn bộ vấn đề: thứ máy chủ
 *  không lưu là thứ máy chủ không thu hồi được. Màn Quản trị có nút "Khoá tài
 *  khoản", và nút đó phải đá người kia ra NGAY — không phải sau mười lăm phút
 *  nữa khi token tự hết hạn. Với một bảng thì thu hồi là một `UPDATE`; với JWT
 *  thì phải dựng một danh sách đen, tức là dựng lại đúng cái bảng này nhưng
 *  ngược logic và không ai bảo trì.
 *
 *  Giá phải trả là một truy vấn mỗi request. Nó đi kèm chỉ mục duy nhất trên
 *  `token_hash`, tức một lần đọc chỉ mục — rẻ hơn hẳn việc phải giải thích cho
 *  khách vì sao người vừa nghỉ việc vẫn mở được sổ lead thêm mười lăm phút. */
export const session = platform.table(
  'session',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id),

    /** `sha256(token)`, hex. UNIQUE vì nó là thứ được tra, và vì hai dòng cùng
     *  băm nghĩa là một lỗi sinh token chứ không phải một tình huống hợp lệ. */
    tokenHash: text('token_hash').notNull().unique(),

    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),

    /** Mốc TUYỆT ĐỐI — hết ca làm việc. Không đẩy ra xa được bằng cách ngồi gõ.
     *
     *  Thiếu mốc này thì một tab để mở và một con chuột rung nhẹ giữ phiên sống
     *  vô hạn, đúng thứ giới hạn phiên sinh ra để chặn. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    /** Mốc NGỒI KHÔNG, đẩy ra xa mỗi lần người dùng chạm màn. `null` = tắt trục
     *  này, tức người dùng đã tick "Nhớ tôi" — họ vừa nói máy này là máy của
     *  họ, nên giữ mốc ngồi không cho họ thì cái ô đó chẳng nhớ được gì. */
    idleUntil: timestamp('idle_until', { withTimezone: true }),

    /** Thu hồi lúc nào. `null` = còn sống. Đăng xuất, khoá tài khoản và đổi mật
     *  khẩu đều điền cột này chứ không `DELETE`: một phiên bị thu hồi là một
     *  sự kiện đáng còn dấu vết, và bảng này là chỗ duy nhất trả lời được
     *  "hôm đó ai đá tôi ra". */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    /** Trình duyệt tự khai. KHÔNG dùng để quyết định gì — nó là chuỗi do client
     *  gửi, ai cũng đặt được. Chỉ để người đọc danh sách phiên của mình nhận ra
     *  cái nào là máy nào. */
    userAgent: text('user_agent'),
  },
  (t) => [
    index('session_actor_idx').on(t.actorId),
    /* Quét dọn phiên chết chạy theo `expires_at`, và nó quét cả bảng nếu không
       có chỉ mục này — một bảng phiên là bảng chỉ có thêm, nên "cả bảng" lớn
       dần mãi. */
    index('session_expires_idx').on(t.expiresAt),
  ],
)

// ---------------------------------------------------------------------------
// Vé đặt mật khẩu
// ---------------------------------------------------------------------------

/** Vé một lần để đặt mật khẩu — dùng cho CẢ HAI đường vào.
 *
 *  `purpose` phân biệt hai đường đó, và chúng khác nhau ở đúng một chỗ: ai bấm
 *  nút. `invite` là quản lý vừa mở tài khoản cho một người chưa có mật khẩu;
 *  `reset` là chính người đó bấm "Quên mật khẩu". Cùng một cơ chế vé, cùng một
 *  màn đặt mật khẩu, nhưng hai câu chào khác nhau và hai hạn khác nhau — thư
 *  mời có thể nằm trong hộp thư qua một kỳ nghỉ, còn một yêu cầu đặt lại thì
 *  người ta đang ngồi chờ nó.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO CÓ BẢNG, TRONG KHI `unsubscribe-token.ts` KHÔNG CẦN
 *  ------------------------------------------------------------------
 *  Vé huỷ đăng ký ký bằng HMAC và không lưu gì — đúng cho việc đó, vì huỷ đăng
 *  ký hai lần cũng ra một kết quả. Đặt lại mật khẩu thì không: vé phải dùng
 *  được ĐÚNG MỘT LẦN. Một link đặt mật khẩu còn sống trong hộp thư sau khi đã
 *  dùng là một cửa mở vĩnh viễn cho bất kỳ ai đọc được hộp thư đó về sau — một
 *  người khác trong công ty được chuyển máy, một tài khoản mail bị lộ năm sau.
 *  Chỉ có trạng thái lưu ở máy chủ mới nói được "vé này tiêu rồi", nên bảng
 *  này tồn tại và `used_at` là toàn bộ lý do. */
export const passwordReset = platform.table(
  'password_reset',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id),

    tokenHash: text('token_hash').notNull().unique(),

    /** `'invite'` · `'reset'`. Chuỗi trần chứ không enum Postgres: thêm một
     *  loại vé thứ ba không đáng một migration `ALTER TYPE`, và tầng zod đã
     *  chặn giá trị lạ trước khi nó tới đây. */
    purpose: text('purpose').$type<'invite' | 'reset'>().notNull(),

    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    /** Đã tiêu lúc nào. `null` = chưa dùng. Cột này LÀ cơ chế một-lần. */
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => [index('password_reset_actor_idx').on(t.actorId)],
)

export type SessionRow = typeof session.$inferSelect
export type PasswordResetRow = typeof passwordReset.$inferSelect
