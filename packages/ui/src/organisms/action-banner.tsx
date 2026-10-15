import { useRef, useState } from 'react'
import { TriangleAlert, X } from '../icons'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** O-09 · ActionBanner — something that needs doing NOW, not something
 *  already done.
 *
 *  Differs from Toast (O-08) two ways: it stands in the MIDDLE of the screen
 *  bottom, not a corner, and it NEVER auto-dismisses — Toast's own docblock
 *  says "a question needing an answer" is not its job; this is that spot.
 *  Always exactly one action: the banner waits for a press, it never
 *  navigates on its own.
 *
 *  Host does not keep a list, same as Toast: it takes `items`, hands back
 *  `onDismiss`. */
export type ActionBannerItem = {
  id: string
  /** One sentence, naming the fact. "Installment 2 of HD-0042 is overdue". */
  title: string
  /** Secondary line — amount, due date. */
  detail?: string
  action: { label: string; onClick: () => void }
}

export type ActionBannerProps = {
  item: ActionBannerItem
  onDismiss: (id: string) => void
}

export function ActionBanner({ item, onDismiss }: ActionBannerProps) {
  const [leaving, setLeaving] = useState(false)
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss

  const close = () => {
    setLeaving(true)
    setTimeout(() => dismiss.current(item.id), 180)
  }

  return (
    <div
      className={cn(
        'glass-overlay pointer-events-auto flex w-[min(420px,calc(100vw-32px))] items-start gap-3 rounded-lg p-4',
        leaving ? 'animate-drawer-out' : 'animate-drawer-in',
      )}
    >
      <Icon icon={TriangleAlert} size={18} className="text-warning mt-1" />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-[12.5px] font-semibold leading-[1.5]">{item.title}</p>
        {item.detail && (
          <p className="text-glass-foreground text-[11.5px] leading-[1.7]">{item.detail}</p>
        )}
        <div>
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:min-h-12"
            onClick={() => {
              item.action.onClick()
              close()
            }}
          >
            {item.action.label}
          </Button>
        </div>
      </div>

      <button
        type="button"
        onClick={close}
        aria-label="Đóng nhắc việc"
        className="motion-std text-muted-foreground hover:text-foreground hover:bg-surface-ink/9 pointer-coarse:size-12 -mr-1 flex shrink-0 items-center justify-center rounded-md p-1"
      >
        <Icon icon={X} size={16} />
      </button>
    </div>
  )
}

export type ActionBannerHostProps = {
  items: ActionBannerItem[]
  onDismiss: (id: string) => void
  className?: string
}

export function ActionBannerHost({ items, onDismiss, className }: ActionBannerHostProps) {
  if (items.length === 0) return null

  return (
    /* `role="alert"`, not `status`+`aria-live="assertive"` (the two disagree).
       Sits above Toast's own slot (`toast.tsx`) so the two never share a row.
       `z-[45]`: above the bottom nav (40), below a Modal/Drawer overlay (50). */
    <div
      role="alert"
      className={cn(
        'pointer-events-none fixed inset-x-0 z-[45] flex flex-col items-center gap-3',
        'bottom-[calc(84px+env(safe-area-inset-bottom)+112px)] lg:bottom-28',
        className,
      )}
    >
      {items.map((item) => (
        <ActionBanner key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
