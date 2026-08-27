import { z } from 'zod'

/** Biến môi trường — kiểm bằng zod, y như mọi dữ liệu vào khác.
 *
 *  Không đọc `process.env.X` rải rác trong code. Một biến gõ sai tên ở dòng
 *  thứ 400 của một service là `undefined` lặng lẽ đi tiếp và hỏng ở chỗ khác;
 *  kiểm một lần lúc khởi động thì nó là một dòng lỗi rõ ràng trước khi máy chủ
 *  nhận request đầu tiên. */

const SCHEMES = ['postgres://', 'postgresql://', 'pglite://'] as const
const csv = z
  .string()
  .default('')
  .transform((value) => [
    ...new Set(
      value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ])

const Env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    /** Ba lược đồ, xem `platform/db/create-db.ts`:
     *   · `postgres://…`          Postgres thật — thứ production chạy
     *   · `pglite://./.pglite`    Postgres chạy trong chính tiến trình này
     *   · `pglite://memory`       như trên nhưng chết theo tiến trình (test)
     *
     *  Kiểm bằng `refine` chứ không `z.string().url()`: `url()` từ chối
     *  `pglite://./.pglite` vì phần sau lược đồ không phải một host hợp lệ. */
    DATABASE_URL: z.string().refine((u) => SCHEMES.some((s) => u.startsWith(s)), {
      message: `DATABASE_URL phải bắt đầu bằng một trong: ${SCHEMES.join(' · ')}`,
    }),

    /** Xem giải thích dài ở `.env.example`. Mặc định TẮT — cửa sau phải được
     *  bật có chủ ý, không được mở ra vì ai đó quên khai biến. */
    PV_TRUST_ACTOR_HEADER: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    /** Browser origins allowed to call the API. CORS is not authentication;
     *  the intake guard still applies origin checks, rate limits and traps. */
    PV_CORS_ORIGINS: csv,
    /** Slugs accepted by `?landingPage=...` on the public intake door. */
    PV_INTAKE_LANDING_PAGES: csv,
    /** HMAC key used before a client IP is persisted as a limiter key. */
    PV_INTAKE_IP_HASH_SECRET: z.string().default('development-only-intake-secret'),
    PV_INTAKE_RATE_PER_MINUTE: z.coerce.number().int().min(1).max(1_000).default(5),
    PV_INTAKE_RATE_PER_DAY: z.coerce.number().int().min(1).max(100_000).default(30),
    PV_INTAKE_PAGE_RATE_PER_MINUTE: z.coerce.number().int().min(1).max(100_000).default(120),
    PV_INTAKE_PAGE_RATE_PER_DAY: z.coerce.number().int().min(1).max(1_000_000).default(5_000),
    PV_INTAKE_MAX_INFLIGHT: z.coerce.number().int().min(1).max(100).default(8),

    // ------------------------------------------------------------------
    // MAIL — cửa ra ngoài công ty, mặc định ĐÓNG
    // ------------------------------------------------------------------
    // `PV_EMAIL_ENABLED=false` không tắt hàng đợi: job vẫn chạy, vẫn ghi sổ
    // gửi, chỉ không có request nào rời khỏi máy. Đó là cách xem trước một
    // email thật mà không bắn nhầm vào hộp thư của người thật — và cũng là
    // trạng thái đúng của mọi máy phát triển.
    RESEND_API_KEY: z.string().default(''),
    RESEND_WEBHOOK_SECRET: z.string().default(''),
    PV_EMAIL_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    /** Phải thuộc domain đã verify trên Resend. Nhìn thấy được nên để trong repo. */
    PV_EMAIL_FROM: z.string().default('PV One CRM <leads@notify.pebblevina.com>'),
    PV_EMAIL_REPLY_TO: z.string().default(''),
    PV_LEAD_NOTIFICATION_TO: z.string().default(''),
    /** Gốc của app web — email nội bộ mang một liên kết mở thẳng lead. */
    PV_APP_URL: z.string().default('http://localhost:5173'),

    /** Trần tự đặt, thấp hơn trần của Resend để chừa chỗ cho thứ khác cùng
     *  tài khoản. Khi có nhiều worker, nhịp phải chia sẻ qua Postgres —
     *  token bucket trong RAM của từng tiến trình là ba worker ba ngân sách. */
    PV_EMAIL_RATE_PER_SECOND: z.coerce.number().int().min(1).max(50).default(4),
    PV_EMAIL_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
    PV_EMAIL_RETRY_LIMIT: z.coerce.number().int().min(0).max(20).default(8),
    PV_EMAIL_RETRY_DELAY_SECONDS: z.coerce.number().int().min(1).max(600).default(5),
    PV_EMAIL_RETRY_DELAY_MAX_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),

    /** Nhịp hỏi hàng đợi. Mỗi lần hỏi là một truy vấn — và Neon chỉ ngủ khi
     *  không ai hỏi, nên con số này là một khoản tiền chứ không chỉ là độ trễ. */
    PV_QUEUE_POLL_SECONDS: z.coerce.number().int().min(1).max(120).default(12),
    /** Worker nên đi đường KHÔNG qua pooler (Neon "direct connection"):
     *  pgbouncer ở chế độ transaction không đưa LISTEN/NOTIFY qua, và trạng
     *  thái mức phiên không còn đáng tin. Bỏ trống = dùng chung DATABASE_URL. */
    PV_QUEUE_DATABASE_URL: z.string().default(''),
  })
  /** PGlite nhận một kết nối tại một thời điểm và không có đủ extension. Nó là
   *  công cụ phát triển; để nó lọt vào production là một sự cố chờ sẵn. */
  .refine((e) => !(e.NODE_ENV === 'production' && e.DATABASE_URL.startsWith('pglite://')), {
    message: 'PGlite không phải database của production — dùng postgres:// ở đó.',
    path: ['DATABASE_URL'],
  })
  .refine((e) => !(e.NODE_ENV === 'production' && e.PV_TRUST_ACTOR_HEADER), {
    message:
      'PV_TRUST_ACTOR_HEADER là cửa sau của POC — bật nó ở production nghĩa là ai cũng đóng vai được giám đốc.',
    path: ['PV_TRUST_ACTOR_HEADER'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.PV_CORS_ORIGINS.length > 0, {
    message: 'Production phải khai ít nhất một origin được gọi API.',
    path: ['PV_CORS_ORIGINS'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.PV_INTAKE_LANDING_PAGES.length > 0, {
    message: 'Production phải allowlist ít nhất một landingPage.',
    path: ['PV_INTAKE_LANDING_PAGES'],
  })
  /** Bật cửa gửi mà thiếu khoá thì mail rơi lặng lẽ trong worker, nơi không
   *  ai nhìn. Hỏng ở đây, lúc khởi động, là một dòng lỗi đọc được. */
  .refine((e) => !(e.PV_EMAIL_ENABLED && e.RESEND_API_KEY.length === 0), {
    message: 'PV_EMAIL_ENABLED=true thì phải có RESEND_API_KEY.',
    path: ['RESEND_API_KEY'],
  })
  .refine((e) => !(e.PV_EMAIL_ENABLED && e.PV_LEAD_NOTIFICATION_TO.length === 0), {
    message: 'PV_EMAIL_ENABLED=true thì phải khai hộp thư nhận báo lead mới.',
    path: ['PV_LEAD_NOTIFICATION_TO'],
  })
  .refine(
    (e) => e.NODE_ENV !== 'production' || !e.PV_EMAIL_ENABLED || e.RESEND_WEBHOOK_SECRET.length > 0,
    {
      message:
        'Production gửi mail mà không verify webhook thì không ai biết mail có tới hay không — và endpoint webhook nhận được của bất kỳ ai.',
      path: ['RESEND_WEBHOOK_SECRET'],
    },
  )
  .refine(
    (e) =>
      e.NODE_ENV !== 'production' ||
      !e.PV_EMAIL_ENABLED ||
      !e.PV_APP_URL.startsWith('http://localhost'),
    {
      message: 'PV_APP_URL là liên kết đi trong email thật — localhost không mở được từ máy khác.',
      path: ['PV_APP_URL'],
    },
  )
  .refine(
    (e) =>
      e.NODE_ENV !== 'production' ||
      (e.PV_INTAKE_IP_HASH_SECRET.length >= 32 &&
        e.PV_INTAKE_IP_HASH_SECRET !== 'development-only-intake-secret'),
    {
      message: 'Production cần secret ngẫu nhiên ít nhất 32 ký tự.',
      path: ['PV_INTAKE_IP_HASH_SECRET'],
    },
  )

export type Env = z.infer<typeof Env>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = Env.safeParse(source)
  if (parsed.success) return parsed.data

  const lines = parsed.error.issues.map((i) => `  · ${i.path.join('.') || '(gốc)'}: ${i.message}`)
  throw new Error(`Cấu hình môi trường sai:\n${lines.join('\n')}`)
}

export const ENV = Symbol('pv.env')
