import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from '../icons'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** T-04 · Drawer — panel phải đè lên màn, có tấm che phía sau.
 *
 *  Cùng hình dạng với màn 04 · Trợ lý AI (docs/luat-thiet-ke.md §7: panel phải,
 *  scrim `--scrim`), nên chi tiết một dòng của bảng dùng lại đúng ngôn ngữ đó
 *  thay vì đẻ ra kiểu thứ hai.
 *
 *  Vì sao là panel chứ không phải mở sang màn khác: danh sách là chỗ SO SÁNH
 *  người này với người kia. Điều hướng sang màn riêng thì mất bảng, và người
 *  dùng phải nhớ mình vừa xem ai. Panel giữ bảng ở nguyên chỗ.
 *
 *  Dưới `sm` panel chiếm cả bề ngang: 560px trên màn 390px là panel bị cắt.
 *
 *  Không render gì khi đóng — panel đóng vẫn nằm trong cây DOM thì trình đọc
 *  màn hình vẫn đọc thấy nội dung của nó. Ngoại lệ duy nhất là quãng panel
 *  đang TRƯỢT RA: nó phải còn trong DOM thì mới có gì để chạy hoạt cảnh. */
export type DrawerProps = {
  open: boolean
  onClose: () => void
  title: ReactNode
  /** dòng dưới tiêu đề — kỳ đang xem, vai, mã */
  subtitle?: ReactNode
  /** khối bên phải tiêu đề, trước nút đóng — badge trạng thái */
  meta?: ReactNode
  /** dải dính đáy panel */
  footer?: ReactNode
  /** md = 560px · lg = 760px (chi tiết có bảng bên trong) */
  width?: 'md' | 'lg'
  closeLabel?: string
  children: ReactNode
  className?: string
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  meta,
  footer,
  width = 'md',
  closeLabel = 'Đóng',
  children,
  className,
}: DrawerProps) {
  const panel = useRef<HTMLDivElement>(null)

  /** Panel còn trong DOM hay không, và nó đang đi ra hay đi vào.
   *
   *  `open` tắt KHÔNG gỡ panel ngay: gỡ ngay thì không còn gì để chạy hoạt
   *  cảnh đi ra, panel biến mất đánh phụt. Giữ lại tới lúc hoạt cảnh chạy xong
   *  rồi mới gỡ.
   *
   *  Mốc gỡ là `animationend` chứ không phải một `setTimeout` 180ms: hằng số
   *  đó đã nằm trong `--motion-duration`, chép nó sang JS là hai chỗ phải nhớ
   *  sửa cùng nhau. */
  const [mounted, setMounted] = useState(open)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      setLeaving(false)
      return
    }
    if (!mounted) return

    /* Người tắt hoạt cảnh trong hệ điều hành thì `animationend` KHÔNG bao giờ
       bắn (globals.css đặt `animation: none !important`), nên panel sẽ mắc lại
       vĩnh viễn. Gỡ thẳng. */
    const reduced =
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setMounted(false)
      return
    }
    setLeaving(true)
  }, [open, mounted])

  useEffect(() => {
    if (!mounted || leaving) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    /* Đưa tiêu điểm vào panel: mở bằng bàn phím từ một dòng bảng thì tiêu điểm
       còn ở dòng đó, và Tab tiếp theo sẽ đi vào phần bị tấm che phủ. */
    panel.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [mounted, leaving, onClose])

  /* Drawer phải là lớp tương tác duy nhất khi đang mở. Khóa cuộn nền để bánh
     xe/trackpad không làm trang phía sau trôi khỏi vị trí trong lúc người dùng
     đang đọc một phiếu dài. Trả lại đúng giá trị cũ khi panel được gỡ. */
  useEffect(() => {
    if (!mounted) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [mounted])

  if (!mounted || typeof document === 'undefined') return null

  return createPortal(
    /* z-50 — PHẢI cao hơn nav (z-40 ở AppShell). Drawer từng là z-20 vì hồi
       nav còn là cột dọc thì không có gì tranh tầng với nó; nav hai tầng dán
       đỉnh có z-index thật, nên z-20 làm nav chọc thủng cả tấm che lẫn panel.
       Thang tầng của app: nav 40 · drawer 50. */
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className={cn(
          'absolute inset-0 cursor-default bg-[var(--scrim)]',
          leaving ? 'animate-scrim-out' : 'animate-scrim-in',
        )}
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        /* Chỉ nghe hoạt cảnh của CHÍNH panel: `animationend` nổi bọt, nên một
           shimmer của Skeleton bên trong cũng sẽ gỡ mất panel giữa chừng. */
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && leaving) setMounted(false)
        }}
        className={cn(
          /* `glass-overlay`, KHÔNG `glass-b`: panel này đè lên trang, mà
             `glass-b` để lọt 16% nền — dưới nó lại là tấm scrim tối 52%, nên
             chữ trong panel đọc trên một lớp bùn và cả drawer trông như bị
             làm mờ. Thứ nổi lên trên thì phải che được thứ ở dưới. */
          'glass-overlay relative flex h-dvh w-full flex-col outline-none',
          width === 'lg' ? 'sm:w-[760px]' : 'sm:w-[560px]',
          leaving ? 'animate-drawer-out' : 'animate-drawer-in',
          className,
        )}
      >
        <header className="flex items-start gap-3 px-5 pb-4 pt-5 lg:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="font-display m-0 text-[16px] font-semibold">{title}</h2>
            {subtitle && (
              <p className="text-muted-foreground m-0 mt-1 text-[11.5px] leading-[1.5]">
                {subtitle}
              </p>
            )}
          </div>
          {meta}
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="motion-std hover:bg-white/16 bg-white/9 -mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-md"
          >
            <Icon icon={X} size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 lg:px-6">{children}</div>

        {footer && <div className="bg-black/20 px-5 py-4 lg:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
