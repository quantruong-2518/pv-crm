import { useEffect, useRef, useState } from 'react'
import { MailCheck } from '@pv/ui'
import { useLocation } from 'react-router-dom'
import { Button, Icon, Input } from '@pv/ui'
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
export function ForgotPasswordPage() {
  const location = useLocation()
  const lang = useLang()

  /* Người bấm "Quên mật khẩu?" ở màn đăng nhập đã gõ email rồi — bắt gõ lại là
     bắt làm hai lần cùng một việc. */
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '')
  const [error, setError] = useState<AuthError | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const emailRef = useRef<HTMLInputElement>(null)
  useEffect(() => emailRef.current?.focus(), [])

  if (sentTo) {
    return (
      <AuthCard
        title={t(lang, forgotPasswordText.sentTitle)}
        lead={
          <>
            {t(lang, forgotPasswordText.sentBefore)}
            <b className="text-foreground font-semibold">{sentTo}</b>
            {t(lang, forgotPasswordText.sentAfter)}
          </>
        }
        back={{ to: '/sign-in', label: t(lang, forgotPasswordText.back) }}
      >
        {/* Câu này thay chỗ nút "mở link giả lập" của bản POC, và nó phải nói
            đúng thứ người đang đợi thư cần biết. Nó KHÔNG hứa rằng có một lá thư
            đang bay tới địa chỉ vừa gõ — chỉ có máy chủ biết địa chỉ đó có tài
            khoản hay không, và đó là điều màn này cố ý không tiết lộ. */}
        <div className="bg-surface-ink/5 flex items-start gap-3 rounded-md p-4">
          <Icon icon={MailCheck} size={18} className="text-muted-foreground mt-1 shrink-0" />
          <p className="text-muted-foreground m-0 text-pretty text-[12px] leading-[1.65]">
            {t(lang, forgotPasswordText.hint)}
          </p>
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
