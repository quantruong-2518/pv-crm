import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  CalendarClock,
  ScreenLayout,
  SearchField,
  SegmentedControl,
  type TableColumn,
  type TableSort,
} from '@pv/ui'
import {
  WorkstreamBookQuery,
  WorkstreamSortKey,
  WorkstreamStatus,
  type WorkstreamRow,
} from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { searchHint } from '@/lib/search-box'
import { isApiError, userMessage } from '@/app/api'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { dmy } from '@/lib/date'
import {
  DEFAULT_WORKSTREAM_BOOK_QUERY,
  WORKSTREAM_STATUS_LABEL,
  parseBoardView,
  withBoardParams,
  workstreamBookQuery,
} from '@/data/workstreams'
import { BookCount, BookPage } from '@/components/book-page'
import { dayRangeChip, type ActiveFilter } from '@/components/active-filters'
import { TableFooter } from '@/components/table-bits'
import { ContactCell, CustomerCell, StandCell, StatusCell } from '@/components/workstream-cells'
import { WorkstreamsBoard } from './workstreams-board'
import { WorkstreamScoreStrip } from './workstreams-score'
import { ViewSwitch } from './workstreams-board-parts'

/** The workstream book — `/sales/workstreams`. One row per customer journey run.
 *
 *  Only what the server can filter is offered: status tabs, search, the account
 *  chip, and the strip's rung bars and overdue card. Sort is customer, start
 *  date, or the server's priority ladder (the default). Filters live in the
 *  address (`app/book-query.ts`). No close reason / channel filter yet: the
 *  contract takes those single-valued, and a filter held in the browser only
 *  filters the page the server happened to send.
 *
 *  No ContextRail (law 10), the same conscious debt `pages/opportunities.tsx`
 *  records: a book has no open object to build a chain from. */

type Go = (path: string) => void

/* Rows per page: the contract's own default, restated for `useBookQuery` so the
   address never carries a `size` nobody chose. */
const PAGE_SIZE = DEFAULT_WORKSTREAM_BOOK_QUERY.size

/* Every query field the server narrows by, bar sort and paging: they drive
   `dirty` and "clear all". `status` counts only off its default tab. */
const FILTER_KEYS = [
  'status',
  'accountCode',
  'standKind',
  'standKey',
  'closeReason',
  'overdue',
  'stopped',
  'liveFrom',
  'liveTo',
  'closedFrom',
  'closedTo',
] as const

/* Built from the shared label table, not typed out again: the board names the
   same three statuses on its filter chip. */
const STATUS_OPTIONS: { value: WorkstreamStatus; label: string }[] = WorkstreamStatus.options.map(
  (value) => ({ value, label: WORKSTREAM_STATUS_LABEL[value] }),
)

/* Ordered by the question the book answers first: whose journey, where it
   stands, whether it needs action, then the history. Holders and the journey
   code are not columns: the detail page names them. */
const columns: TableColumn[] = [
  { header: 'Khách hàng', width: 'minmax(220px,2.4fr)', sortKey: 'customer' },
  { header: 'Giai đoạn hiện tại', width: 'minmax(260px,2.4fr)' },
  { header: 'Tình trạng', width: 'minmax(160px,1.2fr)', sortKey: 'priority' },
  { header: 'Lịch sử liên hệ', width: 'minmax(200px,1.4fr)' },
  { header: 'Ngày bắt đầu', width: '128px', sortKey: 'openedAt' },
]

/** The overdue card, the overview's runs tile and an account link narrow the
 *  book with no control of their own on the toolbar, so each gets a removable chip. */
function filterChips(
  query: WorkstreamBookQuery,
  patch: (next: Partial<WorkstreamBookQuery>) => void,
): ActiveFilter[] {
  return [
    ...(query.overdue === true
      ? [
          {
            id: 'overdue',
            label: 'Quá hạn',
            aria: 'Bỏ lọc quá hạn',
            icon: CalendarClock,
            className: 'text-on-tint-warning',
            onDrop: () => patch({ overdue: undefined }),
          },
        ]
      : []),
    ...(query.stopped === true
      ? [
          {
            id: 'stopped',
            label: 'Đã dừng',
            aria: 'Bỏ lọc hành trình đã dừng',
            onDrop: () => patch({ stopped: undefined }),
          },
        ]
      : []),
    ...dayRangeChip('live', 'Đang chạy trong', query.liveFrom, query.liveTo, () =>
      patch({ liveFrom: undefined, liveTo: undefined }),
    ),
    ...dayRangeChip('closed', 'Ngày đóng', query.closedFrom, query.closedTo, () =>
      patch({ closedFrom: undefined, closedTo: undefined }),
    ),
    ...(query.accountCode !== undefined
      ? [
          {
            id: 'accountCode',
            label: query.accountCode,
            aria: `Bỏ lọc theo công ty ${query.accountCode}`,
            className: 'font-mono',
            onDrop: () => patch({ accountCode: undefined }),
          },
        ]
      : []),
  ]
}

function rowCells(row: WorkstreamRow, go: Go) {
  return [
    <CustomerCell key="customer" row={row} go={go} />,
    <StandCell key="stand" row={row} go={go} />,
    <StatusCell key="status" row={row} />,
    <ContactCell key="contact" row={row} />,
    <span key="opened" className="tnum font-num text-muted-foreground">
      {dmy(row.openedAt)}
    </span>,
  ]
}

/** Table or board, chosen by `?view=` and nothing else: the screen a link opens
 *  must be the screen the sender was looking at. */
export default function WorkstreamsPage() {
  const [params] = useSearchParams()
  return parseBoardView(params) === 'kanban' ? <WorkstreamsBoard /> : <WorkstreamsBook />
}

function WorkstreamsBook() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm hành trình, khách hàng…' })
  const navigate = useNavigate()
  /* Only the view switch reads the raw address: `useBookQuery` writes schema
     keys alone, and `view` / `step` are not among them. */
  const [params, setParams] = useSearchParams()
  const book = useBookQuery(WorkstreamBookQuery, { size: PAGE_SIZE, filterKeys: FILTER_KEYS })
  const { query, text, setText, patch, goPage, clear: clearAll, dirty } = book

  const { data, isPending, error, refetch } = useQuery(workstreamBookQuery(query))

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const hidden = data?.hidden ?? 0
  const { pageIndex } = useBookPageClamp(book, data?.total)
  /* `priority` is a fixed ladder the server reads without `dir`, so the arrow
     never shows a direction the order does not have. */
  const tableSort: TableSort = {
    key: query.sort,
    dir: query.sort === 'priority' ? 'desc' : query.dir,
  }

  const onSort = (key: string) => {
    const parsed = WorkstreamSortKey.safeParse(key)
    if (!parsed.success) return
    if (parsed.data === 'priority') {
      if (query.sort !== 'priority') patch({ sort: 'priority', dir: 'desc' })
      return
    }
    patch(
      query.sort === parsed.data
        ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
        : { sort: parsed.data, dir: parsed.data === 'openedAt' ? 'desc' : 'asc' },
    )
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title="Sổ hành trình"
          score={<WorkstreamScoreStrip query={query} patch={patch} />}
          tabs={
            <SegmentedControl
              label="Trạng thái"
              hideLabel
              tone="quiet"
              value={query.overdue === true ? 'open' : query.status}
              options={STATUS_OPTIONS}
              onChange={(v) => {
                const parsed = WorkstreamStatus.safeParse(v)
                if (parsed.success) patch({ status: parsed.data })
              }}
            />
          }
          count={<BookCount total={total} noun="hành trình" hidden={hidden} />}
          filters={filterChips(query, patch)}
          tools={
            <>
              <SearchField
                placeholder="Tìm hành trình, lead, công ty…"
                value={text}
                meta={searchHint(text)}
                onChange={setText}
                className="min-w-0 flex-1 max-sm:basis-full sm:max-w-[320px]"
              />
              {dirty && (
                <Button
                  size="md"
                  variant="ghost"
                  onClick={clearAll}
                  className="pointer-coarse:h-12"
                >
                  Bỏ hết bộ lọc
                </Button>
              )}
              <ViewSwitch
                view="table"
                onChange={(next) =>
                  setParams(withBoardParams(params, { view: next }), { replace: true })
                }
              />
            </>
          }
          pending={isPending}
          failure={
            error
              ? {
                  message: `Không tải được danh sách hành trình. ${
                    isApiError(error) ? userMessage(error) : 'Thử lại.'
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? {
                  message: dirty
                    ? 'Không có hành trình nào khớp bộ lọc.'
                    : hidden > 0
                      ? `${hidden} hành trình nằm ngoài phạm vi của bạn.`
                      : 'Chưa có hành trình nào.',
                  action: dirty
                    ? { label: 'Bỏ hết bộ lọc', onClick: clearAll }
                    : { label: 'Xem sổ lead', onClick: () => navigate('/sales/leads') },
                }
              : undefined
          }
          table={{
            minWidth: 'min-w-[1000px]',
            sort: tableSort,
            onSort,
            columns,
            rows: rows.map((row) => ({
              id: row.code,
              onOpen: () => navigate(`/sales/workstreams/${encodeURIComponent(row.code)}`),
              cells: rowCells(row, navigate),
            })),
          }}
          footer={
            <TableFooter page={pageIndex} pageSize={PAGE_SIZE} total={total} onPage={goPage} />
          }
        />
      </ScreenLayout>
    </AppShell>
  )
}
