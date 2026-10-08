import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'

/** A-24 · InfoTip - a small box with an arrow that opens on hover or focus.
 *
 *  A portal, because the tables it sits in clip overflow. It opens above the
 *  trigger and flips below when the viewport has no room, and the arrow keeps
 *  pointing at the trigger either way. The trigger is a plain wrapper: put the
 *  focusable thing (or nothing, for a read-only avatar) inside. */
export type InfoTipProps = {
  content: ReactNode
  children: ReactNode
  className?: string
}

const GAP = 10
const BOX_WIDTH = 224

export function InfoTip({ content, children, className }: InfoTipProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ style: CSSProperties; below: boolean; arrowX: number } | null>(
    null,
  )
  const trigger = useRef<HTMLSpanElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const id = useId()

  useLayoutEffect(() => {
    if (!open || !trigger.current) return
    const r = trigger.current.getBoundingClientRect()
    const h = box.current?.offsetHeight ?? 0
    const below = r.top < h + GAP + 8
    const center = r.left + r.width / 2
    const left = Math.max(8, Math.min(center - BOX_WIDTH / 2, window.innerWidth - BOX_WIDTH - 8))
    setPos({
      below,
      arrowX: center - left,
      style: { left, width: BOX_WIDTH, top: below ? r.bottom + GAP : r.top - GAP - h },
    })
  }, [open, content])

  const show = () => setOpen(true)
  const hide = () => {
    setOpen(false)
    setPos(null)
  }

  return (
    <span
      ref={trigger}
      aria-describedby={open ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className={cn('inline-flex', className)}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={box}
            id={id}
            role="tooltip"
            style={pos?.style ?? { visibility: 'hidden', width: BOX_WIDTH }}
            className="glass-overlay shadow-panel pointer-events-none fixed z-[100] flex flex-col gap-1 rounded-lg px-3 py-2 text-[12px]"
          >
            {content}
            {pos && (
              <span
                aria-hidden
                style={{ left: pos.arrowX - 5 }}
                className={cn(
                  'bg-popover absolute size-[10px] rotate-45',
                  pos.below ? '-top-[5px]' : '-bottom-[5px]',
                )}
              />
            )}
          </div>,
          document.body,
        )}
    </span>
  )
}
