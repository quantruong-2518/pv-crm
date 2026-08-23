import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@pv/ui'
import { AuthCard, AuthField, PasswordInput } from '@/components/auth-card'
import { MIN_PASSWORD, checkNewPassword, readResetTicket, type AuthError } from '@/data/auth'
import { useSession } from '@/app/session'

/** Quên mật khẩu — bước 2: đặt mật khẩu mới rồi vào thẳng.
 *
 *  Người tới đây qua link trong mail, nên vé nằm trên URL (`?token=`) chứ không
 *  trong bộ nhớ React — mở link ở tab khác, máy khác, sau khi tắt trình duyệt
 *  đều phải chạy.
 *
 *  Đặt xong thì VÀO LUÔN, không đá về màn đăng nhập. Người vừa gõ mật khẩu mới
 *  hai lần mà còn bị bắt gõ lần thứ ba là bắt chứng minh một việc hệ vừa tận
 *  mắt nhìn thấy.
 *
 *  POC không lưu mật khẩu ở đâu (xem `data/auth.ts`), nên "đặt lại" ở đây chỉ
 *  đi hết vòng giao diện. Khi có backend, chỗ cần đổi là một lời gọi trước
 *  `signIn`, không phải bố cục màn. */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const signIn = useSession((s) => s.signIn)

  const actor = readResetTicket(params.get('token'))

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<AuthError | null>(null)

  const firstRef = useRef<HTMLInputElement>(null)
  useEffect(() => firstRef.current?.focus(), [])

  if (!actor) {
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
          Cho tài khoản <b className="text-foreground font-semibold">{actor.email}</b>. Tối thiểu{' '}
          {MIN_PASSWORD} ký tự — đặt xong là vào thẳng, không phải đăng nhập lại.
        </>
      }
      back={{ to: '/dang-nhap', label: 'Về màn đăng nhập' }}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          const wrong = checkNewPassword(password, confirm)
          setError(wrong)
          if (wrong) return
          /* Vào bằng phiên KHÔNG nhớ: người đi qua link trong mail rất hay đang
             ngồi máy lạ. Muốn nhớ thì tick ở màn đăng nhập lần sau. */
          signIn(actor, { remember: false })
          navigate('/', { replace: true })
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
            placeholder={`Tối thiểu ${MIN_PASSWORD} ký tự`}
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

        <Button type="submit" size="lg">
          Đặt lại và vào
        </Button>
      </form>
    </AuthCard>
  )
}

export default ResetPasswordPage
