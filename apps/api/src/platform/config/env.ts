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
