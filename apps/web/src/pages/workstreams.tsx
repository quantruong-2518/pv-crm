import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  Chip,
  Icon,
  ScreenLayout,
  SearchField,
  SegmentedControl,
  X,
  type TableColumn,
  type TableSort,
} from '@pv/ui'
import {
  WorkstreamSortKey,
  WorkstreamStatus,
  type WorkstreamBookQuery,
  type WorkstreamRow,
} from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { isApiError, userMessage } from '@/app/api'
import { pageIndexFromQueryPage, queryPageFromPageIndex } from '@/app/url'
import { dm, dmy } from '@/lib/date'
import {
  DEFAULT_WORKSTREAM_BOOK_QUERY,
  WORKSTREAM_STATUS_LABEL,
  footprintTotal,
  parseBoardView,
  parseWorkstreamBookQuery,
  withBoardParams,
  workstreamBookQuery,
  workstreamBookQueryToParams,
} from '@/data/workstreams'
import { BookCount, BookPage } from '@/components/book-page'
import { AvatarCell, TableFooter } from '@/components/table-bits'
import { CloseBadge, ObjectChip, OverdueNote } from '@/components/workstream-bits'
import { WorkstreamsBoard } from './workstreams-board'
import { ViewSwitch } from './workstreams-board-parts'

/** The workstream book — `/sales/workstreams`. One row per customer journey run.
 *
 *  Only what the server can filter is offered: status, search, account. No
 *  stage / close reason / holder / channel filter, because a filter held in the
 *  browser only filters the page the server happened to send.
 *
 *  No ContextRail (law 10), the same conscious debt `pages/opportunities.tsx`
 *  records: a book has no open object to build a chain from. */

type Go = (path: string) => void

/* Built from the shared label table, not typed out again: the board names the
   same three statuses on its filter chip. */
const STATUS_OPTIONS: { value: WorkstreamStatus; label: string }[] = WorkstreamStatus.options.map(
  (value) => ({ value, label: WORKSTREAM_STATUS_LABEL[value] }),
)

/* Ordered by the question the book answers first: whose journey, where it
   stands, whether it needs action, who holds it, then the history. */
const COLUMNS: TableColumn[] = [
  { header: 'Khách hàng', width: '2fr', sortKey: 'customer' },
  { header: 'Giai đoạn hiện tại', width: '2.2fr' },
  { header: 'Tình trạng', width: '1.4fr' },
  { header: 'Sale phụ trách', width: '140px', align: 'center' },
  { header: 'BD phụ trách', width: '140px', align: 'center' },
  { header: 'Lịch sử liên hệ', width: '1fr' },
  { header: 'Ngày bắt đầu', width: '96px', sortKey: 'openedAt' },
  { header: 'Mã hành trình', width: '88px' },
]

/* Every code is `XX-0000` in mono, so one fixed slot holds any chip: the text
   beside it then starts at the same x on every row. */
const CODE_SLOT = 'flex w-18 shrink-0'

function CustomerCell({ row, go }: { row: WorkstreamRow; go: Go }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate" title={row.customer}>
        {row.customer}
      </span>
      <span className={CODE_SLOT}>
        {row.accountCode !== null && <ObjectChip kind="AC" code={row.accountCode} go={go} />}
      </span>
    </span>
  )
}

function ContactCell({ row }: { row: WorkstreamRow }) {
  const last = row.footprint.lastContactedAt
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="tnum font-num w-6 shrink-0 text-right">{footprintTotal(row.footprint)}</span>
      {last === null ? (
        <span className="text-muted-foreground truncate">Chưa liên lạc</span>
      ) : (
        <span className="tnum font-num text-muted-foreground" title="Lần liên lạc gần nhất">
          {dm(last)}
        </span>
      )}
    </span>
  )
}

/** One place for "does this need me": overdue while open, the outcome once closed. */
function StatusCell({ row }: { row: WorkstreamRow }) {
  if (row.closeReason === null || row.closedAt === null) {
    return <OverdueNote overdueBy={row.overdueBy} />
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <CloseBadge reason={row.closeReason} />
      <span className="tnum font-num text-muted-foreground">{dmy(row.closedAt)}</span>
    </span>
  )
}

function rowCells(row: WorkstreamRow, go: Go) {
  return [
    <CustomerCell key="customer" row={row} go={go} />,
    <span key="stand" className="flex min-w-0 items-center gap-2">
      <span className={CODE_SLOT}>
        <ObjectChip kind={row.stand.kind} code={row.stand.code} go={go} />
      </span>
      <span className="min-w-0 truncate" title={row.stand.phaseLabel}>
        {row.stand.phaseLabel}
      </span>
    </span>,
    <StatusCell key="status" row={row} />,
    <AvatarCell key="sale" name={row.saleHolder?.name} empty="Chưa có Sale phụ trách" />,
    <AvatarCell key="bd" name={row.bdHolder?.name} empty="Chưa có BD phụ trách" />,
    <ContactCell key="contact" row={row} />,
    <span key="opened" className="tnum font-num">
      {dmy(row.openedAt)}
    </span>,
    <Chip key="code">{row.code}</Chip>,
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
  const [params, setParams] = useSearchParams()
  const query = useMemo(() => parseWorkstreamBookQuery(params), [params])

  /* Filters live in the URL so a filtered book is pasteable and Back undoes
     one step. Any filter change returns to page 1. */
  const patch = (next: Partial<WorkstreamBookQuery>) => {
    const merged = { ...query, ...next, page: next.page ?? 1 }
    setParams(new URLSearchParams(workstreamBookQueryToParams(merged)), { replace: true })
  }
  const clearAll = () => setParams(new URLSearchParams(), { replace: true })

  const { data, isPending, error, refetch } = useQuery(workstreamBookQuery(query))

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const hidden = data?.hidden ?? 0
  const dirty =
    query.q !== undefined ||
    query.accountCode !== undefined ||
    query.status !== DEFAULT_WORKSTREAM_BOOK_QUERY.status
  const tableSort: TableSort = { key: query.sort, dir: query.dir }

  const onSort = (key: string) => {
    const parsed = WorkstreamSortKey.safeParse(key)
    if (!parsed.success) return
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
          tabs={
            <SegmentedControl
              label="Trạng thái"
              hideLabel
              tone="quiet"
              value={query.status}
              options={STATUS_OPTIONS}
              onChange={(v) => {
                const parsed = WorkstreamStatus.safeParse(v)
                if (parsed.success) patch({ status: parsed.data })
              }}
            />
          }
          count={<BookCount total={total} noun="hành trình" hidden={hidden} />}
          tools={
            <>
              {/* Reads the raw param, not the parsed query: the contract trims `q`,
                  so echoing the parsed value would eat the space between two words
                  while the user is still typing. */}
              <SearchField
                placeholder="Tìm theo mã hành trình, tên lead hoặc công ty…"
                value={params.get('q') ?? ''}
                onChange={(v) => patch({ q: v.trim() === '' ? undefined : v })}
                className="min-w-0 flex-1 sm:max-w-[320px]"
              />
              {query.accountCode !== undefined && (
                <Button
                  variant="ghost"
                  size="md"
                  className="font-mono"
                  aria-label={`Bỏ lọc theo công ty ${query.accountCode}`}
                  onClick={() => patch({ accountCode: undefined })}
                >
                  {query.accountCode}
                  <Icon icon={X} size={16} />
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
                    isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? {
                  message: dirty
                    ? 'Không có hành trình nào phù hợp với bộ lọc hiện tại.'
                    : hidden > 0
                      ? `${hidden} hành trình nằm ngoài phạm vi của bạn nên không hiện ở đây.`
                      : 'Chưa có hành trình nào. Hành trình sẽ xuất hiện khi lead bắt đầu được theo dõi.',
                  action: dirty
                    ? { label: 'Bỏ hết bộ lọc', onClick: clearAll }
                    : { label: 'Xem sổ lead', onClick: () => navigate('/sales/leads') },
                }
              : undefined
          }
          table={{
            minWidth: 'min-w-[1200px]',
            sort: tableSort,
            onSort,
            columns: COLUMNS,
            rows: rows.map((row) => ({
              id: row.code,
              onOpen: () => navigate(`/sales/workstreams/${encodeURIComponent(row.code)}`),
              cells: rowCells(row, navigate),
            })),
          }}
          footer={
            <TableFooter
              page={pageIndexFromQueryPage(query.page)}
              pageSize={query.size}
              total={total}
              onPage={(p) => patch({ page: queryPageFromPageIndex(p) })}
            />
          }
        />
      </ScreenLayout>
    </AppShell>
  )
}
