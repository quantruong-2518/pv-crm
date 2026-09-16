import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button, Checkbox, Input } from '@pv/ui'
import { AuthCard, AuthField, PasswordInput } from '@/components/auth-card'
import { EMAIL_HINT, signInWithEmail, type AuthError } from '@/data/auth'
import { CHANGE_PASSWORD_PATH, useSession, type ExpiryReason } from '@/app/auth'

/** Màn đăng nhập — cửa vào của PV One.
 *
 *  Trước 23/08 đây là màn CHỌN VAI: bấm một cái tên là vào, không mật khẩu.
 *  Đổi thành form email + mật khẩu vì đây là màn đầu tiên khách nhìn thấy, và
 *  một hệ ERP không hỏi mật khẩu thì không ai tin phần còn lại của nó.
 *
 *  Bảng chọn vai đã BỎ HẲN, không lùi xuống chân card. Đổi vai vẫn làm được và
 *  vẫn cần được (docs/design-system/screens.md — TP Kinh doanh nhìn khác Giám đốc),
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
/** Why the previous session died — three sentences, not one.
 *
 *  The three reasons send the reader three ways: sitting idle is "lock your
 *  screen next time", end of shift is "normal, carry on", and revoked is
 *  "somebody just closed your session" — the only one worth stopping to ask
 *  about. Collapsing all three into one generic expiry line loses exactly that
 *  third sentence.
 *
 *  It lives here rather than in `expiry.tsx` because this screen is now the
 *  only place that shows it: since expiry started bouncing people straight
 *  here, there is no lock overlay left to say it for us. An unrecognised reason
 *  falls back to the generic line below — navigation state is outside data and
 *  can be typed by hand.
 *
 *  All three promise the PAGE and never the work. The old lock overlay could
 *  honestly say "carry on where you left off" because the screen stayed mounted
 *  behind it; bouncing to this screen unmounts it, so anything half-typed is
 *  gone and only the route comes back. Promising more here would make the
 *  system look broken at the exact moment the user trusts it least. */
const WHY: Record<ExpiryReason, string> = {
  'ngồi-không':
    'Máy để không quá lâu nên phiên tự đóng. Đăng nhập lại để mở lại trang bạn đang xem.',
  'hết-ca': 'Hết một ca làm việc. Đăng nhập lại để mở lại trang bạn đang xem.',
  'bị-thu-hồi': 'Phiên đã bị đóng. Đăng nhập lại nếu người ngồi đây vẫn là bạn.',
}

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
    reason?: ExpiryReason
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

  /* Đã có phiên mà vẫn vào màn này (gõ tay `/sign-in`, hoặc tab khác vừa đăng
     nhập hộ) thì đi tiếp, đừng bắt đăng nhập lần hai. */
  if (status === 'signed-in') return <Navigate to={from} replace />

  const sending = status === 'signing-in'

  return (
    <AuthCard
      title="Đăng nhập"
      lead={
        sent?.reset
          ? 'Mật khẩu đã đổi. Đăng nhập lại bằng mật khẩu mới — mọi phiên cũ của tài khoản này đã bị đóng.'
          : sent?.expired
            ? (sent.reason && WHY[sent.reason]) ||
              'Phiên trước đã hết hạn. Đăng nhập lại để mở lại trang bạn đang xem.'
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
            /* Về lại 'guest' qua `clearSession`, KHÔNG qua `signOut`: một form
               đã có kết luận mà máy trạng thái còn kẹt ở 'signing-in' thì nút khoá
               vĩnh viễn — nhưng ở đây chưa từng có phiên nào để đóng, nên gọi
               `/auth/sign-out` là bắn một request vô nghĩa cho mỗi lần gõ sai
               mật khẩu, đúng vào cửa dễ bị dò nhất của hệ. */
            useSession.getState().clearSession()
            setError(result.error)
            return
          }
          /* Cả người LẪN cửa sổ phiên đều là câu trả lời của máy chủ. Kho chỉ
             soi lại đúng những gì vừa nhận — nó không tự đặt hạn cho phiên. */
          signIn(result.actor, {
            session: result.session,
            remember,
            mustChangePassword: result.mustChangePassword,
          })
          /* `from` is the page they were heading for before being bounced out.
             Skipped while a password change is owed: `RequireAccess` would
             bounce them onward anyway, and a flash of the old page on the way
             says nothing to anybody. */
          navigate(result.mustChangePassword ? CHANGE_PASSWORD_PATH : from, { replace: true })
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
              to="/forgot-password"
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
          label="Ghi nhớ đăng nhập"
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
