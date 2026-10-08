import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Search, type IconGlyph } from '../icons'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'
import {
  HeaderSearchPanel,
  rowId,
  type SearchGroup,
  type SearchRow,
  type SearchScope,
} from './header-search-panel'

/** The header's search, private to AppHeader.
 *
 *  Collapsed it is a 232px slot in the row; on focus (or ⌘K) it grows from that
 *  slot to the centre of the header while the rest of the row blurs. The panel
 *  always lists the screens the app can open, filtered here as you type.
 *
 *  Records are the app's business: with `records` the typed text is handed out
 *  and the groups that come back are drawn beside the screens. Without it there
 *  is no record search, and the box does not pretend otherwise. */

export type SearchTarget = {
  icon: IconGlyph
  label: string
  description?: string
  locked?: boolean
  onClick?: () => void
}

export type SearchRecords = {
  scopes: SearchScope[]
  /** The one kind being searched; `null` searches every kind. */
  scope: string | null
  onScopeChange: (id: string | null) => void
  /** The app owns the typed text, so a chip can drop a prefix typed into it. */
  query: string
  onQueryChange: (query: string) => void
  /** Hits for the typed text — or recent ones while the box is empty. */
  groups: SearchGroup[]
  /** One line under the rows — the app knows why there is nothing to list. */
  status?: string
}

type HeaderSearchProps = {
  placeholder?: string
  targets: SearchTarget[]
  records?: SearchRecords
  onOpenChange: (open: boolean) => void
}

const EXPANDED = 560

const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase()

export function HeaderSearch({ placeholder, targets, records, onOpenChange }: HeaderSearchProps) {
  const slotRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState({ dx: 0, width: EXPANDED })
  const text = records?.query ?? query
  const typed = text.trim()
  const screens: SearchGroup = {
    id: 'screens',
    label: 'Màn hình',
    rows: targets
      .filter((t) => !t.locked && fold(t.label).includes(fold(typed)))
      .map((t) => ({
        id: t.label,
        icon: t.icon,
        label: t.label,
        note: t.description,
        onClick: t.onClick,
      })),
  }
  const found = records?.groups ?? []
  // Typing narrows the screens to a few, so they lead; an empty box leads with
  // the recent records. A chosen kind is a record search: no screens at all.
  const mixed = typed ? [screens, ...found] : [...found, screens]
  const groups = (records?.scope ? found : mixed).filter((g) => g.rows.length)
  const rows = groups.flatMap((g) => g.rows)
  const active = Math.min(index, rows.length - 1)

  const type = (next: string) => {
    setQuery(next)
    setIndex(0)
    records?.onQueryChange(next)
  }

  const change = (next: boolean) => {
    const slot = slotRef.current
    const bar = slot?.closest('header')
    if (next && slot && bar) {
      const s = slot.getBoundingClientRect()
      const b = bar.getBoundingClientRect()
      const width = Math.min(EXPANDED, b.width - 32)
      setBox({ dx: b.left + b.width / 2 - width / 2 - s.left, width })
    }
    if (!next) type('')
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

  const pick = (row: SearchRow | undefined) => {
    if (!row) return
    inputRef.current?.blur()
    row.onClick?.()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') inputRef.current?.blur()
    else if (e.key === 'Enter') pick(rows[active])
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      const next = rows.length ? (active + step + rows.length) % rows.length : 0
      setIndex(next)
      document.getElementById(rowId(next))?.scrollIntoView({ block: 'nearest' })
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
            aria-activedescendant={open && rows.length ? rowId(active) : undefined}
            value={text}
            placeholder={placeholder}
            onChange={(e) => type(e.target.value)}
            onFocus={() => change(true)}
            onKeyDown={onKeyDown}
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-inherit outline-none"
          />
          <kbd className="bg-surface-ink/10 text-muted-foreground hidden rounded-sm px-2 py-1 font-sans text-[11px] font-medium lg:block">
            {open ? 'esc' : '⌘K'}
          </kbd>
        </label>

        <HeaderSearchPanel
          open={open}
          groups={groups}
          active={active}
          status={
            records
              ? records.status
              : groups.length
                ? undefined
                : `Không có màn hình nào tên “${typed}”.`
          }
          scopes={records?.scopes}
          scope={records?.scope}
          onScopeChange={records?.onScopeChange}
          onPick={pick}
          onHover={setIndex}
        />
      </div>
    </div>
  )
}
