import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from '../icons'
import { cn } from '../lib/cn'
import { Icon } from '../ui/icon'
import { MetaPill } from '../ui/meta-pill'
import { useOverlayLayer } from '../layout/overlay-stack'

/** M-26 · PillOverflow — the first `max` pills of a list, the rest folded into
 *  a "+K" button that opens every item in a popover.
 *
 *  The popover is where the list is edited: `onRemove` puts a remove button on
 *  each pill, `addSlot` holds the caller's add box. Which items may be added,
 *  and when the list is full, are the caller's — this only draws. A press inside
 *  the popover never reaches a table row behind it. Opening moves focus into
 *  the panel; Tab past either end shuts it and hands focus back to the trigger. */
export type PillOverflowItem = { id: string; label: string }

export type PillOverflowProps = {
  items: readonly PillOverflowItem[]
  /** Pills drawn inline; the rest fold into "+K". */
  max: number
  /** Names the popover for a screen reader. */
  label: string
  /** First line inside the popover, such as a count and its group. */
  heading?: ReactNode
  onRemove?: (id: string) => void
  removeLabel?: (label: string) => string
  /** Under the pills: the caller's add box and its note. */
  addSlot?: ReactNode
  /** The trigger's text while nothing overflows; without it an editable list
   *  that fits shows no trigger at all. */
  editLabel?: string
  /** The popover shut, or unmounted while open — the moment to save a list
   *  edited inside it. */
  onClose?: () => void
  /** Screen-reader name of the "+K" trigger, given the whole count. */
  moreLabel?: (total: number) => string
  tone?: 'accent' | 'muted'
  className?: string
}

const PANEL_WIDTH = 300
const PANEL_MAX_HEIGHT = 360
/* Below this much room under the trigger the panel opens above it instead. */
const PANEL_MIN_HEIGHT = 200
const GAP = 8
const PILL_TEXT = 'text-[13px]'

const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'

export function PillOverflow({
  items,
  max,
  label,
  heading,
  onRemove,
  removeLabel = (name) => `Bỏ ${name}`,
  addSlot,
  editLabel,
  onClose,
  moreLabel,
  tone = 'accent',
  className,
}: PillOverflowProps) {
  const [open, setOpen] = useState(false)
  const shown = items.slice(0, max)
  const rest = items.length - shown.length
  const trigger = rest > 0 ? `+${rest}` : editLabel

  /* Unmounted while open (a tab switch, a route change): still hand the list over. */
  const pending = useRef<(() => void) | undefined>(undefined)
  pending.current = open ? onClose : undefined
  useEffect(() => () => pending.current?.(), [])

  return (
    <span className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>
      {shown.map((item) => (
        <MetaPill
          key={item.id}
          tone={tone}
          title={item.label}
          className={cn('min-w-0 max-w-full', PILL_TEXT)}
        >
          <span className="truncate">{item.label}</span>
        </MetaPill>
      ))}
      {trigger && (
        <Popover
          label={label}
          text={trigger}
          srText={rest > 0 ? (moreLabel?.(items.length) ?? `${label}: ${trigger}`) : undefined}
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) onClose?.()
          }}
        >
          {heading && <span className="text-muted-foreground text-[12px]">{heading}</span>}
          {items.length > 0 && (
            <span className="flex flex-wrap gap-2">
              {items.map((item) => (
                <MetaPill key={item.id} tone={tone} className={cn('min-w-0 max-w-full', PILL_TEXT)}>
                  <span className="break-words">{item.label}</span>
                  {onRemove && (
                    <button
                      type="button"
                      aria-label={removeLabel(item.label)}
                      onClick={() => onRemove(item.id)}
                      className="motion-std focus-visible:outline-ring pointer-coarse:h-8 pointer-coarse:w-8 relative flex h-4 w-4 shrink-0 items-center justify-center rounded-sm after:absolute after:-inset-2 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <Icon icon={X} size={14} />
                    </button>
                  )}
                </MetaPill>
              ))}
            </span>
          )}
          {addSlot}
        </Popover>
      )}
    </span>
  )
}

/** Where the panel stands: under the trigger, or above it when the room below
 *  is short, capped in height so a long list scrolls inside it. */
function placeUnder(r: DOMRect): CSSProperties {
  const left = Math.max(GAP, Math.min(r.left, window.innerWidth - PANEL_WIDTH - GAP))
  const below = window.innerHeight - r.bottom - GAP * 2
  const above = r.top - GAP * 2
  const up = below < PANEL_MIN_HEIGHT && above > below
  const maxHeight = Math.min(PANEL_MAX_HEIGHT, Math.max(up ? above : below, PANEL_MIN_HEIGHT))
  return up
    ? { bottom: window.innerHeight - r.top + GAP, left, width: PANEL_WIDTH, maxHeight }
    : { top: r.bottom + GAP, left, width: PANEL_WIDTH, maxHeight }
}

/** The trigger and its portal panel, placed under the trigger like M-19. */
function Popover({
  label,
  text,
  srText,
  open,
  onOpenChange,
  children,
}: {
  label: string
  text: string
  srText?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const [style, setStyle] = useState<CSSProperties | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  /* Set by a press anywhere in the panel's React tree, a nested portal (an add
     box's menu) included, which a DOM `contains` cannot see. */
  const inside = useRef(false)
  const isTop = useOverlayLayer(open)
  const shut = () => {
    onOpenChange(false)
    button.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const own = inside.current || button.current?.contains(e.target as Node)
      inside.current = false
      if (!own) onOpenChange(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !isTop()) return
      onOpenChange(false)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, isTop, onOpenChange])

  useLayoutEffect(() => {
    if (!open || !button.current) return
    const place = () => setStyle(placeUnder(button.current!.getBoundingClientRect()))
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  /* The panel itself takes focus: focusing the add box first would open its menu unasked. */
  const placed = open && style !== null
  useEffect(() => {
    if (placed) panel.current?.focus()
  }, [placed])

  const onPanelKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panel.current) return
    const stops = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    const at = document.activeElement
    const pastEnd = !e.shiftKey && (stops.length === 0 || at === stops.at(-1))
    const pastStart = e.shiftKey && (at === panel.current || at === stops[0])
    if (!pastEnd && !pastStart) return
    e.preventDefault()
    shut()
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={srText}
        onClick={(e) => {
          e.stopPropagation()
          onOpenChange(!open)
        }}
        className={cn(
          'bg-surface-ink/9 text-foreground motion-std hover:bg-surface-ink/12 focus-visible:outline-ring pointer-coarse:min-h-12 pointer-coarse:min-w-12 tnum inline-flex shrink-0 items-center justify-center rounded-sm px-2 py-1 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2',
          PILL_TEXT,
        )}
      >
        {text}
      </button>
      {placed &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label={label}
            tabIndex={-1}
            style={style}
            onPointerDown={() => (inside.current = true)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={onPanelKey}
            className="glass-overlay shadow-panel fixed z-[100] flex flex-col gap-3 overflow-y-auto rounded-lg p-3 outline-none"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  )
}
