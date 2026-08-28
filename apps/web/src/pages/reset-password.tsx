import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@pv/ui'
import { AuthCard, AuthField, PasswordInput } from '@/components/auth-card'
import {
  PASSWORD_MIN,
  checkNewPassword,
  readResetTicket,
  setNewPassword,
  type AuthError,
} from '@/data/auth'

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
 *  ĐẶT XONG KHÔNG VÀO THẲNG NỮA — VỀ MÀN ĐĂNG NHẬP
 *  ------------------------------------------------------------------
 *  Bản POC vào luôn, với lý do hợp lý ở thời điểm đó: người vừa gõ mật khẩu mới
 *  hai lần mà còn bị bắt gõ lần thứ ba là bắt chứng minh một việc hệ vừa tận
 *  mắt nhìn thấy.
 *
 *  Có máy chủ thì lý do đó không còn đứng được. Đặt lại mật khẩu thành công
 *  **thu hồi mọi phiên đang sống của tài khoản** — đó chính là việc nó sinh ra
 *  để làm, vì trường hợp phải dùng tới nó là trường hợp có người khác đang cầm
 *  mật khẩu cũ và có thể đang ngồi trong một phiên. Cấp một phiên mới ngay tại
 *  đây là mở lại đúng cánh cửa vừa đóng, và tệ hơn: người bấm link trong mail
 *  rất hay đang ngồi máy lạ.
 *
 *  Nên màn này đưa họ về `/dang-nhap`, điền sẵn email và nói rõ vừa xảy ra
 *  chuyện gì. Một lần gõ mật khẩu, đổi lấy việc mọi phiên cũ thật sự chết. */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token')

  const [ticket, setTicket] = useState<{ email: string } | null>(null)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<AuthError | null>(null)
  const [busy, setBusy] = useState(false)

  const firstRef = useRef<HTMLInputElement>(null)

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
        title="Đang kiểm tra link…"
        lead="Chờ một nhịp — hệ đang xem link này còn dùng được không."
        back={{ to: '/dang-nhap', label: 'Về màn đăng nhập' }}
      >
        {null}
      </AuthCard>
    )
  }

  if (!ticket) {
    return (
      <AuthCard
        title="Link không dùng được"
        lead="Vé đặt lại này hỏng hoặc đã hết hạn. Xin một link mới — mất chừng mười giây."
        back={{ to: '/dang-nhap', label: 'Về màn đăng nhập' }}
      >
        <Button size="lg" onClick={() => navigate('/quen-mat-khau', { replace: true })}>
          Xin link mới
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Đặt mật khẩu mới"
      lead={
        <>
          Cho tài khoản <b className="text-foreground font-semibold">{ticket.email}</b>. Tối thiểu{' '}
          {PASSWORD_MIN} ký tự. Đặt xong, mọi phiên cũ của tài khoản này bị đóng và bạn đăng nhập
          lại bằng mật khẩu mới.
        </>
      }
      back={{ to: '/dang-nhap', label: 'Về màn đăng nhập' }}
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

          /* Không `signIn` ở đây — xem docblock đầu file. Email đi kèm để họ
             không phải gõ lại, `reset` để màn kia nói đúng câu thay vì để họ
             đoán xem mình vừa bị đá về đây vì cái gì. */
          navigate('/dang-nhap', { replace: true, state: { email: ticket.email, reset: true } })
        }}
        className="flex flex-col gap-5"
      >
        <AuthField
          label="Mật khẩu mới"
          htmlFor="password"
          error={error?.field === 'password' ? error.message : undefined}
        >
          <PasswordInput
            ref={firstRef}
            id="password"
            autoComplete="new-password"
            placeholder={`Tối thiểu ${PASSWORD_MIN} ký tự`}
            value={password}
            invalid={error?.field === 'password'}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(null)
            }}
          />
        </AuthField>

        <AuthField
          label="Nhập lại mật khẩu mới"
          htmlFor="confirm"
          error={error?.field === 'confirm' ? error.message : undefined}
        >
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            placeholder="Gõ lại đúng chuỗi trên"
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
            {error.message}
          </p>
        )}

        <Button type="submit" size="lg" disabled={busy}>
          {busy ? 'Đang đặt lại…' : 'Đặt lại mật khẩu'}
        </Button>
      </form>
    </AuthCard>
  )
}

export default ResetPasswordPage
