import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from '../icons'
import { cn } from '../lib/cn'
import { Icon } from '../ui/icon'

/** T-07 · Modal — phiếu rộng cần nhìn trọn vẹn nhiều phần cùng lúc.
 *
 * Drawer giữ ngữ cảnh của một dòng bảng ở cạnh phải. Modal dành cho một tác vụ
 * độc lập có nhiều phần phải kiểm cùng nhau trước khi xác nhận, như nội dung,
 * lịch và người nhận của một lượt gửi mail. Cả hai dùng cùng scrim, nhịp chuyển
 * động và hành vi bàn phím để đây không trở thành một hệ hộp thoại thứ hai. */
export type ModalProps = {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  footer?: ReactNode
  width?: 'lg' | 'xl'
  closeLabel?: string
  children: ReactNode
  className?: string
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  meta,
  footer,
  width = 'lg',
  closeLabel = 'Đóng',
  children,
  className,
}: ModalProps) {
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(open)
  const [leaving, setLeaving] = useState(false)

  const shown = useRef({ title, subtitle, meta, footer, children })
  if (open) shown.current = { title, subtitle, meta, footer, children }
  const view = leaving ? shown.current : { title, subtitle, meta, footer, children }

  useEffect(() => {
    if (open) {
      setMounted(true)
      setLeaving(false)
      return
    }
    if (!mounted) return

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
    const active = document.activeElement
    if (active instanceof HTMLElement && !panel.current?.contains(active)) opener.current = active

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [mounted, leaving, onClose])

  useEffect(() => {
    if (mounted) return
    const back = opener.current
    opener.current = null
    if (back?.isConnected) back.focus({ preventScroll: true })
  }, [mounted])

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6">
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
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && leaving) setMounted(false)
        }}
        className={cn(
          'glass-overlay relative flex h-dvh w-full flex-col overflow-hidden outline-none sm:h-[min(820px,calc(100dvh-48px))] sm:rounded-lg',
          width === 'xl' ? 'sm:max-w-[1120px]' : 'sm:max-w-[920px]',
          leaving ? 'animate-scrim-out' : 'animate-scrim-in',
          className,
        )}
      >
        <header className="flex items-start gap-3 px-5 pb-4 pt-5 lg:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="font-display m-0 text-[18px] font-semibold">{view.title}</h2>
            {view.subtitle && (
              <p className="text-muted-foreground m-0 mt-1 text-[11.5px] leading-[1.5]">
                {view.subtitle}
              </p>
            )}
          </div>
          {view.meta}
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="motion-std hover:bg-white/16 bg-white/9 -mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-md"
          >
            <Icon icon={X} size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 lg:px-6">{view.children}</div>

        {view.footer && <div className="bg-black/20 px-5 py-4 lg:px-6">{view.footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
