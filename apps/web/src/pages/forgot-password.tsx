import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { RESET_TICKET_TTL_MINUTES } from '@pv/contracts'
import { Button, Icon, Input, MailCheck, RefreshCw } from '@pv/ui'
import { AuthCard, AuthField } from '@/components/auth-card'
import { requestPasswordReset, type AuthError } from '@/data/auth'
import { authErrorText, emailHint, forgotPasswordText, t } from '@/data/auth-i18n'
import { useLang } from '@/app/i18n'

/** Quên mật khẩu — bước 1: xin lại đường vào bằng email.
 *
 *  Một màn, hai trạng thái: form và "đã gửi". Trạng thái thứ hai KHÔNG mở màn
 *  mới, vì nó không phải một bước mới — nó là câu trả lời cho việc vừa làm, và
 *  người dùng phải thấy nó ngay trên chỗ mình vừa gõ.
 *
 *  ------------------------------------------------------------------
 *  THE SAME ANSWER FOR A KNOWN MAILBOX AND AN UNKNOWN ONE
 *  ------------------------------------------------------------------
 *  The POC looked the address up and said "Không tìm thấy tài khoản dùng email
 *  này" when it missed. That is gone, and the button that opened a simulated
 *  reset link went with it — there is a mail server now, and letters really
 *  leave the machine.
 *
 *  `POST /auth/forgot-password` answers 204 either way and this screen shows
 *  the "đã gửi" card either way, on purpose. A form that reports which
 *  addresses have accounts is an address-harvesting tool for anyone who can
 *  type: feed it a staff list and it separates the real mailboxes from the
 *  guesses, which is step one of every phishing run aimed at this company. The
 *  cost of hiding it is small and bounded — someone who mistypes their own
 *  address waits for a letter that never comes, and asks again.
 *
 *  So an error is shown here ONLY when the request itself did not land: an
 *  empty box, a malformed address, a rate limit, an unreachable server. Those
 *  say nothing about who has an account, and claiming "đã gửi" when nothing was
 *  sent would be the one lie that actually strands the user. */

/** `RESET_TICKET_TTL_MINUTES` from `@pv/contracts` is the one number the
 *  server, the mailer and this clock all read — a screen that counts down a
 *  different number than the one the server enforces is worse than no clock. */
const RESET_LINK_TTL_SECONDS = RESET_TICKET_TTL_MINUTES * 60

function asClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function ForgotPasswordPage() {
  const location = useLocation()
  const lang = useLang()

  /* Người bấm "Quên mật khẩu?" ở màn đăng nhập đã gõ email rồi — bắt gõ lại là
     bắt làm hai lần cùng một việc. */
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '')
  const [error, setError] = useState<AuthError | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /* Marks when the letter left the server, not when this screen mounted — a
     successful resend pushes it to now and the clock starts over. */
  const [sentAt, setSentAt] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(RESET_LINK_TTL_SECONDS)
  const [resending, setResending] = useState(false)
  /* Kept apart from the form's `error`: that one complains about the box being
     typed in, this one about a resend that did not land. */
  const [resendError, setResendError] = useState<AuthError | null>(null)

  const emailRef = useRef<HTMLInputElement>(null)
  useEffect(() => emailRef.current?.focus(), [])

  useEffect(() => {
    if (!sentTo) return
    const deadline = sentAt + RESET_LINK_TTL_SECONDS * 1000
    /* Read the wall clock every tick instead of decrementing a counter: a
       background tab has its interval throttled to once a minute, and a counter
       would come back minutes behind the link it is describing. */
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left === 0) window.clearInterval(id)
    }
    const id = window.setInterval(tick, 1000)
    tick()
    return () => window.clearInterval(id)
  }, [sentTo, sentAt])

  async function resend(address: string) {
    if (resending) return
    setResending(true)
    const wrong = await requestPasswordReset(address)
    setResending(false)
    setResendError(wrong)
    if (!wrong) setSentAt(Date.now())
  }

  if (sentTo) {
    return (
      <AuthCard
        title={t(lang, forgotPasswordText.sentTitle)}
        back={{ to: '/sign-in', label: t(lang, forgotPasswordText.back) }}
      >
        {/* One note, read once: the promise and the caveat share a box instead
            of splitting across a header lead and a hint. It does NOT promise a
            letter is flying to the address just typed — only the server knows
            whether that address has an account, and hiding that is the point. */}
        <div className="bg-surface-ink/5 flex items-start gap-3 rounded-md p-4">
          <Icon icon={MailCheck} size={18} className="text-muted-foreground mt-1 shrink-0" />
          <p className="text-muted-foreground m-0 text-pretty text-[12px] leading-[1.65]">
            {t(lang, forgotPasswordText.sentBefore)}
            <b className="text-foreground font-semibold">{sentTo}</b>
            {t(lang, forgotPasswordText.sentAfter)} {t(lang, forgotPasswordText.hint)}
          </p>
        </div>

        {/* Off the tinted note and onto the plain card: the clock and the
            resend button are the one thing to DO here, and a button tinted the
            same as the box it sat in nearly vanished once disabled. */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            {/* `role="status"` only once dead — a screen reader should hear the
                link died, not the countdown ticking past it every second. */}
            <p
              role={secondsLeft > 0 ? undefined : 'status'}
              className="text-muted-foreground m-0 text-[12px] tabular-nums leading-[1.65]"
            >
              {secondsLeft > 0
                ? t(lang, forgotPasswordText.expiresIn(asClock(secondsLeft)))
                : t(lang, forgotPasswordText.expired)}
            </p>
            {/* Never disabled by the clock: the rate limit lives on the server, and
                a greyed-out button while the letter is missing blocks the one
                thing the user came here to press. */}
            <Button
              type="button"
              size="lg"
              variant="secondary"
              disabled={resending}
              onClick={() => void resend(sentTo)}
            >
              <Icon icon={RefreshCw} size={16} />
              {resending
                ? t(lang, forgotPasswordText.submitting)
                : t(lang, forgotPasswordText.resend)}
            </Button>
          </div>
          {resendError && (
            <p role="alert" className="text-destructive-foreground m-0 text-[11px] leading-[1.5]">
              {authErrorText(lang, resendError)}
            </p>
          )}
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={t(lang, forgotPasswordText.title)}
      lead={t(lang, forgotPasswordText.lead)}
      back={{ to: '/sign-in', label: t(lang, forgotPasswordText.back) }}
    >
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault()
          if (busy) return
          setBusy(true)
          const wrong = await requestPasswordReset(email)
          setBusy(false)
          if (wrong) return setError(wrong)
          setError(null)
          /* Hiện đúng chuỗi người dùng vừa gõ. Máy chủ không nói lại địa chỉ nào
             cả — nó trả 204 rỗng — và đó chính là điều đang được bảo vệ. */
          setSentTo(email.trim())
          setSentAt(Date.now())
        }}
        className="flex flex-col gap-5"
      >
        <AuthField
          label={t(lang, forgotPasswordText.email)}
          htmlFor="email"
          error={error ? authErrorText(lang, error) : undefined}
        >
          <Input
            ref={emailRef}
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder={t(lang, emailHint)}
            value={email}
            invalid={Boolean(error)}
            onChange={(e) => {
              setEmail(e.target.value)
              setError(null)
            }}
          />
        </AuthField>

        <Button type="submit" size="lg" disabled={busy}>
          {busy ? t(lang, forgotPasswordText.submitting) : t(lang, forgotPasswordText.submit)}
        </Button>
      </form>
    </AuthCard>
  )
}

export default ForgotPasswordPage
