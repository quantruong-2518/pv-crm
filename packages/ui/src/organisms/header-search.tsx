import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Search, type IconGlyph } from '../icons'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** The header's search, private to AppHeader.
 *
 *  Collapsed it is a 232px slot in the row; on focus (or ⌘K) it grows from that
 *  slot to the centre of the header while the rest of the row blurs. The panel
 *  lists the screens the app can open, filtered as you type — there is no
 *  record search behind it, and it does not pretend otherwise. */

export type SearchTarget = {
  icon: IconGlyph
  label: string
  description?: string
  locked?: boolean
  onClick?: () => void
}

type HeaderSearchProps = {
  placeholder?: string
  targets: SearchTarget[]
  onOpenChange: (open: boolean) => void
}

const EXPANDED = 560

const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase()

export function HeaderSearch({ placeholder, targets, onOpenChange }: HeaderSearchProps) {
  const slotRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState({ dx: 0, width: EXPANDED })
  const matches = targets.filter((t) => !t.locked && fold(t.label).includes(fold(query.trim())))

  const change = (next: boolean) => {
    const slot = slotRef.current
    const bar = slot?.closest('header')
    if (next && slot && bar) {
      const s = slot.getBoundingClientRect()
      const b = bar.getBoundingClientRect()
      const width = Math.min(EXPANDED, b.width - 32)
      setBox({ dx: b.left + b.width / 2 - width / 2 - s.left, width })
    }
    if (!next) setQuery('')
    setIndex(0)
    setOpen(next)
    onOpenChange(next)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pick = (target: SearchTarget | undefined) => {
    if (!target) return
    inputRef.current?.blur()
    target.onClick?.()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') inputRef.current?.blur()
    else if (e.key === 'Enter') pick(matches[index])
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setIndex((i) => (matches.length ? (i + step + matches.length) % matches.length : 0))
    }
  }

  return (
    <div
      ref={slotRef}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) change(false)
      }}
      className="relative h-10 min-w-0 flex-1 lg:w-[232px] lg:flex-none"
    >
      <div
        data-open={open}
        style={{ '--dx': `${box.dx}px`, '--w': `${box.width}px` } as CSSProperties}
        className="absolute left-0 top-0 z-10 w-full transition-[width,translate] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none lg:data-[open=true]:w-[var(--w)] lg:data-[open=true]:translate-x-[var(--dx)]"
      >
        <label
          className={cn(
            'motion-std flex h-10 items-center gap-2 rounded-md px-3 text-[13px]',
            open
              ? 'bg-popover text-foreground shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_60%,transparent)]'
              : 'bg-input text-muted-foreground hover:bg-surface-ink/10',
          )}
        >
          <Icon icon={Search} size={16} className="text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls="header-search-list"
            value={query}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            onFocus={() => change(true)}
            onKeyDown={onKeyDown}
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-inherit outline-none"
          />
          <kbd className="bg-surface-ink/10 text-muted-foreground hidden rounded-sm px-2 py-1 font-sans text-[11px] font-medium lg:block">
            {open ? 'esc' : '⌘K'}
          </kbd>
        </label>

        {/* Mousedown on a row must not take focus off the input, or the blur
            closes the panel before the click lands. */}
        <div
          id="header-search-list"
          role="listbox"
          aria-hidden={!open}
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            'glass-overlay absolute inset-x-0 top-[calc(100%+8px)] rounded-lg p-2 transition-[opacity,translate] duration-200',
            open
              ? 'translate-y-0 opacity-100 delay-75'
              : 'pointer-events-none -translate-y-2 opacity-0',
          )}
        >
          <div className="text-muted-foreground px-3 pb-1 pt-2 text-[11px] font-semibold tracking-[0.08em]">
            ĐI TỚI
          </div>
          {matches.length ? (
            matches.map((target, i) => (
              <button
                key={target.label}
                type="button"
                role="option"
                aria-selected={i === index}
                onClick={() => pick(target)}
                onMouseEnter={() => setIndex(i)}
                className={cn(
                  'motion-std flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-[13px]',
                  i === index ? 'bg-primary/15 text-on-tint-primary' : 'text-foreground',
                )}
              >
                <Icon icon={target.icon} size={16} className="text-muted-foreground shrink-0" />
                <span className="shrink-0">{target.label}</span>
                {target.description ? (
                  <span className="text-muted-foreground min-w-0 flex-1 truncate text-right text-[12px]">
                    {target.description}
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <div className="text-muted-foreground px-3 py-3 text-[13px]">
              Không có màn nào tên “{query.trim()}”.
            </div>
          )}
          <div className="text-muted-foreground flex gap-4 px-3 pb-1 pt-3 text-[12px]">
            <span>↑↓ chọn</span>
            <span>↵ mở</span>
            <span>esc đóng</span>
          </div>
        </div>
      </div>
    </div>
  )
}
