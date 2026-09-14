import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@pv/ui'
import { AuthCard, AuthField, PasswordInput } from '@/components/auth-card'
import { useSession } from '@/app/auth'
import { PASSWORD_MIN, changePassword, type AuthError } from '@/data/auth'

/** Change your own password, from inside a live session.
 *
 *  ------------------------------------------------------------------
 *  ONE SCREEN, TWO WAYS TO ARRIVE
 *  ------------------------------------------------------------------
 *  Voluntarily, from the account menu in the header. Or forced: the account is
 *  holding the default password, and `RequireAccess` put the person here and
 *  lets them go nowhere else until they are done.
 *
 *  One form, differing in exactly two things - the lead sentence, and whether
 *  there is a way back. Split into two screens and there are two copies of one
 *  form to keep in step, while what actually separates the cases is not what
 *  the person does here but whether they may leave, which the guard has already
 *  decided.
 *
 *  ------------------------------------------------------------------
 *  NO "TYPE IT AGAIN" BOX
 *  ------------------------------------------------------------------
 *  Unlike the set-password screen, and the difference is real. A confirm box
 *  guards against a typo where a typo cannot be undone: somebody following a
 *  link in a mail who mistypes has lost their way in and must ask for a new
 *  link. Here the session is alive and the old password is still in their
 *  hands, so a typo costs ten seconds and another visit. A third box for a risk
 *  that no longer exists is just one more box to type into.
 *
 *  ------------------------------------------------------------------
 *  STAY SIGNED IN AFTERWARDS
 *  ------------------------------------------------------------------
 *  The opposite of the set-password screen, because the server treats the two
 *  differently: that door revokes EVERY session, since the reason to reach for
 *  it is that somebody else may be holding one. This door keeps the session
 *  being typed in and kills the rest, so the person is still signed in when it
 *  returns - bouncing them out to retype the string they just chose would be
 *  demanding proof of something the server has just watched happen. */
export function ChangePasswordPage() {
  const navigate = useNavigate()
  const forced = useSession((s) => s.mustChangePassword)
  const clearDebt = useSession((s) => s.clearPasswordDebt)

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<AuthError | null>(null)
  const [busy, setBusy] = useState(false)
  const firstRef = useRef<HTMLInputElement>(null)

  return (
    <AuthCard
      title="Đổi mật khẩu"
      lead={
        forced
          ? 'Tài khoản đang dùng mật khẩu mặc định — mật khẩu này nằm trong mã nguồn nên người khác cũng biết. Đặt mật khẩu của riêng bạn để mở khoá phần còn lại của hệ.'
          : 'Đặt mật khẩu mới. Mọi phiên khác của bạn sẽ bị đăng xuất; phiên đang dùng thì không.'
      }
      /* No way back while forced: a "return" link on the screen a guard has
         just redirected somebody to only leads where they were bounced from. */
      back={forced ? undefined : { to: '/', label: 'Về trang chủ' }}
    >
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault()
          if (busy) return

          setBusy(true)
          const refused = await changePassword(current, next)
          setBusy(false)
          if (refused) return setError(refused)

          /* Drop the flag here rather than wait for the next `/auth/me`: the
             server cleared the mark in the same transaction, and leaving it set
             for one more tick means the guard bounces the person who just
             finished straight back to this screen. */
          clearDebt()
          navigate('/', { replace: true })
        }}
        className="flex flex-col gap-5"
      >
        <AuthField
          label="Mật khẩu hiện tại"
          htmlFor="currentPassword"
          error={error?.field === 'currentPassword' ? error.message : undefined}
        >
          <PasswordInput
            ref={firstRef}
            id="currentPassword"
            autoComplete="current-password"
            placeholder="Mật khẩu bạn vừa đăng nhập"
            value={current}
            invalid={error?.field === 'currentPassword'}
            onChange={(e) => {
              setCurrent(e.target.value)
              setError(null)
            }}
          />
        </AuthField>

        <AuthField
          label="Mật khẩu mới"
          htmlFor="newPassword"
          error={error?.field === 'newPassword' ? error.message : undefined}
        >
          <PasswordInput
            id="newPassword"
            autoComplete="new-password"
            placeholder={`Tối thiểu ${PASSWORD_MIN} ký tự`}
            value={next}
            invalid={error?.field === 'newPassword'}
            onChange={(e) => {
              setNext(e.target.value)
              setError(null)
            }}
          />
        </AuthField>

        {/* Failures that belong to no box: out of attempts, server
            unreachable. Hung under a password field they would send the user
            off to fix a password, when the thing to do is wait or check the
            network. */}
        {error?.field === 'form' && (
          <p role="alert" className="text-destructive-foreground m-0 text-[11px] leading-[1.5]">
            {error.message}
          </p>
        )}

        <Button type="submit" size="lg" disabled={busy}>
          {busy ? 'Đang đổi…' : 'Đổi mật khẩu'}
        </Button>
      </form>
    </AuthCard>
  )
}

export default ChangePasswordPage
