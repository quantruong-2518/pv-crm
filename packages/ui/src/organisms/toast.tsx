import { useEffect, useRef, useState } from 'react'
import { CircleCheck, CircleX, Info, TriangleAlert, X, type IconGlyph } from '../icons'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** O-08 · Toast — việc đã CHẠY XONG, báo ở góc màn.
 *
 *  ------------------------------------------------------------------
 *  TOAST NÓI GÌ VÀ KHÔNG NÓI GÌ
 *  ------------------------------------------------------------------
 *  Toast dành cho việc người dùng đã bấm chạy, ĐÃ XONG, và họ đang nhìn chỗ
 *  khác. "412 lead đã vào sổ" là toast. Ba thứ KHÔNG phải toast, và để nhầm vào
 *  đây là ba lỗi khác nhau:
 *
 *   · **Lỗi của ô đang gõ** — nó thuộc về ô đó. Toast bay ở góc bắt mắt đi tìm
 *     rồi bắt quay lại, mà lúc quay lại thì ô vẫn không nói gì.
 *   · **Việc đang chạy** — đó là thanh tiến độ ở chỗ người dùng bấm nút.
 *   · **Câu hỏi cần trả lời** — toast tự tắt, nên hỏi ở đây là hỏi rồi bỏ đi.
 *
 *  ------------------------------------------------------------------
 *  TONE `danger` KHÔNG TỰ TẮT
 *  ------------------------------------------------------------------
 *  Ba tone kia là tin vui hoặc tin trung tính: đọc xong là hết việc, để nó tự
 *  đi. `danger` thì ngược lại — nó là thứ người dùng phải LÀM GÌ ĐÓ, và một
 *  thông báo hỏng việc biến mất sau sáu giây là thông báo không ai kịp đọc.
 *  Chỗ này cưỡng chế ở tầng kiểu chứ không nhờ người gọi nhớ: `ttlMs` bị bỏ
 *  qua khi tone là `danger`.
 *
 *  ------------------------------------------------------------------
 *  CHỖ ĐỨNG
 *  ------------------------------------------------------------------
 *  Góc phải dưới, và trên mobile phải né thanh nav dưới (84px) cộng safe-area
 *  (34px) của luật 3 — nếu không thì nút "Xem" nằm đúng dưới nút "Trang chủ".
 *
 *  Host KHÔNG giữ danh sách: nó nhận `items` và trả lại `onDismiss`. Trạng thái
 *  ở tầng app (`app/toast.ts`) vì thông báo sinh ra từ việc của nghiệp vụ, mà
 *  `@pv/ui` thì không biết nghiệp vụ (biên giới package · CLAUDE.md). */
export type ToastTone = 'success' | 'danger' | 'warning' | 'info'

export type ToastItem = {
  id: string
  tone?: ToastTone
  /** Một câu, nói KẾT QUẢ. "412 lead đã vào sổ", không phải "Thành công". */
  title: string
  /** Dòng phụ — phần dư của kết quả: bao nhiêu trùng, bao nhiêu hỏng. */
  detail?: string
  /** Một hành động, không hai. Toast là chỗ báo tin, không phải thanh công cụ. */
  action?: { label: string; onClick: () => void }
  /** Tự tắt sau bao lâu, ms. Bỏ trống = dùng `defaultTtlMs` của host.
   *  Tone `danger` bỏ qua trường này — xem docblock. */
  ttlMs?: number
}

const TONE_ICON: Record<ToastTone, IconGlyph> = {
  success: CircleCheck,
  danger: CircleX,
  warning: TriangleAlert,
  info: Info,
}

/** Màu của hình, không của cả tấm. Tấm giữ mặt `.glass-overlay` chung: bốn tấm
 *  bốn màu nền là bốn mặt kính khác nhau chồng lên nhau ở cùng một góc màn. */
const TONE_ICON_CLASS: Record<ToastTone, string> = {
  success: 'text-success',
  danger: 'text-destructive-foreground',
  warning: 'text-warning',
  info: 'text-accent-foreground',
}

export type ToastProps = {
  item: ToastItem
  onDismiss: (id: string) => void
  defaultTtlMs: number
}

export function Toast({ item, onDismiss, defaultTtlMs }: ToastProps) {
  const tone = item.tone ?? 'info'
  const [leaving, setLeaving] = useState(false)

  /* `onDismiss` đổi định danh mỗi lượt vẽ của cha thì đồng hồ bị đặt lại từ
     đầu, và một toast 6 giây sống mãi trên màn có cha hay vẽ lại. Giữ trong ref
     để đồng hồ chạy đúng một lần. */
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss

  useEffect(() => {
    if (tone === 'danger') return
    const ttl = item.ttlMs ?? defaultTtlMs
    const timer = setTimeout(() => dismiss.current(item.id), ttl)
    return () => clearTimeout(timer)
  }, [item.id, item.ttlMs, tone, defaultTtlMs])

  /* Tắt bằng tay chạy hoạt cảnh đi ra trước khi gỡ; tự hết giờ thì gỡ thẳng.
     Lý do khác nhau: bấm tắt là người dùng đang NHÌN vào tấm đó, nên nó biến
     mất đánh phụt là mất mạch; hết giờ thì họ đã nhìn chỗ khác từ lâu. */
  const close = () => {
    setLeaving(true)
    setTimeout(() => dismiss.current(item.id), 180)
  }

  return (
    <div
      className={cn(
        'glass-overlay pointer-events-auto flex w-[min(360px,calc(100vw-32px))] items-start gap-3 rounded-lg p-4',
        leaving ? 'animate-drawer-out' : 'animate-drawer-in',
      )}
    >
      <Icon icon={TONE_ICON[tone]} size={18} className={cn('mt-1', TONE_ICON_CLASS[tone])} />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-[12.5px] font-semibold leading-[1.5]">{item.title}</p>
        {item.detail && (
          <p className="text-glass-foreground text-[11.5px] leading-[1.7]">{item.detail}</p>
        )}
        {item.action && (
          <div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                item.action?.onClick()
                close()
              }}
            >
              {item.action.label}
            </Button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={close}
        aria-label="Đóng thông báo"
        className="motion-std text-muted-foreground hover:text-foreground hover:bg-white/9 -mr-1 shrink-0 rounded-sm p-1"
      >
        <Icon icon={X} size={16} />
      </button>
    </div>
  )
}

export type ToastHostProps = {
  items: ToastItem[]
  onDismiss: (id: string) => void
  /** Mặc định 6 giây — đủ đọc một câu mười chữ hai lần. */
  defaultTtlMs?: number
  className?: string
}

export function ToastHost({ items, onDismiss, defaultTtlMs = 6_000, className }: ToastHostProps) {
  if (items.length === 0) return null

  return (
    /* `aria-live="polite"` chứ không `assertive`: toast báo việc đã xong, nó
       không được cắt ngang câu trình đọc màn hình đang đọc dở.

       `pointer-events-none` ở khung ngoài, bật lại ở từng tấm — khung phủ một
       góc màn, và một vùng vô hình nuốt cú bấm là lỗi không ai chẩn ra được. */
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-none fixed right-4 z-[60] flex flex-col gap-3',
        'bottom-[118px] lg:bottom-6',
        className,
      )}
    >
      {items.map((item) => (
        <Toast key={item.id} item={item} onDismiss={onDismiss} defaultTtlMs={defaultTtlMs} />
      ))}
    </div>
  )
}
