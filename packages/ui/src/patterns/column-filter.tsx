import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Filter } from '../icons'
import { cn } from '../lib/cn'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Icon } from '../ui/icon'

/** M-19 · ColumnFilter — a table header that opens its own filter.
 *
 *  The trigger IS the column title, so a filter lives where the reader looks
 *  for it. The panel is a portal under the trigger: a table header clips
 *  overflow, and a panel inside it would be cut off. `active` tints the
 *  trigger; what "active" means is the caller's, the shell only paints it. */
export type ColumnFilterProps = {
  label: string
  active: boolean
  /** Funnel only, the label stays for screen readers — for a header that
   *  already holds the sort button. */
  iconOnly?: boolean
  /** A function receives `close`, so a submit button can shut the panel. */
  children: ReactNode | ((close: () => void) => ReactNode)
  className?: string
}

const PANEL_WIDTH = 264

export function ColumnFilter({ label, active, iconOnly, children, className }: ColumnFilterProps) {
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<CSSProperties | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!trigger.current?.contains(target) && !panel.current?.contains(target)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !trigger.current) return
    const place = () => {
      const r = trigger.current!.getBoundingClientRect()
      const left = Math.min(r.left, window.innerWidth - PANEL_WIDTH - 8)
      setStyle({ top: r.bottom + 8, left: Math.max(8, left), width: PANEL_WIDTH })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'motion-std hover:text-foreground pointer-coarse:min-h-12 -mx-1 inline-flex min-w-0 items-center gap-1 rounded-sm px-1',
          iconOnly && 'pointer-coarse:min-w-12 pointer-coarse:justify-center',
          active ? 'text-on-tint-primary' : 'text-inherit',
          className,
        )}
      >
        <span className={iconOnly ? 'sr-only' : 'truncate'}>{label}</span>
        <Icon icon={Filter} size={14} />
        {active && <span aria-hidden className="bg-primary size-1.5 shrink-0 rounded-full" />}
      </button>
      {open &&
        style &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label={`Lọc ${label}`}
            style={style}
            className="glass-overlay shadow-panel fixed z-[100] flex max-h-[360px] flex-col gap-2 rounded-lg p-3 normal-case tracking-normal"
          >
            {typeof children === 'function' ? children(() => setOpen(false)) : children}
          </div>,
          document.body,
        )}
    </>
  )
}

/** The common panel body: a search box over a checkbox list, many values at
 *  once. Picks stay in a local draft until the apply button; applying on every tick
 *  would refetch the book (and rebuild the header) between two clicks. */
export type ColumnFilterListProps = {
  options: { value: string; label: string }[]
  selected: string[]
  onApply: (selected: string[]) => void
  close: () => void
  searchPlaceholder?: string
  emptyText?: string
  /** Default true; turn off for a two-value list. */
  searchable?: boolean
}

export function ColumnFilterList({
  options,
  selected,
  onApply,
  close,
  searchPlaceholder = 'Tìm…',
  emptyText = 'Không có lựa chọn nào',
  searchable = true,
}: ColumnFilterListProps) {
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState(selected)
  const needle = query.trim().toLowerCase()
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options
  const toggle = (value: string, on: boolean) =>
    setDraft(on ? [...draft, value] : draft.filter((v) => v !== value))

  return (
    <>
      {searchable && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="bg-input text-foreground placeholder:text-muted-foreground pointer-coarse:h-12 h-10 w-full rounded-md px-3 text-[12.5px] outline-none"
        />
      )}
      <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
        {shown.map((o) => (
          <Checkbox
            key={o.value}
            label={o.label}
            checked={draft.includes(o.value)}
            onChange={(on) => toggle(o.value, on)}
          />
        ))}
        {shown.length === 0 && (
          <span className="text-muted-foreground px-1 py-2 text-[12px]">{emptyText}</span>
        )}
      </div>
      <PanelActions
        onClear={draft.length > 0 ? () => setDraft([]) : undefined}
        onApply={() => (onApply(draft), close())}
      />
    </>
  )
}

/** Entry-date style filter: two dates, applied together. */
export type ColumnFilterRangeProps = {
  from?: string
  to?: string
  onApply: (range: { from?: string; to?: string }) => void
  close: () => void
}

export function ColumnFilterRange({ from, to, onApply, close }: ColumnFilterRangeProps) {
  const [draft, setDraft] = useState({ from: from ?? '', to: to ?? '' })
  const cls =
    'bg-input text-foreground h-10 w-full rounded-md px-3 text-[12.5px] outline-none pointer-coarse:h-12'
  return (
    <>
      <label className="text-muted-foreground flex flex-col gap-1 text-[12px]">
        Từ ngày
        <input
          type="date"
          value={draft.from}
          max={draft.to || undefined}
          onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          className={cls}
        />
      </label>
      <label className="text-muted-foreground flex flex-col gap-1 text-[12px]">
        Đến ngày
        <input
          type="date"
          value={draft.to}
          min={draft.from || undefined}
          onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          className={cls}
        />
      </label>
      <PanelActions
        onClear={draft.from || draft.to ? () => setDraft({ from: '', to: '' }) : undefined}
        onApply={() => (
          onApply({ from: draft.from || undefined, to: draft.to || undefined }),
          close()
        )}
      />
    </>
  )
}

function PanelActions({ onClear, onApply }: { onClear?: () => void; onApply: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onClear}
        disabled={!onClear}
        className="text-on-tint-primary pointer-coarse:min-h-12 pointer-coarse:px-2 text-[12px] font-semibold disabled:opacity-40"
      >
        Bỏ chọn
      </button>
      <Button size="md" className="pointer-coarse:h-12" onClick={onApply}>
        Áp dụng
      </Button>
    </div>
  )
}
