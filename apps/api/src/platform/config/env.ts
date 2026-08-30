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
     *  bật có chủ ý, không được mở ra vì ai đó quên khai biến.
     *
     *  Từ khi có phiên thật, cờ này chỉ còn mở một ĐƯỜNG LÙI: `ActorGuard` đọc
     *  cookie `pv_session` trước, và chỉ hỏi tới `X-PV-Actor-Id` khi không có
     *  cookie nào. Nó sống tiếp vì `curl`/Postman không có màn đăng nhập, chứ
     *  không còn là cách app web nhận diện người dùng.
     *
     *  KHÔNG có biến nào khác được thêm cho luồng xác thực, và đó là một quyết
     *  định: tên cookie, hạn phiên, nhịp quét phiên chết và ngưỡng hãm đăng
     *  nhập đều là hằng số trong `platform/auth/`. Hạn phiên đã có đúng một
     *  nguồn là `SESSION_LIMITS` của `@pv/contracts` — cả hai đầu dây cùng đọc
     *  — nên một biến môi trường ở đây sẽ là bản thứ hai của con số đó, tức
     *  đúng thứ hằng số kia sinh ra để chặn. */
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

    /** `From` for the two letters that carry a password link — lời mời và đặt
     *  lại mật khẩu. Bỏ trống = dùng `PV_EMAIL_FROM`.
     *
     *  ------------------------------------------------------------------
     *  VÌ SAO TÁCH, TRONG KHI CẢ HAI ĐỀU LÀ `transactional`
     *  ------------------------------------------------------------------
     *  `PV_EMAIL_FROM` mặc định là `leads@notify.pebblevina.com`, và một lá thư
     *  bảo "bấm vào đây để đặt mật khẩu" đến từ hộp thư LEAD là đúng hình dạng
     *  của một cú lừa. Thứ chúng ta đang dạy người trong công ty là: thư đặt
     *  mật khẩu đến từ địa chỉ nào cũng được, miễn có logo. Sáu tháng sau, một
     *  lá thư thật sự giả mạo sẽ vượt qua đúng bài kiểm tra đó.
     *
     *  Đây KHÔNG cùng lý do với `PV_EMAIL_MAS_FROM`. Cái kia tách để một chiến
     *  dịch bounce hỏng không tiêu mất uy tín của tên miền giao dịch — chuyện
     *  của nhà cung cấp. Cái này tách để người NHẬN nhận ra được thư nào là
     *  thư mở cửa tài khoản của họ — chuyện của con người, và nó không sửa
     *  được bằng cách chọn nhà cung cấp khác.
     *
     *  Bỏ trống là trạng thái BÌNH THƯỜNG, không phải cảnh báo: một tên miền
     *  gửi là một cấu hình hoàn toàn hợp lệ cho tới ngày công ty muốn tách, nên
     *  không có `.refine` nào đòi biến này. Nó chỉ phải thuộc domain đã verify
     *  trên Resend, y như `PV_EMAIL_FROM`. */
    PV_AUTH_EMAIL_FROM: z.string().default(''),
    PV_LEAD_NOTIFICATION_TO: z.string().default(''),
    /** Hộp thư nhận báo CƠ HỘI — mở đơn mới, và đơn thua.
     *
     *  Khoá riêng chứ không dùng lại `PV_LEAD_NOTIFICATION_TO`, vì hai luồng có
     *  hai người đọc: báo lead mới là việc của người trực form landing page,
     *  còn báo cơ hội là việc của người gật đơn. Cùng một hộp thư hôm nay
     *  không có nghĩa là cùng một hộp thư mãi, và tách sau khi đã gộp thì phải
     *  đi sửa cả rule table lẫn secret của Fly.
     *
     *  Bỏ trống = KHÔNG xếp hàng mail nào (E4 bỏ rule khi audience không có
     *  địa chỉ). Đó là hành vi đúng của một máy chưa được bảo gửi đi đâu —
     *  giống hệt `PV_LEAD_NOTIFICATION_TO`, và cũng vì thế nó KHÔNG nằm trong
     *  `.refine` bắt buộc bên dưới: bật cửa gửi mà chưa dùng tới module Ops là
     *  một trạng thái hợp lệ. */
    PV_OPS_NOTIFICATION_TO: z.string().default(''),
    /** Gốc của app web — email nội bộ mang một liên kết mở thẳng lead. */
    PV_APP_URL: z.string().default('http://localhost:5173'),

    /** Gốc URL của thư mục ảnh nhận diện dùng trong thân thư — dấu hiệu ở dải
     *  đầu thư và ở chân thư (`mark-light.png`, `mark-blue.png`).
     *
     *  Ảnh trong email BẮT BUỘC là URL tuyệt đối công khai: `data:` URI bị
     *  Gmail và Outlook chặn thẳng, `cid:` thì phải đính kèm và làm mọi lá thư
     *  nặng thêm, còn đường dẫn tương đối không có gốc nào để nối vì thư không
     *  được mở từ một trang nào cả.
     *
     *  Bỏ trống = `${PV_APP_URL}/brand`, đúng cho mọi bản triển khai phục vụ
     *  `apps/web/public/` ở gốc app — tức là tất cả cho tới khi có CDN riêng.
     *  Dùng `brandAssetUrl()` bên dưới chứ đừng tự ghép, để phép rơi về mặc
     *  định chỉ nằm ở một chỗ.
     *
     *  KHÔNG có `.refine` bắt buộc, dù ảnh trỏ vào localhost trên máy dev là
     *  hai ô trống trong thư thật. Đó là chủ ý: `PV_APP_URL` đã có một
     *  `.refine` chặn localhost khi `PV_EMAIL_ENABLED` bật ở production, nên
     *  đường mặc định đã được gác một lần rồi; thêm một luật thứ hai cho cùng
     *  một sự thật chỉ tạo chỗ cho hai luật lệch nhau. */
    PV_BRAND_ASSET_URL: z.string().default(''),

    /** Trần tự đặt, thấp hơn trần của Resend để chừa chỗ cho thứ khác cùng
     *  tài khoản. Khi có nhiều worker, nhịp phải chia sẻ qua Postgres —
     *  token bucket trong RAM của từng tiến trình là ba worker ba ngân sách. */
    PV_EMAIL_RATE_PER_SECOND: z.coerce.number().int().min(1).max(50).default(4),
    PV_EMAIL_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
    PV_EMAIL_RETRY_LIMIT: z.coerce.number().int().min(0).max(20).default(8),
    PV_EMAIL_RETRY_DELAY_SECONDS: z.coerce.number().int().min(1).max(600).default(5),
    PV_EMAIL_RETRY_DELAY_MAX_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),

    // ------------------------------------------------------------------
    // MAS — bulk marketing mail, a SECOND door with its own switch
    // ------------------------------------------------------------------

    /** `From` for a MAS batch, read ONCE when the run is created and copied
     *  onto `mail_run.from_address`; the composer then sends from the run's
     *  own snapshot, never from this variable. A batch reviewed under one
     *  address has to keep going out from it even if this changes mid-send.
     *
     *  Kept apart from `PV_EMAIL_FROM` because the two carry different
     *  reputations. A bounce or a complaint on a mass mail must not spend the
     *  standing of the subdomain that delivers lead alerts and password mail;
     *  separate sending identities are how one campaign going badly stops at
     *  the campaign. */
    PV_EMAIL_MAS_FROM: z.string().default(''),

    /** `Reply-To` for a MAS batch — where an interested reader's answer lands,
     *  which for marketing mail is a monitored human mailbox rather than the
     *  no-reply sending domain. Snapshotted onto the run exactly like
     *  `PV_EMAIL_MAS_FROM`. Empty = no `Reply-To` header at all, which is a
     *  complete answer: replies then go to `From`. */
    PV_EMAIL_MAS_REPLY_TO: z.string().default(''),

    /** The MAS door itself, default CLOSED — and separate from
     *  `PV_EMAIL_ENABLED` on purpose. That flag decides whether ANY mail leaves
     *  the machine; this one decides whether the bulk path may be used at all.
     *  A deployment that must keep sending lead alerts while marketing is
     *  paused needs exactly this pair, and collapsing them into one switch
     *  makes "stop the campaigns" mean "stop the alerts too". */
    PV_MAS_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    /** A SECOND Resend account for the bulk path. Empty = share `RESEND_API_KEY`.
     *
     *  ------------------------------------------------------------------
     *  WHAT A SEPARATE KEY BUYS THAT A SEPARATE SUBDOMAIN DOES NOT
     *  ------------------------------------------------------------------
     *  `PV_EMAIL_MAS_FROM` already splits the sending IDENTITY, which protects
     *  the reputation of the transactional subdomain. It does not protect the
     *  ACCOUNT: Resend terminates above a 4% bounce rate or a 0.08% complaint
     *  rate, and it does so account-wide "without warning". One bought list can
     *  cross that in a single send, and when it does, the lead alerts and the
     *  password mail go down with the campaign — they ride the same key.
     *
     *  So this is the only variable that keeps a bad MAS batch from taking the
     *  transactional pipeline with it, and it is worth a key in `fly secrets`
     *  even while everything else about MAS is shared.
     *
     *  ------------------------------------------------------------------
     *  READ AT SEND TIME, PER LETTER, BY FLOW — NOT SNAPSHOTTED ON THE RUN
     *  ------------------------------------------------------------------
     *  Opposite call to `PV_EMAIL_MAS_FROM`, which IS snapshotted onto
     *  `mail_run.from_address` because a batch reviewed under one address must
     *  keep going out from it. A key is not part of what anyone reviewed; it is
     *  which account pays for the request. Rotating it must take effect on the
     *  next letter, including letters of a run opened before the rotation —
     *  a snapshotted key would keep a batch posting through a revoked account.
     *  `ResendMailDriver` therefore picks the client by `MailMessage.flow`.
     *
     *  Empty is the ORDINARY state and is not a warning: one account is a
     *  perfectly good configuration until the first real campaign, which is why
     *  no `.refine` below demands it. `RESEND_API_KEY` is already required
     *  whenever the outbound door is open, so an empty value here can only ever
     *  fall back to a key that exists. */
    PV_MAS_RESEND_API_KEY: z.string().default(''),

    /** Ceiling on the recipients of ONE run, enforced server-side.
     *
     *  Mirrors `MAS_MAX_RECIPIENTS` in `@pv/contracts`, which the screen also
     *  reads, and is deliberately configurable where that constant is not: the
     *  contract's 200 is the reviewed default, this is the operator's brake for
     *  the day a list, a provider quota or an incident says otherwise. Hard cap
     *  1000 — past that the right tool is a campaign with an audience
     *  definition, not a hand-picked list nobody can review before pressing
     *  send. */
    PV_MAS_BATCH_MAX: z.coerce.number().int().min(1).max(1_000).default(200),

    /** THE BREAKER'S TRIP POINT, IN PERCENT OF LETTERS THAT LEFT.
     *
     *  4.0 is not a house rule — it is the ceiling Resend publishes, and the
     *  sentence attached to it is that above it an "account may be shut down
     *  without warning". The sanction is at ACCOUNT level, so a marketing batch
     *  that crosses this takes the transactional pipeline down with it: lead
     *  alerts, and everything operational added to that account later. That is
     *  why a run stops itself here instead of waiting for a person to notice a
     *  number on a screen.
     *
     *  A float, deliberately: the interesting region is between 2% and 4%, and
     *  an integer would make "warn at 2.5%" unexpressible. Kept below Resend's
     *  own figure by an operator who wants margin, never above it — this brake
     *  can be loosened, but loosening it past 4.0 only moves where the failure
     *  is noticed, not whether it happens. */
    PV_MAS_BOUNCE_CEILING_PERCENT: z.coerce.number().min(0.1).max(100).default(4.0),

    /** How many letters must have LEFT before the rate above means anything.
     *
     *  A rate is a fraction, and a fraction over a tiny denominator is noise
     *  wearing a percent sign: two bounces out of the first three attempts is
     *  67%, sixteen times the ceiling, and says nothing at all about the other
     *  197 addresses — the first rows out of a batch are not a sample, they are
     *  whatever the queue happened to reach first. Cancelling a run on that
     *  reading throws away a healthy batch and teaches everyone to raise the
     *  ceiling until the breaker stops firing, which is worse than having no
     *  breaker.
     *
     *  20 because it is the smallest denominator on which a single bounce (5%)
     *  is already over 4% — i.e. the smallest sample where the breaker can fire
     *  at all — and because it matches the 20–30 address canary the MAS runbook
     *  asks for before any large batch (`docs/ban-giao-mas-mail.md`). */
    PV_MAS_BOUNCE_MIN_SAMPLE: z.coerce.number().int().min(1).max(10_000).default(20),

    /** HMAC key behind every unsubscribe link — see `unsubscribe-token.ts`.
     *
     *  Without it the link would be a bare delivery id, i.e. an anonymous door
     *  through which anyone who can count can unsubscribe anyone. Rotating this
     *  invalidates every link in every letter already delivered, so it is
     *  rotated on incident, not on schedule. Empty by default because a machine
     *  that does not send MAS needs no key; `PV_MAS_ENABLED=true` refuses to
     *  boot without one. */
    PV_UNSUBSCRIBE_SECRET: z.string().default(''),

    /** Public origin of THIS API, for links a machine follows rather than a
     *  person.
     *
     *  Not `PV_APP_URL`, and the difference is load-bearing: one-click
     *  unsubscribe (RFC 8058) is an unattended `POST` sent by the mail client
     *  itself, with no session and no browser. It has to land on the API host.
     *  Pointing it at the web origin makes every unsubscribe fail silently —
     *  and a failing unsubscribe is worse than none, because the recipient
     *  believes they opted out and reports the next letter as spam instead.
     *
     *  Empty falls back to `PV_APP_URL`, which is correct only where the API
     *  is proxied under the app origin. `PV_MAS_ENABLED=true` refuses that
     *  fallback rather than guessing. */
    PV_API_PUBLIC_URL: z.string().default(''),

    /** Postal address printed in the marketing footer.
     *
     *  A legal requirement for bulk mail, not decoration — CAN-SPAM §7704 and
     *  the equivalent in most jurisdictions require a physical address in
     *  every commercial message. Transactional mail does not need it, which is
     *  why it appears here and not next to `PV_EMAIL_FROM`.
     *
     *  Mặc định là địa chỉ thật của văn phòng, không phải chuỗi rỗng: một bản
     *  triển khai quên khai biến này mà vẫn bật MAS thì thà in đúng địa chỉ
     *  công ty còn hơn dừng ở một `.refine`. Giữ nguyên bản sao ở
     *  `BRAND.postal` (`packages/mail-templates/src/brand.ts`), nơi chân thư
     *  giao dịch đọc nó — hai chỗ vì hai đường không được phép nhập khẩu lẫn
     *  nhau, sửa thì sửa cả hai. */
    PV_MAS_SENDER_POSTAL: z
      .string()
      .default(
        'Văn phòng O1912, Tầng 19, Landmark 72 Tower, Khu E6, ' +
          'Khu đô thị mới Cầu Giấy, P. Yên Hoà, Hà Nội',
      ),

    /** Nhịp hỏi hàng đợi. Mỗi lần hỏi là một truy vấn — và Neon chỉ ngủ khi
     *  không ai hỏi, nên con số này là một khoản tiền chứ không chỉ là độ trễ.
     *
     *  Four, down from twelve. What this number actually buys is the wait
     *  before `MailRelay` notices a ledger row somebody just wrote: it is the
     *  delay a person feels between pressing send and the letter reaching the
     *  provider, and twelve seconds of it read as "the mail is broken". It is
     *  no longer the THROUGHPUT ceiling — that was `batchSize: 1` in
     *  `worker.ts`, fixed there — so this is now paid once per send rather than
     *  once per letter, which is what makes the lower number affordable.
     *
     *  Not lower than that: the same tick also runs `MailRunSweeper` and
     *  `CampaignSweeper`, so every second shaved off is three more queries a
     *  minute on a database that bills for being awake, and nobody is watching
     *  a campaign close in under four seconds. */
    PV_QUEUE_POLL_SECONDS: z.coerce.number().int().min(1).max(120).default(4),
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
  /** A MAS run snapshots its `From` at creation, so an empty one is not a
   *  header a mail library fills in later — it is a batch of two hundred
   *  letters written with no sender. Fail at boot, where it is one line. */
  .refine((e) => !(e.PV_MAS_ENABLED && e.PV_EMAIL_MAS_FROM.length === 0), {
    message: 'PV_MAS_ENABLED=true thì phải khai PV_EMAIL_MAS_FROM.',
    path: ['PV_EMAIL_MAS_FROM'],
  })
  /** Bulk mail without a working unsubscribe link is mail Gmail and Yahoo
   *  refuse — and an unsigned link is one anybody can use on anybody. Neither
   *  failure shows up until the domain is already damaged. */
  .refine((e) => !(e.PV_MAS_ENABLED && e.PV_UNSUBSCRIBE_SECRET.length === 0), {
    message: 'PV_MAS_ENABLED=true thì phải có PV_UNSUBSCRIBE_SECRET để ký liên kết huỷ đăng ký.',
    path: ['PV_UNSUBSCRIBE_SECRET'],
  })
  /* Một-chạm huỷ đăng ký là POST của máy, không phải của trình duyệt — nó phải
     tới được cửa API. Đoán bằng PV_APP_URL chỉ đúng khi API nằm sau cùng một
     origin, và đoán sai thì mọi lượt huỷ chết lặng: người nhận tưởng đã huỷ,
     lá thư sau bị báo spam. */
  .refine((e) => !(e.PV_MAS_ENABLED && e.PV_API_PUBLIC_URL.length === 0), {
    message:
      'PV_MAS_ENABLED=true thì phải khai PV_API_PUBLIC_URL — liên kết huỷ đăng ký đi tới API, không tới web.',
    path: ['PV_API_PUBLIC_URL'],
  })
  /* Địa chỉ bưu chính trong chân thư marketing là yêu cầu luật, không phải
     trang trí. Thiếu nó thì lá thư vi phạm ngay từ lần gửi đầu. */
  .refine((e) => !(e.PV_MAS_ENABLED && e.PV_MAS_SENDER_POSTAL.length === 0), {
    message:
      'PV_MAS_ENABLED=true thì phải khai PV_MAS_SENDER_POSTAL — thư marketing bắt buộc có địa chỉ bưu chính.',
    path: ['PV_MAS_SENDER_POSTAL'],
  })
  /* Rỗng đã bị chặn ở trên, nhưng chỗ thủng thật không phải rỗng — mà là một
     chuỗi giữ chỗ trông như đã khai. `.env` từng mang
     `Pebble Vina · [địa chỉ bưu chính chưa khai]`, và nó ĐI THẲNG vào chân
     thư: `.refine` cũ đếm ký tự nên thấy đủ, mắt người thì chỉ thấy khi thư đã
     nằm trong hộp của khách. Dấu ngoặc vuông không xuất hiện trong địa chỉ
     bưu chính thật ở bất kỳ nước nào, nên nó là dấu hiệu đủ chắc. */
  .refine((e) => !(e.PV_MAS_ENABLED && /[[\]]/.test(e.PV_MAS_SENDER_POSTAL)), {
    message:
      'PV_MAS_SENDER_POSTAL còn là chuỗi giữ chỗ — nó in ra ở chân MỌI thư marketing, khai địa chỉ thật hoặc bỏ hẳn biến này để rơi về mặc định.',
    path: ['PV_MAS_SENDER_POSTAL'],
  })
  /* ------------------------------------------------------------------
     BULK KHÔNG ĐƯỢC MƯỢN DOMAIN CỦA MAIL GIAO DỊCH
     ------------------------------------------------------------------
     Docblock của `PV_EMAIL_MAS_FROM` đã nói vì sao hai địa chỉ tách nhau: một
     lượt bounce của thư hàng loạt không được tiêu uy tín của subdomain đang
     chở báo lead và thư đặt lại mật khẩu. Nhưng "hai biến khác nhau" không
     bằng "hai domain khác nhau" — điền cùng một domain vào cả hai là dựng đủ
     hình thức mà bỏ hết tác dụng, và đó đúng là trạng thái `.env` đã nằm im
     một thời gian: `noreply@notify.` cho giao dịch, `hello@notify.` cho MAS.

     Chỉ bắt khi CẢ HAI cửa cùng mở, vì chỉ khi đó mới có thư thật rời máy.
     Máy chỉ dựng màn hay chỉ chạy thử thì không có uy tín nào để mất. */
  .refine(
    (e) =>
      !(
        e.PV_MAS_ENABLED &&
        e.PV_EMAIL_ENABLED &&
        domainOf(e.PV_EMAIL_MAS_FROM) !== '' &&
        domainOf(e.PV_EMAIL_MAS_FROM) === domainOf(e.PV_EMAIL_FROM)
      ),
    {
      message:
        'PV_EMAIL_MAS_FROM đang dùng CHUNG domain với PV_EMAIL_FROM — bắn hàng loạt từ subdomain của mail giao dịch là đem uy tín của báo lead và thư mật khẩu ra thế chấp. Dùng subdomain marketing riêng (go.<domain>), verify riêng trên Resend.',
      path: ['PV_EMAIL_MAS_FROM'],
    },
  )
  /* `PV_API_PUBLIC_URL` đã có `.refine` chặn rỗng ở trên, nhưng localhost thì
     lọt — và localhost trong một liên kết huỷ đăng ký còn tệ hơn rỗng: thư vẫn
     bay, người nhận vẫn thấy nút "huỷ đăng ký", bấm vào thì trình duyệt của họ
     đi tìm cổng 4123 trên MÁY CỦA CHÍNH HỌ. Một lượt huỷ chết lặng đổi thành
     một lượt báo spam, và trần complaint của Resend là 0,08%.

     Không gác theo `NODE_ENV` như `PV_APP_URL` phía trên: sự cố đã xảy ra
     đúng ở `NODE_ENV=development` trỏ vào database production với cả hai cửa
     gửi mở. Thứ quyết định là "thư có rời máy không", không phải nhãn môi
     trường. */
  .refine(
    (e) =>
      !(
        e.PV_MAS_ENABLED &&
        e.PV_EMAIL_ENABLED &&
        /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(e.PV_API_PUBLIC_URL)
      ),
    {
      message:
        'PV_API_PUBLIC_URL đang trỏ localhost — liên kết huỷ đăng ký trong thư thật phải mở được từ máy của người nhận, nếu không họ báo spam thay vì huỷ.',
      path: ['PV_API_PUBLIC_URL'],
    },
  )
  /* ------------------------------------------------------------------
     NHỊP GỬI PHẢI RỘNG HƠN SỐ LUỒNG, KHÔNG THÌ THƯ CHẾT VÌ LÝ DO NỘI BỘ
     ------------------------------------------------------------------
     Thua cửa nhịp, `MailConsumer` trả `kind: 'retry'` — và `exhausted()` đếm
     lượt đó chung ngân sách với lỗi thật của nhà cung cấp. Hết
     `PV_EMAIL_RETRY_LIMIT` lượt là dòng bị parking `dead`: một lá thư không hề
     bị ai từ chối, chết vì hai con số cấu hình không khớp nhau.

     Cấu hình mặc định (2 luồng, 4 thư/giây) an toàn. Cái bẫy là người vận hành
     nâng số luồng lên để "chạy nhanh hơn" — số luồng KHÔNG phải thứ quyết định
     tốc độ, `PV_EMAIL_RATE_PER_SECOND` mới là, và nâng vế sai làm hỏng thư chứ
     không làm nhanh hơn. Bắt ở đây vì đó là chỗ hai con số cùng đứng. */
  .refine((e) => e.PV_EMAIL_WORKER_CONCURRENCY <= e.PV_EMAIL_RATE_PER_SECOND, {
    message:
      'PV_EMAIL_WORKER_CONCURRENCY vượt PV_EMAIL_RATE_PER_SECOND — số luồng nhiều hơn token mỗi giây thì thư thua cửa nhịp, và mỗi lần thua tiêu một lượt trong ngân sách thử lại cho tới khi bị parking. Nâng nhịp gửi, đừng nâng số luồng.',
    path: ['PV_EMAIL_WORKER_CONCURRENCY'],
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

/** Domain của một địa chỉ gửi, cho `.refine` so hai đường thư với nhau.
 *
 *  Nhận cả hai dạng mà `PV_EMAIL_FROM`/`PV_EMAIL_MAS_FROM` cho phép —
 *  `a@b.com` trần và `Tên Người <a@b.com>` — nên phải cắt từ `@` CUỐI CÙNG:
 *  phần tên hiển thị là chữ tự do và hoàn toàn có thể chứa một dấu `@`.
 *
 *  Không phải bộ phân tích địa chỉ mail đầy đủ, và không cần là: nó chỉ trả
 *  lời "hai địa chỉ này có cùng domain không". Chuỗi không có `@` trả về rỗng,
 *  và bên gọi bỏ qua ca đó — địa chỉ dị dạng là việc của Resend, không phải
 *  việc của một hàng rào uy tín. */
function domainOf(address: string): string {
  const at = address.lastIndexOf('@')
  if (at < 0) return ''
  return address
    .slice(at + 1)
    .replace(/[>\s]/g, '')
    .toLowerCase()
}

export type Env = z.infer<typeof Env>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = Env.safeParse(source)
  if (parsed.success) return parsed.data

  const lines = parsed.error.issues.map((i) => `  · ${i.path.join('.') || '(gốc)'}: ${i.message}`)
  throw new Error(`Cấu hình môi trường sai:\n${lines.join('\n')}`)
}

export const ENV = Symbol('pv.env')

/** Gốc ảnh nhận diện cho thân thư, đã giải xong phép rơi về mặc định.
 *
 *  Một hàm chứ không phải một trường suy ra sẵn trong schema: `Env` là kết quả
 *  của `z.infer`, và mọi trường tính toán thêm vào đó sẽ phải sống trong một
 *  `.transform` chạy trước toàn bộ chuỗi `.refine` — tức là phép rơi về mặc
 *  định sẽ diễn ra TRƯỚC khi `PV_APP_URL` được kiểm. Ở đây thì mỗi lần gọi đều
 *  đọc một `Env` đã hợp lệ.
 *
 *  Cắt dấu `/` cuối vì `markUrl` bên `@pv/mail-templates` sẽ nối tiếp — hai
 *  bên cùng cắt là thừa nhưng vô hại, một bên quên cắt là `//mark-light.png`
 *  và một ô ảnh vỡ. */
export function brandAssetUrl(env: Env): string {
  const base = env.PV_BRAND_ASSET_URL || `${env.PV_APP_URL.replace(/\/+$/, '')}/brand`
  return base.replace(/\/+$/, '')
}
