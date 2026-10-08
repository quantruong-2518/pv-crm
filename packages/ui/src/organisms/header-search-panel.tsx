import type { IconGlyph } from '../icons'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** The drop panel of the header's search: scope chips, then groups of rows.
 *
 *  It draws what it is handed and keeps no state — the active row and the open
 *  flag belong to HeaderSearch, which also owns the keyboard. */

export type SearchRow = {
  id: string
  icon: IconGlyph
  label: string
  /** Why this row is here (which field matched), or what opening it does. */
  note?: string
  onClick?: () => void
}

export type SearchGroup = { id: string; label: string; rows: SearchRow[] }

export type SearchScope = { id: string; label: string }

type PanelProps = {
  open: boolean
  groups: SearchGroup[]
  active: number
  /** One line under the rows: still searching, nothing found, what to type. */
  status?: string
  scopes?: SearchScope[]
  scope?: string | null
  onScopeChange?: (id: string | null) => void
  onPick: (row: SearchRow) => void
  onHover: (index: number) => void
}

export const rowId = (index: number) => `header-search-row-${index}`

export function HeaderSearchPanel({
  open,
  groups,
  active,
  status,
  scopes,
  scope = null,
  onScopeChange,
  onPick,
  onHover,
}: PanelProps) {
  const starts = groups.map((_, g) => groups.slice(0, g).reduce((n, x) => n + x.rows.length, 0))
  return (
    // Mousedown must not take focus off the input, or the blur closes the
    // panel before the click lands.
    <div
      aria-hidden={!open}
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        'glass-overlay absolute inset-x-0 top-[calc(100%+8px)] rounded-lg p-2 transition-[opacity,translate] duration-200',
        open
          ? 'translate-y-0 opacity-100 delay-75'
          : 'pointer-events-none -translate-y-2 opacity-0',
      )}
    >
      {scopes?.length ? (
        <div role="group" aria-label="Phạm vi tìm" className="flex flex-wrap gap-2 px-1 pb-2 pt-1">
          {[{ id: null, label: 'Tất cả' }, ...scopes].map((chip) => (
            <button
              key={chip.id ?? 'all'}
              type="button"
              aria-pressed={chip.id === scope}
              onClick={() => onScopeChange?.(chip.id)}
              className={cn(
                'motion-std pointer-coarse:h-12 h-8 rounded-md px-3 text-[12px] font-medium outline-none focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_60%,transparent)]',
                chip.id === scope
                  ? 'bg-primary/15 text-on-tint-primary'
                  : 'bg-surface-ink/10 text-muted-foreground',
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}

      <div id="header-search-list" role="listbox" className="max-h-[60vh] overflow-y-auto">
        {groups.map((group, g) => (
          <div key={group.id} role="group" aria-label={group.label}>
            <div
              aria-hidden
              className="text-muted-foreground px-3 pb-1 pt-2 text-[11px] font-semibold"
            >
              {group.label}
            </div>
            {group.rows.map((row, r) => {
              const index = starts[g]! + r
              return (
                <button
                  key={row.id}
                  id={rowId(index)}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === active}
                  onClick={() => onPick(row)}
                  onMouseEnter={() => onHover(index)}
                  className={cn(
                    'motion-std flex h-12 w-full items-center gap-3 rounded-md px-3 text-left text-[13px]',
                    index === active ? 'bg-primary/15 text-on-tint-primary' : 'text-foreground',
                  )}
                >
                  <Icon icon={row.icon} size={16} className="text-muted-foreground shrink-0" />
                  <span className="min-w-0 shrink truncate">{row.label}</span>
                  {row.note ? (
                    <span className="text-muted-foreground min-w-0 flex-1 truncate text-right text-[12px]">
                      {row.note}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <div role="status" className="text-muted-foreground px-3 text-[13px] empty:hidden">
        {status ? <div className="py-3">{status}</div> : null}
      </div>

      <div className="text-muted-foreground pointer-coarse:hidden flex gap-4 px-3 pb-1 pt-3 text-[12px]">
        <span>↑↓ chọn</span>
        <span>↵ mở</span>
      </div>
    </div>
  )
}
