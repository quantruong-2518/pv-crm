import { useEffect, useRef, useState } from 'react'
import { MailCheck } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Icon, Input } from '@pv/ui'
import { AuthCard, AuthField } from '@/components/auth-card'
import { EMAIL_HINT, findActorByEmail, makeResetTicket, type AuthError } from '@/data/auth'

/** Quên mật khẩu — bước 1: xin lại đường vào bằng email.
 *
 *  Một màn, hai trạng thái: form và "đã gửi". Trạng thái thứ hai KHÔNG mở màn
 *  mới, vì nó không phải một bước mới — nó là câu trả lời cho việc vừa làm, và
 *  người dùng phải thấy nó ngay trên chỗ mình vừa gõ.
 *
 *  POC không gửi mail thật, nên có thêm nút mở thẳng link đặt lại. Nút đó khai
 *  rõ mình là đồ giả lập chứ không giả vờ là mail đã tới: một luồng demo nói
 *  dối ở bước giữa thì người xem không tin bước cuối.
 *
 *  Chỗ này KHÁC bản thật ở một điểm nữa, ghi ra để sau không ai tưởng là quên:
 *  báo "không tìm thấy tài khoản" tức là nói cho người ngoài biết email nào có
 *  trong hệ. Đánh đổi có chủ ý ở POC — lý do đầy đủ trong `data/auth.ts`. */
export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()

  /* Người bấm "Quên mật khẩu?" ở màn đăng nhập đã gõ email rồi — bắt gõ lại là
     bắt làm hai lần cùng một việc. */
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '')
  const [error, setError] = useState<AuthError | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const emailRef = useRef<HTMLInputElement>(null)
  useEffect(() => emailRef.current?.focus(), [])

  if (sentTo) {
    return (
      <AuthCard
        title="Đã gửi hướng dẫn"
        lead={
          <>
            Kiểm tra hộp thư <b className="text-foreground font-semibold">{sentTo}</b>. Link đặt lại
            sống trong 30 phút; hết hạn thì xin lại từ đầu.
          </>
        }
        back={{ to: '/dang-nhap', label: 'Về màn đăng nhập' }}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-md bg-white/5 p-4">
            <Icon icon={MailCheck} size={18} className="text-muted-foreground mt-1 shrink-0" />
            <p className="text-muted-foreground m-0 text-pretty text-[12px] leading-[1.65]">
              Bản POC chưa nối máy chủ mail, nên không có thư nào rời khỏi máy này. Nút dưới đây đi
              thẳng tới đúng màn mà link trong mail sẽ mở.
            </p>
          </div>

          <Button
            size="lg"
            onClick={() => navigate(`/dat-lai-mat-khau?token=${makeResetTicket(sentTo)}`)}
          >
            Mở link đặt lại (giả lập)
          </Button>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Quên mật khẩu"
      lead="Nhập email của bạn. Chúng tôi gửi một link đặt lại — không hỏi mật khẩu cũ, vì bạn đang không nhớ nó."
      back={{ to: '/dang-nhap', label: 'Về màn đăng nhập' }}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (!email.trim()) {
            setError({ field: 'email', message: 'Chưa nhập email.' })
            return
          }
          const actor = findActorByEmail(email)
          if (!actor) {
            setError({ field: 'email', message: 'Không tìm thấy tài khoản dùng email này.' })
            return
          }
          setError(null)
          setSentTo(actor.email)
        }}
        className="flex flex-col gap-5"
      >
        <AuthField label="Email" htmlFor="email" error={error?.message}>
          <Input
            ref={emailRef}
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder={EMAIL_HINT}
            value={email}
            invalid={Boolean(error)}
            onChange={(e) => {
              setEmail(e.target.value)
              setError(null)
            }}
          />
        </AuthField>

        <Button type="submit" size="lg">
          Gửi link đặt lại
        </Button>
      </form>
    </AuthCard>
  )
}

export default ForgotPasswordPage
