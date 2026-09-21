import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, Plus } from '../icons'
import { cn } from '../lib/cn'
import { Icon } from '../ui/icon'

/** M-18 · Combobox — pick one from a list the caller searches, or add a new one.
 *
 *  The caller owns the search: `query` goes out through `onQueryChange` and the
 *  matching `options` come back in props, so the list may live on a server.
 *  `suggestions` is the "did you mean" group for near misses, and `createLabel`
 *  turns on a last row that hands the typed text to `onCreate` — the component
 *  never decides whether a name is new, it only offers what it was given. */
export type ComboboxOption = { value: string; label: string; hint?: string }

export type ComboboxProps = {
  label: string
  hideLabel?: boolean
  /** Selected value, or `''` for none. */
  value: string
  /** Label of the selected value — it may not be in the current `options`. */
  valueLabel?: string
  query: string
  onQueryChange: (query: string) => void
  options: ComboboxOption[]
  suggestions?: ComboboxOption[]
  onSelect: (option: ComboboxOption) => void
  /** Present = a create row for the typed text, worded by the caller. */
  createLabel?: (query: string) => string
  onCreate?: (query: string) => void
  placeholder?: string
  emptyText?: string
  loading?: boolean
  invalid?: boolean
  disabled?: boolean
  size?: 'md' | 'lg'
  className?: string
}

type Row = { kind: 'option'; option: ComboboxOption } | { kind: 'create'; text: string }

const MENU_GAP = 8
const MAX_MENU_HEIGHT = 320
const MIN_MENU_HEIGHT = 112

export function Combobox({
  label,
  hideLabel = false,
  value,
  valueLabel,
  query,
  onQueryChange,
  options,
  suggestions = [],
  onSelect,
  createLabel,
  onCreate,
  placeholder,
  emptyText = 'Không có kết quả',
  loading = false,
  invalid = false,
  disabled = false,
  size = 'md',
  className,
}: ComboboxProps) {
  const uid = useId()
  const listboxId = `${uid}-listbox`
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const typed = query.trim()
  const rows: Row[] = [
    ...options.map((option): Row => ({ kind: 'option', option })),
    ...suggestions.map((option): Row => ({ kind: 'option', option })),
    ...(createLabel && onCreate && typed ? [{ kind: 'create', text: typed } as const] : []),
  ]

  const style = useAnchoredMenu(open, () => setOpen(false), inputRef, menuRef)

  const pick = (row: Row | undefined) => {
    if (!row) return
    if (row.kind === 'create') onCreate?.(row.text)
    else onSelect(row.option)
    setOpen(false)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) return setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setHighlighted((i) => (rows.length ? (i + step + rows.length) % rows.length : 0))
    } else if (event.key === 'Enter' && open) {
      event.preventDefault()
      pick(rows[highlighted])
    } else if (event.key === 'Escape' && open) {
      /* Stop here, or the Drawer/Modal around us closes on the same key. */
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  /* Closed, the box reads as the chosen value; open, it is the search text. */
  const shown = open ? query : (valueLabel ?? (value ? query : ''))

  const renderRow = (row: Row, index: number) => (
    <ComboboxRow
      key={row.kind === 'create' ? '__create' : row.option.value}
      id={`${uid}-row-${index}`}
      row={row}
      focused={index === highlighted}
      selected={row.kind === 'option' && row.option.value === value}
      createText={row.kind === 'create' ? createLabel?.(row.text) : undefined}
      onHover={() => setHighlighted(index)}
      onPick={() => pick(row)}
    />
  )

  return (
    <label className={cn('flex min-w-0 flex-col gap-2', className)}>
      <span className={cn('text-muted-foreground text-[11px]', hideLabel && 'sr-only')}>
        {label}
      </span>
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && rows.length ? `${uid}-row-${highlighted}` : undefined}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        value={shown}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onQueryChange(event.target.value)
          setHighlighted(0)
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
        className={cn(
          'motion-std bg-input text-foreground w-full rounded-md px-3 text-[12.5px] outline-none',
          'placeholder:text-muted-foreground',
          'focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]',
          size === 'md' ? 'h-10' : 'h-12',
          invalid && 'shadow-[0_0_0_2px_color-mix(in_srgb,var(--destructive)_50%,transparent)]',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      />
      {open &&
        style &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-label={label}
            style={style}
            className="glass-overlay shadow-panel fixed z-[100] flex flex-col gap-1 overflow-y-auto rounded-lg p-2"
          >
            {options.map((option, i) => renderRow({ kind: 'option', option }, i))}
            {suggestions.length > 0 && (
              <span className="text-muted-foreground px-3 pt-2 text-[11px]">Có phải …?</span>
            )}
            {suggestions.map((option, i) =>
              renderRow({ kind: 'option', option }, options.length + i),
            )}
            {rows.length === 0 && (
              <span className="text-muted-foreground px-3 py-3 text-[12px]">
                {loading ? 'Đang tìm…' : emptyText}
              </span>
            )}
            {rows.at(-1)?.kind === 'create' && renderRow(rows.at(-1)!, rows.length - 1)}
          </div>,
          document.body,
        )}
    </label>
  )
}

/** Closes on a press outside both boxes and pins the menu under the input. */
function useAnchoredMenu(
  open: boolean,
  close: () => void,
  inputRef: RefObject<HTMLInputElement | null>,
  menuRef: RefObject<HTMLDivElement | null>,
): CSSProperties | null {
  const [style, setStyle] = useState<CSSProperties | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!inputRef.current?.contains(target) && !menuRef.current?.contains(target)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, close, inputRef, menuRef])

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const rect = inputRef.current?.getBoundingClientRect()
      if (!rect) return
      const below = window.innerHeight - rect.bottom - MENU_GAP * 2
      const above = rect.top - MENU_GAP * 2
      /* Flip up when two rows no longer fit below — the tablet keyboard case. */
      const up = below < MIN_MENU_HEIGHT && above > below
      setStyle({
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(MAX_MENU_HEIGHT, Math.max(up ? above : below, MIN_MENU_HEIGHT)),
        ...(up
          ? { bottom: window.innerHeight - rect.top + MENU_GAP }
          : { top: rect.bottom + MENU_GAP }),
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, inputRef])

  return open ? style : null
}

function ComboboxRow({
  id,
  row,
  focused,
  selected,
  createText,
  onHover,
  onPick,
}: {
  id: string
  row: Row
  focused: boolean
  selected: boolean
  createText?: string
  onHover: () => void
  onPick: () => void
}) {
  return (
    <button
      id={id}
      type="button"
      role="option"
      tabIndex={-1}
      aria-selected={selected}
      onPointerMove={onHover}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      className={cn(
        'motion-std flex h-12 w-full shrink-0 items-center gap-3 rounded-md px-3 text-left text-[12.5px] outline-none',
        selected
          ? 'bg-primary/24 text-on-tint-primary font-semibold'
          : focused
            ? 'text-foreground bg-surface-ink/10'
            : 'text-glass-foreground hover:bg-surface-ink/8',
      )}
    >
      {row.kind === 'create' ? (
        <>
          <Icon icon={Plus} size={16} />
          <span className="min-w-0 flex-1 truncate">{createText}</span>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{row.option.label}</span>
          {row.option.hint && (
            <span className="text-muted-foreground shrink-0 text-[11px]">{row.option.hint}</span>
          )}
          {selected && <Icon icon={Check} size={16} strokeWidth={1.9} />}
        </>
      )}
    </button>
  )
}
