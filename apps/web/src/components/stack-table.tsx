import { useCallback, useSyncExternalStore } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { DataTable, cn, type TableColumn, type TableRowModel } from '@pv/ui'

/** A DataTable that turns into one card per row on a narrow screen, so a
 *  phone or an upright tablet never scrolls a table sideways.
 *
 *  From `from` up the table renders as before, inside its own sideways scroll.
 *  Below it the first cell is the card's title, every other cell a label/value
 *  pair under its column header, `action` cells a row at the bottom. Only one
 *  tree is mounted (matchMedia), so a field is never in the DOM twice; what
 *  is typed lives in the screen's state and survives the switch.
 *
 *  It paints no glass: like DataTable it sits in a `<GlassCard variant="b">`
 *  (law 8); the cards are a light tint on that surface. */

export type StackColumn = TableColumn & {
  /** `wide`: the value takes the card's full width under its label (an input,
   *  a bar). `action`: no label, sits in the card's bottom row. */
  stack?: 'wide' | 'action'
}

/** The row features a card can carry; `details` and `state` stay table-only.
 *  A row with `onOpen` is itself a button, so its cells hold no link or button. */
export type StackRow = Pick<TableRowModel, 'id' | 'cells' | 'onOpen'>

/** Tailwind's own `md` and `lg`, so the switch lines up with the page grid. */
const QUERY = { md: '(min-width: 48rem)', lg: '(min-width: 64rem)' } as const

function useMinWidth(from: keyof typeof QUERY): boolean {
  const query = QUERY[from]
  const subscribe = useCallback(
    (notify: () => void) => {
      const list = matchMedia(query)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => matchMedia(query).matches)
}

const LABEL = 'text-muted-foreground text-[12px] leading-4'
const OPENABLE =
  'motion-std hover:bg-surface-ink/8 focus-visible:bg-surface-ink/8 cursor-pointer outline-none focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]'

function Card({ columns, row }: { columns: StackColumn[]; row: StackRow }) {
  const [title, ...rest] = row.cells
  const fields = rest.map((cell, i) => ({ cell, col: columns[i + 1] }))
  const actions = fields.filter((f) => f.col?.stack === 'action')
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    row.onOpen?.()
  }
  return (
    <li className="min-w-0">
      <div
        role={row.onOpen ? 'button' : undefined}
        tabIndex={row.onOpen ? 0 : undefined}
        onClick={row.onOpen}
        onKeyDown={row.onOpen ? onKeyDown : undefined}
        /* An input's fill matches this card's tint (≈1:1 in every theme), so it takes the control edge. */
        className={cn(
          'bg-surface-ink/5 [&_input]:shadow-control flex h-full flex-col gap-3 rounded-lg p-4 text-[12.5px]',
          row.onOpen && OPENABLE,
        )}
      >
        <div className="min-w-0 text-[13px]">{title}</div>
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
          {fields.map(({ cell, col }, i) => {
            if (col?.stack === 'action') return null
            const wide = col?.stack === 'wide'
            return (
              <div key={i} className={wide ? 'col-span-2 flex flex-col gap-1' : 'contents'}>
                <dt className={LABEL}>{col?.header}</dt>
                {/* `*:items-end` pulls two-line cells to the right edge with the figures. */}
                <dd
                  className={cn(
                    'min-w-0',
                    !wide && 'flex flex-col items-end text-right *:items-end',
                  )}
                >
                  {cell}
                </dd>
              </div>
            )
          })}
        </dl>
        {actions.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            {actions.map(({ cell }, i) => (
              <div key={i} className="min-w-0 flex-1">
                {cell}
              </div>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

export function StackTable({
  from,
  columns,
  rows,
  flush = false,
  rowHeight,
  tableClassName,
  tableStyle,
}: {
  /** The first width the table's floor fits: `lg` for a 768px+ floor, else `md`. */
  from: keyof typeof QUERY
  columns: StackColumn[]
  rows: StackRow[]
  /** As DataTable's; on cards it also insets the list to the card's 20px edge. */
  flush?: boolean
  rowHeight?: string
  /** The table's floor width, kept on the table only. */
  tableClassName?: string
  tableStyle?: CSSProperties
}) {
  const wide = useMinWidth(from)
  if (wide) {
    return (
      <div className="overflow-x-auto">
        <div className={tableClassName} style={tableStyle}>
          <DataTable flush={flush} rowHeight={rowHeight} columns={columns} rows={rows} />
        </div>
      </div>
    )
  }
  return (
    <ul className={cn('grid gap-3', flush && 'px-5', from === 'lg' && 'md:grid-cols-2')}>
      {rows.map((row) => (
        <Card key={row.id} columns={columns} row={row} />
      ))}
    </ul>
  )
}
