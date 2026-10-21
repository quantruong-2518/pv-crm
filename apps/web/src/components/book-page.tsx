import { useRef, type ReactNode } from 'react'
import {
  Button,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  Inbox,
  ScreenHeader,
  Skeleton,
  TriangleAlert,
  X,
  cn,
  type TableColumn,
  type TableRowModel,
  type TableSort,
} from '@pv/ui'
import type { ActiveFilter } from './active-filters'

/** ONE shape for every book screen — leads, deals, campaigns, lead sources,
 *  mail runs, mail templates, companies, contacts, workstreams, users.
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

export type BookTable = {
  columns: TableColumn[]
  rows: TableRowModel[]
  sort?: TableSort
  onSort?: (key: string) => void
  /** Narrower than this the columns crush, so the card scrolls sideways. */
  minWidth: string
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
}: BookPageProps) {
  const hasToolbar = Boolean(tabs || count || tools)
  const hasRows = !pending && !failure && !empty
  const hasFilters = Boolean(filters?.length)
  /* The toolbar's own padding closes the chip line; without one it closes itself. */
  const chips = <ActiveFilters items={filters} className={hasToolbar ? undefined : 'pb-4'} />
  const toolbar = hasToolbar && (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {tabs}
        {count}
      </div>
      {tools && (
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">{tools}</div>
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

  return (
    <>
      {head}

      {/* Law 8 — a table always sits on glass-b, and `DataTable` draws no glass
          of its own. No `overflow-hidden`: the filter popover must hang past
          the card's edge. */}
      <GlassCard variant="b" aria-label={title}>
        {chips}
        {toolbar}

        <div className="overflow-x-auto">
          {pending ? (
            <div className="flex flex-col gap-3 p-5">
              <Skeleton height={ROW_PX} />
              <Skeleton height={ROW_PX} delay={200} />
              <Skeleton height={ROW_PX} delay={400} />
            </div>
          ) : failure ? (
            <EmptyState
              tone="danger"
              icon={TriangleAlert}
              message={failure.message}
              action={{ label: 'Thử lại', onClick: failure.onRetry }}
              className="py-12"
            />
          ) : empty ? (
            <EmptyState
              icon={Inbox}
              message={empty.message}
              action={empty.action}
              className="py-12"
            />
          ) : table ? (
            <DataTable
              flush
              rowHeight={ROW_CLASS}
              className={table.minWidth}
              columns={table.columns}
              rows={table.rows}
              sort={table.sort}
              onSort={table.onSort}
            />
          ) : null}
        </div>

        {hasRows && footer}
      </GlassCard>
    </>
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
