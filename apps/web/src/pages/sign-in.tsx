import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button, Checkbox, Input } from '@pv/ui'
import { AuthCard, AuthField, PasswordInput } from '@/components/auth-card'
import { EMAIL_HINT, checkSignIn, findActorByEmail, type AuthError } from '@/data/auth'
import { useSession } from '@/app/session'

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
 *  Email của bảy vai nằm trong fixture `das-vina` (`actors[].email`) — chỗ tra
 *  khi demo, không phải một nút trên màn.
 *
 *  Kịch bản: DAS Vina. Luật mật khẩu ở `data/auth.ts`, không nằm trong màn. */
export function SignInPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const signIn = useSession((s) => s.signIn)
  const remembered = useSession((s) => s.remember)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(remembered)
  const [error, setError] = useState<AuthError | null>(null)

  const emailRef = useRef<HTMLInputElement>(null)
  useEffect(() => emailRef.current?.focus(), [])

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  return (
    <AuthCard title="Đăng nhập">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          const wrong = checkSignIn(email, password)
          setError(wrong)
          if (wrong) return
          /* `checkSignIn` đã xác nhận email có người — nhưng nó trả LỖI chứ
             không trả người, nên phải tra lại. Hai hàm tách nhau vì màn quên
             mật khẩu cần tra người mà không cần kiểm mật khẩu. */
          const actor = findActorByEmail(email)
          if (!actor) return
          signIn(actor, { remember })
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
            hay không) nằm ở tầng dưới — `rememberAware` trong `app/session.ts`.
            Nhãn "trên máy này" đã đủ cho người bấm. */}
        <Checkbox
          checked={remember}
          onChange={setRemember}
          label="Nhớ tôi trên máy này"
          className="-mx-3"
        />

        <Button type="submit" size="lg">
          Đăng nhập
        </Button>
      </form>
    </AuthCard>
  )
}

export default SignInPage
