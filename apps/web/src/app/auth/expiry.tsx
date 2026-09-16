import { useEffect, useState } from 'react'
import { X } from '@pv/ui'
import { Button, GlassCard, Icon } from '@pv/ui'
import { useExpiryWarning } from './lifecycle'
import { renewSession } from './renew'
import { useSession } from './session'

/** DẢI BÁO TRƯỚC khi phiên chết. Một khối, không còn hai.
 *
 *  ------------------------------------------------------------------
 *  LỚP KHOÁ TẠI CHỖ ĐÃ BỊ GỠ, VÀ ĐÂY LÀ THỨ THAY NÓ
 *  ------------------------------------------------------------------
 *  File này từng giữ thêm `SessionLocked`: phiên chết giữa chừng thì màn cũ ở
 *  lại sau một lớp mờ và người dùng gõ mật khẩu ngay tại đó. Nay hết phiên là
 *  đá thẳng về `/sign-in`, và `RequireAccess` mang theo đường đang đứng để
 *  đăng nhập xong quay lại đúng chỗ.
 *
 *  Đánh đổi thật, nói thẳng: phiếu đang gõ dở MẤT, vì cây React của màn cũ bị
 *  tháo. Lớp khoá giữ được nó, nhưng đổi lại phải để nguyên dữ liệu của người
 *  trước nằm trên màn sau một lớp mờ — trên đúng cái máy vừa bị bỏ trống, tức
 *  là đúng tình huống mà hết phiên vì ngồi không sinh ra để xử. Giữa "mất phần
 *  chưa lưu" và "còn hiện trên màn của người ngồi sau", chọn cái thứ nhất.
 *
 *  Cái dải này vì thế quan trọng hơn trước: hai phút cảnh báo nay là cơ hội duy
 *  nhất để người dùng bấm lưu trước khi bị đá ra. Nút "Gia hạn phiên" trên dải
 *  là đường tránh, và nó chỉ hiện khi gia hạn được thật.
 *
 *  Thang tầng của app: nav 40 · drawer 50 · **dải cảnh báo 55 · hộp xác nhận
 *  mật khẩu 60** (`reauth.tsx`). Dải phải trên drawer, không thì phiên sắp hết
 *  mà panel đang mở là không ai thấy gì. */

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
            className="motion-std text-muted-foreground hover:text-foreground hover:bg-surface-ink/9 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-md"
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
