import { useEffect, useRef, useState } from 'react'
import { X } from '@pv/ui'
import { useNavigate } from 'react-router-dom'
import { Button, GlassCard, Icon } from '@pv/ui'
import { AuthCard, AuthField, PasswordInput } from '@/components/auth-card'
import { signInWithEmail, type AuthError } from '@/data/auth'
import { useExpiryWarning } from './lifecycle'
import { renewSession } from './renew'
import { useSession, type ExpiryReason } from './session'

/** Hai khối của việc phiên chết: DẢI báo trước, và LỚP KHOÁ khi đã muộn.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO KHOÁ TẠI CHỖ CHỨ KHÔNG ĐÁ VỀ MÀN ĐĂNG NHẬP
 *  ------------------------------------------------------------------
 *  Người mất phiên hiếm khi đang ngồi không: họ vừa quay lại sau một cuộc họp,
 *  giữa chừng một phiếu đổi cơ hội điền dở. Điều hướng sang `/dang-nhap` tháo cả
 *  cây React của màn đó, và mọi thứ họ đã gõ đi theo — hệ thống tự xoá việc của
 *  người dùng để bảo vệ chính người dùng.
 *
 *  Lớp khoá giữ nguyên cây: màn cũ vẫn nằm dưới, chỉ mờ và không bấm được. Đăng
 *  nhập xong là nó sống lại nguyên trạng, không cần tải lại, không cần nhớ mình
 *  đang ở đâu.
 *
 *  Đổi lại phải chấp nhận một điều và nói thẳng ra: dữ liệu cũ VẪN nằm trên màn
 *  sau lớp mờ. Vì thế lớp mờ phải đủ mạnh để không đọc được chữ, và toàn bộ
 *  phần dưới bị `inert` — không tiêu điểm, không Tab vào được, không chọn để
 *  copy được. Ai muốn thật sự dọn màn thì bấm "Đăng xuất", và đó mới là nút xoá
 *  sạch cả cache (`app/query-client.ts`).
 *
 *  Thang tầng của app: nav 40 · drawer 50 · **dải cảnh báo 55 · lớp khoá 60**.
 *  Dải phải trên drawer, không thì phiên sắp hết mà panel đang mở là không ai
 *  thấy gì; lớp khoá phải trên tất cả, vì nó là thứ duy nhất còn bấm được. */

const WHY: Record<ExpiryReason, string> = {
  'ngồi-không': 'Máy để không quá lâu nên phiên tự đóng. Việc bạn đang làm vẫn còn nguyên.',
  'hết-ca': 'Hết một ca làm việc. Đăng nhập lại để làm tiếp đúng chỗ đang dở.',
  'bị-thu-hồi': 'Phiên đã bị đóng. Đăng nhập lại nếu người ngồi đây vẫn là bạn.',
}

/** Đếm ngược mm:ss. */
function countdown(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${`${total % 60}`.padStart(2, '0')}`
}

/** Dải "phiên sắp hết" — góc dưới phải, nổi trên màn.
 *
 *  Nổi chứ không phải một dải ngang trên đầu: dải ngang đẩy toàn bộ nội dung
 *  chín màn xuống vài chục pixel đúng vào lúc người dùng đang nhắm vào một cái
 *  nút. Cảnh báo không được tự nó gây ra một cú bấm nhầm.
 *
 *  Nút "Gia hạn" chỉ hiện khi gia hạn được THẬT. Với hạn tuyệt đối thì không
 *  còn gì để xin — bày một cái nút bấm vào là mất phiên ngay thì thà không bày,
 *  chỉ nói cho họ biết còn bao lâu mà lưu việc lại. */
export function ExpiryWarning() {
  const deadline = useExpiryWarning((s) => s.deadline)
  const ticket = useSession((s) => s.ticket)
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (deadline === null) return
    /* Nhịp một giây CHỈ chạy trong cửa sổ cảnh báo (hai phút cuối), không chạy
       suốt phiên — đồng hồ hết hạn thật là một `setTimeout` ở `lifecycle.ts`. */
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [deadline])

  if (deadline === null || dismissed === deadline) return null

  const renewable = ticket !== null && ticket.idleUntil !== null && deadline === ticket.idleUntil

  return (
    <div className="fixed bottom-6 right-6 z-[55]" role="status">
      <GlassCard className="flex max-w-[320px] flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="m-0 text-[12.5px] font-semibold">
              Phiên hết sau {countdown(deadline - now)}
            </p>
            <p className="text-muted-foreground m-0 text-[11.5px] leading-[1.5]">
              {renewable
                ? 'Không thao tác thì hệ tự đóng phiên trên máy này.'
                : 'Hết ca làm việc — lưu lại việc đang dở trước khi phải đăng nhập lại.'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Ẩn nhắc này"
            onClick={() => setDismissed(deadline)}
            className="motion-std text-muted-foreground hover:text-foreground hover:bg-white/9 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-md"
          >
            <Icon icon={X} size={14} />
          </button>
        </div>
        {renewable && (
          <Button size="sm" onClick={() => void renewSession()}>
            Gia hạn phiên
          </Button>
        )}
      </GlassCard>
    </div>
  )
}

/** Lớp khoá — đăng nhập lại tại chỗ.
 *
 *  Ô email KHÔNG có mặt, và đó là chủ ý: đây là cửa mở lại phiên của ĐÚNG người
 *  đang kẹt, không phải cửa đổi vai. Cho gõ email khác ở đây thì người mới đăng
 *  nhập vào và thừa hưởng nguyên màn của người cũ — kể cả phiếu điền dở. Muốn
 *  sang vai khác thì "Đăng xuất", và đường đó dọn sạch mọi thứ. */
export function SessionLocked() {
  const navigate = useNavigate()
  const actor = useSession((s) => s.actor)
  const expiredBy = useSession((s) => s.expiredBy)
  const signIn = useSession((s) => s.signIn)
  const signOut = useSession((s) => s.signOut)

  const [password, setPassword] = useState('')
  const [error, setError] = useState<AuthError | null>(null)
  /* Trạng thái gửi giữ CỤC BỘ, không dùng `beginSignIn`: máy trạng thái chuyển
     sang 'đang-vào' sẽ làm chính lớp khoá này biến mất giữa chừng, để lộ màn cũ
     trong đúng khoảnh khắc phiên vẫn đang chết. */
  const [busy, setBusy] = useState(false)

  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])

  if (!actor) return null

  return (
    <div
      className="fixed inset-0 z-[60] overflow-auto bg-[var(--scrim)]"
      role="dialog"
      aria-modal="true"
      aria-label="Phiên đã hết hạn"
    >
      <AuthCard title="Phiên đã hết hạn" lead={expiredBy ? WHY[expiredBy] : undefined}>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault()
            if (busy) return
            setBusy(true)
            const result = await signInWithEmail(actor.email, password)
            setBusy(false)
            if (!result.ok) return setError(result.error)
            setPassword('')
            signIn(result.actor)
          }}
          className="flex flex-col gap-5"
        >
          <AuthField
            label={`${actor.name} · ${actor.email}`}
            htmlFor="lock-password"
            error={error?.message}
          >
            <PasswordInput
              ref={ref}
              id="lock-password"
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
            {busy ? 'Đang vào…' : 'Vào lại'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              signOut()
              navigate('/dang-nhap', { replace: true })
            }}
          >
            Đăng xuất và đổi vai
          </Button>
        </form>
      </AuthCard>
    </div>
  )
}
