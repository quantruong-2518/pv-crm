import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@pv/ui'
import { AuthCard, AuthField, PasswordInput } from '@/components/auth-card'
import {
  PASSWORD_MIN,
  checkNewPassword,
  readResetTicket,
  setNewPassword,
  signInWithEmail,
  type AuthError,
} from '@/data/auth'
import { authErrorText, resetPasswordText, t } from '@/data/auth-i18n'
import { useLang } from '@/app/i18n'
import { CHANGE_PASSWORD_PATH, useSession } from '@/app/auth'
import { toastDone } from '@/app/toast'

/** Quên mật khẩu — bước 2: đặt mật khẩu mới.
 *
 *  Người tới đây qua link trong mail, nên vé nằm trên URL (`?token=`) chứ không
 *  trong bộ nhớ React — mở link ở tab khác, máy khác, sau khi tắt trình duyệt
 *  đều phải chạy.
 *
 *  ------------------------------------------------------------------
 *  THE TOKEN IS NOW READ BY THE SERVER, SO THE SCREEN HAS A THIRD STATE
 *  ------------------------------------------------------------------
 *  The POC token was base64 of an email and could be decoded on the spot, so
 *  the screen knew instantly whether to greet somebody or show the dead-link
 *  card. A real token is opaque and signed, and only `GET
 *  /auth/reset-password/:token` can say whether it is still alive — which takes
 *  a round trip. Hence the "đang kiểm tra" card: painting the form first and
 *  yanking it away a moment later would invite someone to start typing a
 *  password into a link that was already expired.
 *
 *  ------------------------------------------------------------------
 *  ĐẶT XONG → ĐĂNG NHẬP NHANH
 *  ------------------------------------------------------------------
 *  Máy chủ thu hồi mọi phiên cũ khi đặt lại, nên phiên mới không "còn sống sót"
 *  mà được mở bằng đúng mật khẩu vừa gõ, qua cửa đăng nhập thường. Đăng nhập
 *  hỏng (mạng, khoá tạm) thì rơi về `/sign-in` như trước. */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  /* Read ONCE: the effect below sweeps `?token=` out of the bar, and a
     `params.get` per render would come back null the moment it does. */
  const [token] = useState(() => params.get('token'))
  const lang = useLang()
  const signIn = useSession((s) => s.signIn)

  const [ticket, setTicket] = useState<{ email: string } | null>(null)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<AuthError | null>(null)
  const [busy, setBusy] = useState(false)

  const firstRef = useRef<HTMLInputElement>(null)

  /* The ticket leaves the URL once read: history, `Referer` on any cross-origin
     resource, and the URL somebody copies to ask for help all carry it
     otherwise. `setParams`, so the router's location stays in step. */
  useEffect(() => {
    if (params.has('token')) setParams({}, { replace: true })
  }, [params, setParams])

  useEffect(() => {
    /* `alive` chặn một câu trả lời cũ ghi đè lên màn sau khi người dùng đã rời
       đi hoặc đã mở một link khác — React 18 trở đi gắn/nhả effect hai lần ở
       dev, nên đây không phải trường hợp hiếm. */
    let alive = true
    setChecking(true)
    void readResetTicket(token).then((found) => {
      if (!alive) return
      setTicket(found)
      setChecking(false)
    })
    return () => {
      alive = false
    }
  }, [token])

  /* Tiêu điểm đặt khi Ô XUẤT HIỆN, không phải khi màn mount: lúc mount còn đang
     hỏi máy chủ và chưa có ô nào để đưa con trỏ vào. */
  useEffect(() => {
    if (ticket) firstRef.current?.focus()
  }, [ticket])

  if (checking) {
    return (
      <AuthCard
        title={t(lang, resetPasswordText.checkingTitle)}
        lead={t(lang, resetPasswordText.checkingLead)}
        back={{ to: '/sign-in', label: t(lang, resetPasswordText.back) }}
      >
        {null}
      </AuthCard>
    )
  }

  if (!ticket) {
    return (
      <AuthCard
        title={t(lang, resetPasswordText.deadTitle)}
        lead={t(lang, resetPasswordText.deadLead)}
        back={{ to: '/sign-in', label: t(lang, resetPasswordText.back) }}
      >
        <Button size="lg" onClick={() => navigate('/forgot-password', { replace: true })}>
          {t(lang, resetPasswordText.requestNew)}
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={t(lang, resetPasswordText.title)}
      lead={
        <>
          {t(lang, resetPasswordText.leadBefore)}
          <b className="text-foreground font-semibold">{ticket.email}</b>
          {t(lang, resetPasswordText.leadAfter(PASSWORD_MIN))}
        </>
      }
      back={{ to: '/sign-in', label: t(lang, resetPasswordText.back) }}
    >
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault()
          if (busy) return
          /* Kiểm tại chỗ trước: hai ô lệch nhau là lỗi gõ, và bắt người dùng
             chờ một vòng mạng để nghe điều đó là bắt chờ vô ích. Máy chủ vẫn
             kiểm lại độ dài — form không phải hàng rào. */
          const wrong = checkNewPassword(password, confirm)
          setError(wrong)
          if (wrong || !token) return

          setBusy(true)
          const refused = await setNewPassword(token, password)
          setBusy(false)
          if (refused) return setError(refused)

          /* Không có phiên nào để giữ (máy chủ vừa thu hồi hết), nên đăng nhập
             lại bằng chính mật khẩu vừa đặt — `remember` tắt, như một lần đăng
             nhập mặc định. */
          const result = await signInWithEmail(ticket.email, password)
          if (!result.ok) {
            navigate('/sign-in', { replace: true, state: { email: ticket.email, reset: true } })
            return
          }
          signIn(result.actor, {
            session: result.session,
            remember: false,
            mustChangePassword: result.mustChangePassword,
          })
          toastDone(t(lang, resetPasswordText.done))
          navigate(result.mustChangePassword ? CHANGE_PASSWORD_PATH : '/', { replace: true })
        }}
        className="flex flex-col gap-5"
      >
        <AuthField
          label={t(lang, resetPasswordText.newPassword)}
          htmlFor="password"
          error={error?.field === 'password' ? authErrorText(lang, error) : undefined}
        >
          <PasswordInput
            ref={firstRef}
            id="password"
            autoComplete="new-password"
            placeholder={t(lang, resetPasswordText.newPasswordPlaceholder(PASSWORD_MIN))}
            value={password}
            invalid={error?.field === 'password'}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(null)
            }}
          />
        </AuthField>

        <AuthField
          label={t(lang, resetPasswordText.confirm)}
          htmlFor="confirm"
          error={error?.field === 'confirm' ? authErrorText(lang, error) : undefined}
        >
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            placeholder={t(lang, resetPasswordText.confirmPlaceholder)}
            value={confirm}
            invalid={error?.field === 'confirm'}
            onChange={(e) => {
              setConfirm(e.target.value)
              setError(null)
            }}
          />
        </AuthField>

        {/* Lỗi không thuộc ô nào: link vừa hết hạn trong lúc gõ, hết lượt thử,
            máy chủ không nối được. Treo dưới ô mật khẩu thì người dùng đi sửa
            mật khẩu, trong khi việc phải làm là xin một link mới. */}
        {error?.field === 'form' && (
          <p role="alert" className="text-destructive-foreground m-0 text-[11px] leading-[1.5]">
            {authErrorText(lang, error)}
          </p>
        )}

        <Button type="submit" size="lg" disabled={busy}>
          {busy ? t(lang, resetPasswordText.submitting) : t(lang, resetPasswordText.submit)}
        </Button>
      </form>
    </AuthCard>
  )
}

export default ResetPasswordPage
