import { useEffect, useRef, useState } from 'react'
import { Button } from '@pv/ui'
import { AuthCard, AuthField, PasswordInput } from '@/components/auth-card'
import { confirmPassword, type AuthError } from '@/data/auth'
import { useReauthPrompt } from './reauth'
import { useSession } from './session'

/** The box itself, and the ONLY export of this file — `react-refresh` wants a
 *  module to export components or values, never both, which is why `askReauth`
 *  and the store live in `reauth.ts` next door. Same split, same reason, as
 *  `can.ts` beside `guard.tsx`.
 *
 *  Named `reauth-dialog` and not `reauth.tsx`: a `.ts` and a `.tsx` of the same
 *  stem both answer to `'./reauth'`, TypeScript picks the `.ts`, and the import
 *  fails on a name that is plainly right there.
 *
 *  Mounted once in `RequireAccess`, beside the expiry banner. Renders nothing
 *  while nobody is asking, so the idle cost is one store read. */
export function ReauthDialog() {
  const settle = useReauthPrompt((s) => s.settle)
  const actor = useSession((s) => s.actor)

  const [password, setPassword] = useState('')
  const [error, setError] = useState<AuthError | null>(null)
  const [busy, setBusy] = useState(false)

  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (settle) ref.current?.focus()
  }, [settle])

  if (!settle || !actor) return null

  /* Clear the password BEFORE answering, not after: `settle` makes the box
     vanish on the next render, and a password left in the state of an unmounted
     component is a string nobody is left to clear. */
  const finish = (ok: boolean) => {
    setPassword('')
    setError(null)
    setBusy(false)
    settle(ok)
  }

  return (
    <div
      className="fixed inset-0 z-[60] overflow-auto bg-[var(--scrim)]"
      role="dialog"
      aria-modal="true"
      aria-label="Xác nhận mật khẩu"
    >
      <AuthCard
        title="Xác nhận mật khẩu"
        lead="Thao tác này thay đổi quyền vào hệ thống. Gõ lại mật khẩu để xác nhận đúng là bạn."
      >
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault()
            if (busy) return
            setBusy(true)
            const failed = await confirmPassword(password)
            if (failed) {
              setBusy(false)
              return setError(failed)
            }
            finish(true)
          }}
          className="flex flex-col gap-5"
        >
          <AuthField
            label={`${actor.name} · ${actor.email}`}
            htmlFor="reauth-password"
            error={error?.message}
          >
            <PasswordInput
              ref={ref}
              id="reauth-password"
              autoComplete="current-password"
              placeholder="Mật khẩu của bạn"
              value={password}
              invalid={Boolean(error)}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
              }}
            />
          </AuthField>

          <Button type="submit" size="lg" disabled={busy}>
            {busy ? 'Đang xác nhận…' : 'Xác nhận'}
          </Button>

          {/* Same `lg` as the button above: two full-width buttons stacked in
              one card are a single control stack, and a stack that steps down in
              height reads as a hierarchy this card does not have. Cancelling is
              a real choice here. */}
          <Button type="button" variant="ghost" size="lg" onClick={() => finish(false)}>
            Huỷ
          </Button>
        </form>
      </AuthCard>
    </div>
  )
}
