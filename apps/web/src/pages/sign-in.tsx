import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button, Checkbox, Input } from '@pv/ui'
import { AuthCard, AuthField, PasswordInput } from '@/components/auth-card'
import { EMAIL_HINT, signInWithEmail, type AuthError } from '@/data/auth'
import { useSession } from '@/app/auth'

/** Màn đăng nhập — cửa vào của PV One.
 *
 *  Trước 23/08 đây là màn CHỌN VAI: bấm một cái tên là vào, không mật khẩu.
 *  Đổi thành form email + mật khẩu vì đây là màn đầu tiên khách nhìn thấy, và
 *  một hệ ERP không hỏi mật khẩu thì không ai tin phần còn lại của nó.
 *
 *  Bảng chọn vai đã BỎ HẲN, không lùi xuống chân card. Đổi vai vẫn làm được và
 *  vẫn cần được (docs/luat-thiet-ke.md §7 — TP Kinh doanh nhìn khác Giám đốc),
 *  nhưng bằng đúng đường mọi người dùng đi: đăng xuất rồi đăng nhập bằng email
 *  của vai kia. Một cửa sau bỏ qua mật khẩu ngay trên màn đăng nhập thì màn này
 *  không còn chứng minh được điều nó sinh ra để chứng minh.
 *
 *  The accounts are rows in `platform.actor` now, not entries in a fixture, so
 *  there is nowhere on this screen to look one up and nothing to demo with but
 *  a real mailbox and a real password. The screen itself barely changed for
 *  that: it still asks `data/auth.ts` one question and hands the answer to the
 *  session store. What it hands over is now a PAIR — the person, and the window
 *  the server stamped on their session — because the browser no longer decides
 *  when a session ends. */
export function SignInPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const status = useSession((s) => s.status)
  const beginSignIn = useSession((s) => s.beginSignIn)
  const signIn = useSession((s) => s.signIn)
  const remembered = useSession((s) => s.remember)

  /** Ai gửi người ta tới đây, và kèm theo cái gì.
   *
   *  Guard gửi kèm hai thứ khi nó đá người ta về: đường đang định vào, và phiên
   *  vừa chết hay chưa từng có. Cả hai đều phải dùng — quay lại đúng chỗ cũ, và
   *  nói đúng lý do.
   *
   *  Màn đặt lại mật khẩu gửi thêm hai thứ nữa (`email`, `reset`). Nó KHÔNG
   *  được tự đăng nhập hộ — máy chủ vừa thu hồi mọi phiên của tài khoản đó — nên
   *  người dùng hạ cánh ở đây ngay sau khi vừa gõ mật khẩu mới hai lần. Không
   *  nói gì thì cú nhảy ấy trông y như thao tác vừa rồi đã hỏng. */
  const sent = location.state as {
    from?: string
    expired?: boolean
    email?: string
    reset?: boolean
  } | null
  const from = sent?.from ?? '/'

  const [email, setEmail] = useState(sent?.email ?? '')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(remembered)
  const [error, setError] = useState<AuthError | null>(null)

  const emailRef = useRef<HTMLInputElement>(null)
  useEffect(() => emailRef.current?.focus(), [])

  /* Đã có phiên mà vẫn vào màn này (gõ tay `/dang-nhap`, hoặc tab khác vừa đăng
     nhập hộ) thì đi tiếp, đừng bắt đăng nhập lần hai. */
  if (status === 'đã-vào') return <Navigate to={from} replace />

  const sending = status === 'đang-vào'

  return (
    <AuthCard
      title="Đăng nhập"
      lead={
        sent?.reset
          ? 'Mật khẩu đã đổi. Đăng nhập lại bằng mật khẩu mới — mọi phiên cũ của tài khoản này đã bị đóng.'
          : sent?.expired
            ? 'Phiên trước đã hết hạn. Đăng nhập lại để quay về đúng chỗ bạn đang làm dở.'
            : undefined
      }
    >
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault()
          if (sending) return
          beginSignIn()
          const result = await signInWithEmail(email, password, remember)
          if (!result.ok) {
            /* Về lại 'khách' qua `clearSession`, KHÔNG qua `signOut`: một form
               đã có kết luận mà máy trạng thái còn kẹt ở 'đang-vào' thì nút khoá
               vĩnh viễn — nhưng ở đây chưa từng có phiên nào để đóng, nên gọi
               `/auth/sign-out` là bắn một request vô nghĩa cho mỗi lần gõ sai
               mật khẩu, đúng vào cửa dễ bị dò nhất của hệ. */
            useSession.getState().clearSession()
            setError(result.error)
            return
          }
          /* Cả người LẪN cửa sổ phiên đều là câu trả lời của máy chủ. Kho chỉ
             soi lại đúng những gì vừa nhận — nó không tự đặt hạn cho phiên. */
          signIn(result.actor, { session: result.session, remember })
          navigate(from, { replace: true })
        }}
        className="flex flex-col gap-5"
      >
        <AuthField
          label="Email"
          htmlFor="email"
          error={error?.field === 'email' ? error.message : undefined}
        >
          <Input
            ref={emailRef}
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder={EMAIL_HINT}
            value={email}
            invalid={error?.field === 'email'}
            onChange={(e) => {
              setEmail(e.target.value)
              setError(null)
            }}
          />
        </AuthField>

        <AuthField
          label="Mật khẩu"
          htmlFor="password"
          error={error?.field === 'password' ? error.message : undefined}
          action={
            <Link
              to="/quen-mat-khau"
              state={{ email }}
              className="motion-std text-muted-foreground hover:text-foreground text-[11.5px] font-semibold"
            >
              Quên mật khẩu?
            </Link>
          }
        >
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="Mật khẩu của bạn"
            value={password}
            invalid={error?.field === 'password'}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(null)
            }}
          />
        </AuthField>

        {/* Không `hint`: hậu quả của ô này (phiên sống qua lần đóng trình duyệt
            hay không) nằm ở tầng dưới — `rememberAware` trong `app/auth/session.ts`.
            Nhãn "trên máy này" đã đủ cho người bấm. */}
        <Checkbox
          checked={remember}
          onChange={setRemember}
          label="Nhớ tôi trên máy này"
          className="-mx-3"
        />

        {/* Lỗi KHÔNG thuộc về ô nào: hết lượt thử, hoặc không nối được máy chủ.
            Treo nó dưới ô mật khẩu thì người dùng đọc thành "mật khẩu sai" và
            ngồi gõ lại một chuỗi vốn đã đúng. Cùng cỡ chữ, cùng token màu với
            lỗi của ô (`AuthField`) để mắt không phải học quy ước thứ hai. */}
        {error?.field === 'form' && (
          <p role="alert" className="text-destructive-foreground m-0 text-[11px] leading-[1.5]">
            {error.message}
          </p>
        )}

        <Button type="submit" size="lg" disabled={sending}>
          {sending ? 'Đang vào…' : 'Đăng nhập'}
        </Button>
      </form>
    </AuthCard>
  )
}

export default SignInPage
