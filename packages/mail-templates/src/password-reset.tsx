import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { Divider, Heading, OpenLink } from './ops-mail-bits'
import {
  BODY_STYLE,
  COLOR_ACCENT,
  COLOR_BG,
  COLOR_INK,
  COLOR_MUTED,
  CONTAINER_STYLE,
  formatMoment,
} from './ops-mail-style'

/** THE LETTER THAT CARRIES A SET-PASSWORD LINK — one template, two greetings.
 *
 *  ------------------------------------------------------------------
 *  WHY ONE TEMPLATE AND NOT TWO
 *  ------------------------------------------------------------------
 *  An invite and a reset end at the SAME screen (`/dat-lai-mat-khau`), carry
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

function copyFor(purpose: 'invite' | 'reset'): Copy {
  if (purpose === 'invite') {
    return {
      preview: 'Đặt mật khẩu đầu tiên để bắt đầu dùng PV One.',
      heading: 'Tài khoản PV One của bạn đã được mở',
      lead:
        'Quản lý vừa mở cho bạn một tài khoản trên PV One. Tài khoản đã sẵn sàng, chỉ còn ' +
        'thiếu mật khẩu — bấm nút bên dưới để tự đặt mật khẩu đầu tiên.',
      cta: 'Đặt mật khẩu đầu tiên',
      reassurance:
        'Quá hạn thì nhờ người đã mở tài khoản gửi lại một lời mời mới. Không có cách nào ' +
        'gia hạn liên kết cũ, và đó là chủ ý.',
    }
  }
  return {
    preview: 'Liên kết đặt lại mật khẩu cho tài khoản PV One của bạn.',
    heading: 'Đặt lại mật khẩu PV One',
    lead:
      'Có người vừa yêu cầu đặt lại mật khẩu cho tài khoản này. Bấm nút bên dưới để chọn ' +
      'một mật khẩu mới.',
    reassurance:
      'Nếu không phải bạn yêu cầu thì cứ bỏ qua thư này: mật khẩu hiện tại giữ nguyên và ' +
      'không có gì thay đổi. Chỉ khi bạn thật sự đặt mật khẩu mới thì mọi thiết bị đang ' +
      'đăng nhập mới bị đăng xuất.',
    cta: 'Đặt lại mật khẩu',
  }
}

/** "còn 60 phút" / "còn 7 ngày", in the unit the recipient would say it in.
 *
 *  Rendering happens milliseconds after the ticket row is written, so the
 *  distance to `expiresAt` IS the TTL — which is exactly why the number can be
 *  derived instead of imported across a package boundary that forbids it.
 *
 *  The unit thresholds are chosen so the two TTLs in use today read naturally
 *  (60 minutes stays "60 phút" rather than becoming a bare "1 giờ" that sounds
 *  vaguer than the guarantee actually is) and so a future TTL of any size still
 *  produces a sentence a person can act on.
 *
 *  Returns `null` rather than guessing when the value is unusable or already
 *  past — a clock skewed the wrong way must not tell somebody their live link
 *  expired. The body then falls back to printing the absolute moment, which is
 *  still true. */
function remainingPhrase(expiresAtIso: string, now: number): string | null {
  const at = new Date(expiresAtIso).getTime()
  if (Number.isNaN(at)) return null

  const minutes = (at - now) / 60_000
  if (minutes <= 0) return null
  if (minutes < 90) return `${Math.max(1, Math.round(minutes))} phút`

  const hours = minutes / 60
  if (hours < 48) return `${Math.round(hours)} giờ`
  return `${Math.round(hours / 24)} ngày`
}

const PARAGRAPH_STYLE = {
  margin: '0 0 12px',
  fontSize: 14,
  lineHeight: '22px',
  color: COLOR_INK,
} as const

const NOTE_STYLE = { margin: '0 0 8px', fontSize: 12, lineHeight: '18px', color: COLOR_MUTED }

/** The button. Padding and the `display: inline-block` are stated inline
 *  because that is the only styling a mail client is reliably left holding —
 *  `<style>` blocks are stripped by Gmail's web client and by most corporate
 *  gateways, so anything that matters has to travel on the element itself. */
const BUTTON_STYLE = {
  backgroundColor: COLOR_ACCENT,
  color: COLOR_BG,
  borderRadius: 6,
  display: 'inline-block',
  fontSize: 15,
  fontWeight: 700,
  padding: '12px 22px',
  textDecoration: 'none',
} as const

export function PasswordResetEmail(data: PasswordResetData) {
  const copy = copyFor(data.purpose)
  const greeting = data.name.trim() || 'bạn'
  const remaining = remainingPhrase(data.expiresAt, Date.now())
  const moment = formatMoment(data.expiresAt)

  return (
    <Html lang="vi">
      <Head />
      <Preview>{copy.preview}</Preview>
      <Body style={BODY_STYLE}>
        <Container style={CONTAINER_STYLE}>
          <Heading>{copy.heading}</Heading>
          <Text style={{ fontSize: 12, color: COLOR_MUTED, margin: '0 0 24px' }}>
            Tài khoản {data.email}
          </Text>

          <Section>
            <Text style={PARAGRAPH_STYLE}>Chào {greeting},</Text>
            <Text style={PARAGRAPH_STYLE}>{copy.lead}</Text>
          </Section>

          <Section style={{ margin: '4px 0 20px' }}>
            <Button href={data.link} style={BUTTON_STYLE}>
              {copy.cta}
            </Button>
          </Section>

          <Section>
            <Text style={NOTE_STYLE}>
              Nút không bấm được thì chép nguyên đường dẫn này vào thanh địa chỉ trình duyệt:
            </Text>
            <OpenLink url={data.link} />
          </Section>

          <Divider />

          <Section>
            <Text style={PARAGRAPH_STYLE}>
              {remaining
                ? `Liên kết này hết hạn sau ${remaining}, tức lúc ${moment}. Mỗi liên kết chỉ dùng được một lần.`
                : `Liên kết này hết hạn lúc ${moment}. Mỗi liên kết chỉ dùng được một lần.`}
            </Text>
            <Text style={PARAGRAPH_STYLE}>{copy.reassurance}</Text>
            <Text style={NOTE_STYLE}>
              Đừng chuyển tiếp thư này cho ai: người giữ liên kết là người đặt được mật khẩu cho tài
              khoản.
            </Text>
            <Text style={NOTE_STYLE}>Thư này do hệ thống gửi tự động, không cần trả lời.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
