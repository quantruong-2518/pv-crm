import { Link, Section } from '@react-email/components'
import { BRAND } from './brand'
import {
  BrandShell,
  CtaButton,
  Fact,
  FactBox,
  FallbackLink,
  Note,
  Para,
  ShellHeading,
} from './brand-shell'
import { COLOR_PRIMARY, formatMoment } from './ops-mail-style'
import { mailText, type MailLang } from './mail-locale'

/** THE LETTER THAT CARRIES A SET-PASSWORD LINK — one template, two greetings.
 *
 *  ------------------------------------------------------------------
 *  WHY ONE TEMPLATE AND NOT TWO
 *  ------------------------------------------------------------------
 *  An invite and a reset end at the SAME screen (`/reset-password`), carry
 *  the same kind of single-use token, and are subject to the same handling rule
 *  — do not forward it, it sets a password. What differs is who asked and how
 *  long the ticket lives, and that is a paragraph and a number, not a layout.
 *
 *  Two files would be two places for the "don't forward this" warning to drift
 *  out of, and mail templates drift in silence: nothing renders them in CI, and
 *  the first person to notice a difference is a recipient who cannot log in.
 *  The `purpose` switch keeps the shared half literally shared.
 *
 *  ------------------------------------------------------------------
 *  THE LINK IS PRINTED AS TEXT AS WELL AS DRAWN AS A BUTTON
 *  ------------------------------------------------------------------
 *  Not belt-and-braces politeness — the button is the part most likely to be
 *  missing at the other end. Outlook desktop renders it through VML, several
 *  corporate gateways rewrite or strip anchors wholesale, and a plain-text
 *  reader gets no button at all. A recipient who can see neither button nor URL
 *  has no second route: the only other way into a fresh account is to ask a
 *  manager to issue another ticket. So `OpenLink` prints the whole URL, and the
 *  line above it says out loud what to do with it.
 *
 *  ------------------------------------------------------------------
 *  THE EXPIRY IS COMPUTED, NEVER TYPED
 *  ------------------------------------------------------------------
 *  `RESET_TTL_MS` and `INVITE_TTL_MS` live in `auth.service.ts`, and this
 *  package cannot see them (it may not import from `@api/*`). A literal "60
 *  phút" here would therefore be a copy that nothing keeps honest — wrong the
 *  first time somebody shortens the reset window, and wrong in the one place
 *  where being wrong tells a person their live link is dead or their dead link
 *  is live. `remainingPhrase` derives the sentence from `expiresAt`, which is
 *  the same value the database row was written with.
 *
 *  ------------------------------------------------------------------
 *  NO AURORA GLASS HERE, AND THAT IS NOT AN OVERSIGHT
 *  ------------------------------------------------------------------
 *  This is an email body, not a screen: no `var(--*)`, no backdrop filter, no
 *  class names that survive a mail client's sanitizer. Colors come from the
 *  resolved constants in `ops-mail-style.ts` (which read `@pv/tokens` by name,
 *  so `aurora/no-raw-hex` stays satisfied), every element states its own color
 *  explicitly, and the font stack is the system one — the same choices the four
 *  templates beside this one already made, for the reasons written there. */
export type PasswordResetData = {
  /** `'invite'` — a manager opened this account and its owner is meeting it for
   *  the first time. `'reset'` — the owner pressed "Quên mật khẩu" and is
   *  sitting at the screen. Same ticket, same destination, different greeting
   *  and a TTL two orders of magnitude apart. */
  purpose: 'invite' | 'reset'
  lang?: MailLang
  /** For the greeting. Falls back to a neutral form when blank rather than
   *  printing "Chào ,". */
  name: string
  /** WHICH account this letter is about. A person can hold two mailboxes and a
   *  shared inbox can receive both; naming the account is what stops them
   *  setting a password on the wrong one. Never in the subject — see
   *  `renderPasswordReset` in `index.ts`. */
  email: string
  /** The set-password URL, already built by `resetLink` in `reset-mailer.ts`.
   *
   *  This is where the raw token enters the letter, and it is the ONLY place it
   *  is allowed to be: there is deliberately no `token` prop, so no caller can
   *  put a second copy of the credential in a header, a preview line or a log
   *  by way of this template. */
  link: string
  /** Gốc URL công khai của ảnh nhận diện, cho `BrandShell`. Đi qua dữ liệu
   *  chứ không phải hằng số của gói vì nó là sự thật của bản triển khai —
   *  máy dev, staging và Fly có ba gốc khác nhau. Xem `PV_BRAND_ASSET_URL`. */
  assetBaseUrl: string
  /** ISO-8601 with an offset — `Date#toISOString()` on the ticket's own
   *  `expires_at`. */
  expiresAt: string
}

type Copy = {
  preview: string
  heading: string
  /** Why this letter exists, in the recipient's words. */
  lead: string
  cta: string
  /** What happens if they do nothing, or if they arrive too late. The half of
   *  the letter that stops a support ticket. */
  reassurance: string
}

function copyFor(purpose: 'invite' | 'reset', lang: MailLang): Copy {
  if (purpose === 'invite') {
    return {
      preview: mailText(
        lang,
        `Đặt mật khẩu để bắt đầu dùng ${BRAND.product}.`,
        `Set a password to start using ${BRAND.product}.`,
        `비밀번호를 설정하고 ${BRAND.product}을 시작하세요.`,
      ),
      heading: mailText(
        lang,
        `Đặt mật khẩu cho ${BRAND.product}`,
        `Set your ${BRAND.product} password`,
        `${BRAND.product} 비밀번호 설정`,
      ),
      lead: mailText(
        lang,
        `Tài khoản ${BRAND.product} của bạn đã được tạo. Đặt mật khẩu để đăng nhập.`,
        `Your ${BRAND.product} account is ready. Set a password to sign in.`,
        `${BRAND.product} 계정이 준비되었습니다. 비밀번호를 설정하고 로그인하세요.`,
      ),
      cta: mailText(lang, 'Đặt mật khẩu', 'Set password', '비밀번호 설정'),
      reassurance: mailText(
        lang,
        'Liên kết hết hạn? Nhờ quản trị viên gửi lời mời mới.',
        'If this link has expired, ask your administrator to send a new invite.',
        '링크가 만료되었으면 관리자에게 초대를 다시 보내 달라고 요청하세요.',
      ),
    }
  }
  return {
    preview: mailText(
      lang,
      `Yêu cầu đặt lại mật khẩu ${BRAND.product}.`,
      `Reset your ${BRAND.product} password.`,
      `${BRAND.product} 비밀번호 재설정 요청입니다.`,
    ),
    heading: mailText(lang, 'Đặt lại mật khẩu', 'Reset your password', '비밀번호 재설정'),
    lead: mailText(
      lang,
      `Dùng nút bên dưới để tạo mật khẩu mới cho ${BRAND.product}.`,
      `Use the button below to create a new ${BRAND.product} password.`,
      `아래 버튼을 눌러 ${BRAND.product}의 새 비밀번호를 설정하세요.`,
    ),
    reassurance: mailText(
      lang,
      'Nếu bạn không yêu cầu đặt lại, hãy bỏ qua thư này. Mật khẩu hiện tại vẫn dùng được. Đặt mật khẩu mới sẽ đăng xuất các thiết bị khác.',
      'If you did not request a reset, ignore this email. Your current password will keep working. Setting a new password signs out your other sessions.',
      '재설정을 요청하지 않았다면 이 이메일을 무시하세요. 현재 비밀번호는 계속 사용할 수 있습니다. 새 비밀번호를 설정하면 다른 기기에서 로그아웃됩니다.',
    ),
    cta: mailText(lang, 'Đặt lại mật khẩu', 'Reset password', '비밀번호 재설정'),
  }
}

/** "còn 30 phút" / "còn 7 ngày", in the unit the recipient would say it in.
 *
 *  Rendering happens milliseconds after the ticket row is written, so the
 *  distance to `expiresAt` IS the TTL — which is exactly why the number can be
 *  derived instead of imported across a package boundary that forbids it.
 *
 *  The unit thresholds are chosen so the two TTLs in use today read naturally
 *  (30 minutes stays "30 phút" rather than becoming a bare fraction of an hour
 *  that sounds vaguer than the guarantee actually is) and so a future TTL of
 *  any size still produces a sentence a person can act on.
 *
 *  Returns `null` rather than guessing when the value is unusable or already
 *  past — a clock skewed the wrong way must not tell somebody their live link
 *  expired. The body then falls back to printing the absolute moment, which is
 *  still true. */
function remainingPhrase(expiresAtIso: string, now: number, lang: MailLang): string | null {
  const at = new Date(expiresAtIso).getTime()
  if (Number.isNaN(at)) return null

  const minutes = (at - now) / 60_000
  if (minutes <= 0) return null
  if (minutes < 90) {
    const value = Math.max(1, Math.round(minutes))
    return mailText(
      lang,
      `${value} phút`,
      `${value} ${value === 1 ? 'minute' : 'minutes'}`,
      `${value}분`,
    )
  }

  const hours = minutes / 60
  if (hours < 48) {
    const value = Math.round(hours)
    return mailText(
      lang,
      `${value} giờ`,
      `${value} ${value === 1 ? 'hour' : 'hours'}`,
      `${value}시간`,
    )
  }
  const days = Math.round(hours / 24)
  return mailText(lang, `${days} ngày`, `${days} ${days === 1 ? 'day' : 'days'}`, `${days}일`)
}

/** Hạn dùng đứng ở HỘP SỐ LIỆU, không trộn vào câu văn.
 *
 *  Đây là dữ kiện người nhận phải đối chiếu với đồng hồ của họ — cùng loại
 *  với địa chỉ hộp thư ngay trên nó — chứ không phải một mệnh đề để đọc lướt.
 *  Bản cũ in nó thành một câu giữa hai đoạn văn và nó chìm đúng vào lúc cần
 *  nổi nhất: khi người ta mở lại lá thư sau vài tiếng để xem còn kịp không.
 *
 *  Giữ CẢ khoảng cách lẫn mốc tuyệt đối: "còn 30 phút" là thứ hành động được
 *  ngay, còn "15:20 ngày 29/08" là thứ vẫn đúng khi lá thư được đọc lại lần
 *  thứ hai, lúc con số kia đã sai. Không có khoảng cách — đồng hồ lệch, hoặc
 *  vé đã quá hạn — thì chỉ còn mốc tuyệt đối, thứ luôn luôn thật. */
function expiryValue(remaining: string | null, moment: string, lang: MailLang): string {
  if (!remaining) return moment
  return mailText(
    lang,
    `Còn ${remaining} · ${moment}`,
    `${remaining} left · ${moment}`,
    `${remaining} 남음 · ${moment}`,
  )
}

export function PasswordResetEmail(data: PasswordResetData) {
  const lang = data.lang ?? 'vi'
  const copy = copyFor(data.purpose, lang)
  const greeting = data.name.trim() || mailText(lang, 'bạn', 'there', '')
  const remaining = remainingPhrase(data.expiresAt, Date.now(), lang)
  const moment = formatMoment(data.expiresAt, lang)

  return (
    <BrandShell preview={copy.preview} assetBaseUrl={data.assetBaseUrl} lang={lang}>
      <ShellHeading>{copy.heading}</ShellHeading>
      <Para>
        {mailText(
          lang,
          `Xin chào ${greeting},`,
          `Hello ${greeting},`,
          greeting ? `${greeting}님, 안녕하세요.` : '안녕하세요.',
        )}
      </Para>
      <Para>{copy.lead}</Para>

      <CtaButton href={data.link}>{copy.cta}</CtaButton>

      <FactBox>
        <Fact label={mailText(lang, 'Tài khoản', 'Account', '계정')} value={data.email} />
        <Fact
          label={mailText(lang, 'Thời hạn liên kết', 'Link expires', '링크 만료')}
          value={expiryValue(remaining, moment, lang)}
        />
      </FactBox>

      {/* `FallbackLink` mang `margin: 0`, nên khoảng cách với đoạn kế tiếp
          phải do chỗ này giữ — không có nó thì lời trấn an dính liền vào một
          dòng URL dài đang ngắt giữa chữ. */}
      <Section style={{ margin: '0 0 20px' }}>
        <Note>
          {mailText(
            lang,
            'Nếu nút không hoạt động, hãy sao chép liên kết sau và dán vào trình duyệt:',
            'If the button does not work, copy this link and paste it into your browser:',
            '버튼이 작동하지 않으면 아래 링크를 복사해 브라우저에 붙여 넣으세요:',
          )}
        </Note>
        <FallbackLink url={data.link} />
      </Section>

      <Note>
        {mailText(
          lang,
          'Liên kết chỉ dùng được một lần.',
          'This link can only be used once.',
          '이 링크는 한 번만 사용할 수 있습니다.',
        )}{' '}
        {copy.reassurance}
      </Note>
      <Note>
        {mailText(
          lang,
          'Vì lý do bảo mật, đừng chuyển tiếp email này.',
          'For your security, do not forward this email.',
          '보안을 위해 이 이메일을 전달하지 마세요.',
        )}
      </Note>
      <Note>
        {mailText(lang, 'Cần hỗ trợ? Liên hệ ', 'Need help? Contact ', '도움이 필요하면 ')}
        <Link href={`mailto:${BRAND.contactEmail}`} style={{ color: COLOR_PRIMARY }}>
          {BRAND.contactEmail}
        </Link>
      </Note>

      <Section style={{ margin: '20px 0 0' }}>
        <Para>
          {mailText(lang, 'Trân trọng,', 'Regards,', '감사합니다,')}
          <br />
          {BRAND.product}
        </Para>
      </Section>
    </BrandShell>
  )
}
