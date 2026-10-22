import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'
import {
  Button,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  Inbox,
  ScreenHeader,
  SearchField,
  Skeleton,
  TriangleAlert,
  X,
  cn,
  type TableColumn,
  type TableRowModel,
  type TableSort,
} from '@pv/ui'
import { searchHint } from '@/lib/search-box'
import type { ActiveFilter } from './active-filters'
import { bookMinWidth } from './book-columns'

/** ONE shape for every book screen — leads, deals, campaigns, lead sources,
 *  mail runs, mail templates, companies, contacts, contracts, workstreams, users.
 *
 *  Ten books had grown three layouts: a title sometimes uppercase and sometimes
 *  trailing a kicker and two lines of prose, filters sometimes in a card of
 *  their own and sometimes in the table's own toolbar row, paging sometimes
 *  inside the card and sometimes floating under it. Nothing here is new design
 *  — it is the newest of the three made the only one.
 *
 *  Screens pass CONTENT: the title, the buttons, the tabs, the columns. They
 *  pass no geometry — padding, row height, the skeleton that has to match it,
 *  and where the count sits are decided once, here. */

/** The row height every book draws, twice over: the table's class and the
 *  skeleton's pixels. `Skeleton` writes height into an inline style, so a class
 *  cannot set it — that is how books ended up waiting on 11px bars. */
const ROW_CLASS = 'h-14'
const ROW_PX = 56

/** The header band: 40px, 64px under a finger, where a column filter's 48px
 *  trigger sets it. The footer slot: `TableFooter`'s 32px page buttons in
 *  `py-3`, 48px ones under a finger. Both kept in step with `DataTable` and
 *  `TableFooter` by hand — a class cannot be measured. */
const HEAD_CLASS = 'h-10 pointer-coarse:h-16'
const HEAD_PX = 40
const HEAD_COARSE_PX = 64
const FOOT_CLASS = 'h-14 pointer-coarse:h-18'

/** Below this many rows a short window scrolls the page instead of the table. */
const FLOOR_ROWS = 5

/** A full page, capped by the window: everything above the table and the
 *  pager below it are subtracted, then the shell's own bottom padding (the
 *  bottom nav's room below `lg`), so the pager is always in view and the rows
 *  scroll under a header that stays put. `--book-top`/`--book-foot` are measured. */
const RESERVED_CLASS = cn(
  'flex flex-col',
  'pointer-coarse:[--book-body:var(--book-rows-coarse)] [--book-body:var(--book-rows-fine)]',
  '[--book-gap:calc(100px+env(safe-area-inset-bottom))] lg:[--book-gap:24px]',
  'h-[min(var(--book-body),max(var(--book-floor),calc(100dvh-var(--book-top,0px)-var(--book-foot,0px)-var(--book-gap))))]',
)

function reservedHeight(rows: number) {
  return {
    '--book-rows-fine': `${HEAD_PX + rows * ROW_PX}px`,
    '--book-rows-coarse': `${HEAD_COARSE_PX + rows * ROW_PX}px`,
    '--book-floor': `${HEAD_PX + FLOOR_ROWS * ROW_PX}px`,
    /* Starting values; `useFitWindow` writes the measured ones. React leaves
       a key alone while its value does not change between renders. */
    '--book-top': '0px',
    '--book-foot': '0px',
  } as CSSProperties
}

/** Writes where the body starts on the page and how tall the pager is. Any
 *  height above it can change (score cards load, chips appear, the toolbar
 *  wraps), so it re-measures whenever `main` resizes. */
function useFitWindow(
  body: RefObject<HTMLDivElement | null>,
  foot: RefObject<HTMLDivElement | null>,
  on: boolean,
) {
  useLayoutEffect(() => {
    const el = body.current
    if (!on || !el) return
    const measure = () => {
      el.style.setProperty('--book-top', `${el.getBoundingClientRect().top + window.scrollY}px`)
      el.style.setProperty('--book-foot', `${foot.current?.offsetHeight ?? 0}px`)
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el.closest('main') ?? document.body)
    window.addEventListener('resize', measure)
    return () => {
      watch.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [body, foot, on])
}

export type BookTable = {
  columns: TableColumn[]
  rows: TableRowModel[]
  sort?: TableSort
  onSort?: (key: string) => void
  /** Narrower than this the columns crush, so the card scrolls sideways. The
   *  sum of the column tracks (`bookMinWidth`) always applies as well. */
  minWidth?: string
  /** More classes on the table root — a column that stays put while it scrolls. */
  className?: string
  /** Rows per page. Given, the body keeps one height through loading, empty,
   *  a short page and a full one, capped so the pager stays in the window. */
  pageSize?: number
}

export type BookPageProps = {
  /** The book's name. Uppercased by CSS, so readers still hear words. */
  title: string
  /** One line under the title — a period's progress, say. */
  description?: ReactNode
  /** Write doors — create, import. Right of the title from `sm`. */
  actions?: ReactNode
  /** Nav across sibling books, between the header and the score row. */
  nav?: ReactNode
  /** `StatStrip` or `ScreenScoreGrid` for this book. */
  score?: ReactNode
  /** Status tabs, left end of the toolbar row. */
  tabs?: ReactNode
  /** The server's row count, right after the tabs — see `BookCount`. */
  count?: ReactNode
  /** Search box and `FilterMenu`, right end of the toolbar row. */
  tools?: ReactNode
  /** Removable chips above the toolbar, one per narrowing a link can set —
   *  a header's filter dot alone does not say what narrows the book. */
  filters?: readonly ActiveFilter[]
  pending?: boolean
  /** A failed read. The button retries — it does not offer to clear filters,
   *  because the filters are not what broke. */
  failure?: { message: string; onRetry: () => void }
  /** No rows. `EmptyState` always demands a button, so the screen picks the one
   *  that is actually true here.
   *
   *  NEITHER state takes an icon, on purpose: one glyph per state across ten
   *  books is the point. Before this, the same failed read drew a triangle on
   *  one book and a circle on the next. The sentence carries the meaning. */
  empty?: { message: string; action: { label: string; onClick: () => void } }
  /** The rows as a table; leave it out when `cards` draws them. */
  table?: BookTable
  /** The rows as cards instead of a table — the screen draws them whole. */
  cards?: ReactNode
  /** `TableFooter` — drawn inside the card, under the table. */
  footer?: ReactNode
  /** Given, a clear-all-filters button closes the tools row. Pass it only while
   *  something narrows the book (`book.dirty ? book.clear : undefined`). */
  onClearFilters?: () => void
}

export function BookPage({
  title,
  description,
  actions,
  nav,
  score,
  tabs,
  count,
  tools,
  filters,
  pending = false,
  failure,
  empty,
  table,
  cards,
  footer,
  onClearFilters,
}: BookPageProps) {
  const hasToolbar = Boolean(tabs || count || tools || onClearFilters)
  const hasRows = !pending && !failure && !empty
  const hasFilters = Boolean(filters?.length)
  /* Cards are as tall as their rows make them; only a table reserves a page. */
  const reserve = cards ? undefined : table?.pageSize
  const bodyRef = useRef<HTMLDivElement>(null)
  const footRef = useRef<HTMLDivElement>(null)
  useFitWindow(bodyRef, footRef, reserve !== undefined)
  /* The toolbar's own padding closes the chip line; without one it closes itself. */
  const chips = <ActiveFilters items={filters} className={hasToolbar ? undefined : 'pb-4'} />
  const toolbar = hasToolbar && (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {tabs}
        {count}
      </div>
      {(tools || onClearFilters) && (
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          {tools}
          {onClearFilters && (
            <Button
              size="md"
              variant="ghost"
              className="pointer-coarse:h-12"
              onClick={onClearFilters}
            >
              Bỏ hết bộ lọc
            </Button>
          )}
        </div>
      )}
    </div>
  )
  const head = (
    <>
      <ScreenHeader
        title={<span className="uppercase">{title}</span>}
        description={description}
        actions={actions}
      />
      {nav}
      {score}
    </>
  )

  /* Cards are surfaces of their own: laid on the page, not inside the book's
     card, or the grid reads as boxes within a box. */
  if (cards && hasRows) {
    return (
      <>
        {head}
        {(toolbar || hasFilters) && (
          <GlassCard variant="b" aria-label={title}>
            {chips}
            {toolbar}
          </GlassCard>
        )}
        {cards}
        {footer}
      </>
    )
  }

  const body = pending ? (
    reserve === undefined ? (
      <div className="flex flex-col gap-3 p-5">
        <Skeleton height={ROW_PX} />
        <Skeleton height={ROW_PX} delay={200} />
        <Skeleton height={ROW_PX} delay={400} />
      </div>
    ) : (
      <TableSkeleton rows={reserve} />
    )
  ) : failure ? (
    <EmptyState
      tone="danger"
      icon={TriangleAlert}
      message={failure.message}
      action={{ label: 'Thử lại', onClick: failure.onRetry }}
      className="py-12"
    />
  ) : empty ? (
    <EmptyState icon={Inbox} message={empty.message} action={empty.action} className="py-12" />
  ) : table ? (
    <BookDataTable table={table} sticky={reserve !== undefined} />
  ) : null

  return (
    <>
      {head}

      {/* Law 8 — a table always sits on glass-b, and `DataTable` draws no glass
          of its own. No `overflow-hidden`: the filter popover must hang past
          the card's edge. */}
      <GlassCard variant="b" aria-label={title}>
        {chips}
        {toolbar}

        {reserve === undefined ? (
          <div className="overflow-x-auto">{body}</div>
        ) : (
          <div
            ref={bodyRef}
            style={reservedHeight(reserve)}
            className={cn(
              RESERVED_CLASS,
              hasRows ? 'overflow-auto' : 'justify-center overflow-hidden',
            )}
          >
            {body}
          </div>
        )}

        <div ref={footRef}>
          {hasRows ? footer : reserve !== undefined && <div aria-hidden className={FOOT_CLASS} />}
        </div>
      </GlassCard>
    </>
  )
}

/** Loading in the table's own geometry: the header band, then one 56px row per
 *  row the page will hold, so the rows land where the bars stood. */
function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden>
      <div className={cn('bg-surface-ink/5', HEAD_CLASS)} />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cn('flex items-center px-5', ROW_CLASS)}>
          <Skeleton height={16} delay={i * 80} />
        </div>
      ))}
    </div>
  )
}

/** `DataTable` takes no style, so the summed minimum rides on a wrapper; a
 *  `minWidth` class a book still names sits on the table and the larger wins. */
function BookDataTable({ table, sticky }: { table: BookTable; sticky: boolean }) {
  const drawn = (
    <DataTable
      flush
      stickyHeader={sticky}
      rowHeight={ROW_CLASS}
      className={cn(table.minWidth, table.className)}
      columns={table.columns}
      rows={table.rows}
      sort={table.sort}
      onSort={table.onSort}
    />
  )
  return <div style={{ minWidth: bookMinWidth(table.columns.map((c) => c.width)) }}>{drawn}</div>
}

/** The book's search box: the width the contract book set, 48px under a
 *  finger (law 13), and the too-short hint in its corner. */
export function BookSearch({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
}) {
  return (
    <SearchField
      placeholder={placeholder}
      value={value}
      meta={searchHint(value)}
      onChange={onChange}
      className={cn('pointer-coarse:h-12 min-w-0 flex-1 sm:max-w-[320px]', className)}
    />
  )
}

/** The chip line. Stays mounted, padding-free, when nothing is active: it is
 *  where focus lands once the last chip is dropped, instead of the page body.
 *  Each chip is the ghost button the workstream board's `DropFilter` draws. */
function ActiveFilters({
  items = [],
  className,
}: {
  items?: readonly ActiveFilter[]
  className?: string
}) {
  const group = useRef<HTMLDivElement>(null)
  /* The pressed chip unmounts; its neighbours keep their nodes (stable keys). */
  const drop = (index: number, onDrop: () => void) => {
    const chips = group.current?.children
    const next = chips?.[index + 1] ?? chips?.[index - 1] ?? group.current
    onDrop()
    if (next instanceof HTMLElement) next.focus()
  }
  return (
    <div
      ref={group}
      role={items.length > 0 ? 'group' : undefined}
      aria-label={items.length > 0 ? 'Bộ lọc đang áp dụng' : undefined}
      tabIndex={-1}
      className={cn(
        'flex flex-wrap items-center gap-2 outline-none',
        items.length > 0 && cn('px-5 pt-4', className),
      )}
    >
      {items.map((item, index) => (
        <Button
          key={item.id}
          variant="ghost"
          size="md"
          className={cn('pointer-coarse:h-12 max-w-full', item.className)}
          title={item.label}
          aria-label={item.aria ?? `Bỏ lọc ${item.label}`}
          onClick={() => drop(index, item.onDrop)}
        >
          {item.icon && <Icon icon={item.icon} size={16} />}
          <span className="min-w-0 truncate">{item.label}</span>
          <Icon icon={X} size={16} />
        </Button>
      ))}
    </div>
  )
}

/** How many rows the SERVER matched, and how many it cut for scope.
 *
 *  `total` is the server's number, never `rows.length`: a ten-row page cannot
 *  know how many rows the filter matched. `hidden` is likewise counted there —
 *  no screen can count what it was never sent. */
export function BookCount({
  total,
  noun,
  hidden = 0,
}: {
  total: number
  noun: string
  hidden?: number
}) {
  return (
    <span className="text-muted-foreground text-[11.5px]">
      <span className="tnum text-foreground font-semibold">{total}</span> {noun}
      {hidden > 0 && (
        <>
          {' · '}
          <span className="text-warning">
            <span className="tnum">{hidden}</span> bị ẩn theo quyền của bạn
          </span>
        </>
      )}
    </span>
  )
}
