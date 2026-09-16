import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  Chip,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  Inbox,
  ScreenHeader,
  ScreenLayout,
  ScreenToolbar,
  SearchField,
  SegmentedControl,
  Skeleton,
  TriangleAlert,
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
  footprintTotal,
  parseWorkstreamBookQuery,
  workstreamBookQuery,
  workstreamBookQueryToParams,
} from '@/data/workstreams'
import { PersonCell, Pager } from '@/components/table-bits'
import { CloseBadge, ObjectChip, StandCell } from '@/components/workstream-bits'

/** The workstream book — `/sales/workstreams`. One row per customer journey run.
 *
 *  Only what the server can filter is offered: status, search, account. No
 *  stage / close reason / holder / channel filter, because a filter held in the
 *  browser only filters the page the server happened to send.
 *
 *  No ContextRail (law 10), the same conscious debt `pages/opportunities.tsx`
 *  records: a book has no open object to build a chain from. */

type Go = (path: string) => void

const STATUS_OPTIONS: { value: WorkstreamStatus; label: string }[] = [
  { value: 'open', label: 'Đang chạy' },
  { value: 'closed', label: 'Đã đóng' },
  { value: 'all', label: 'Tất cả' },
]

const COLUMNS: TableColumn[] = [
  { header: 'Mã', width: '0.9fr' },
  { header: 'Khách hàng', width: '2fr', sortKey: 'customer' },
  { header: 'Đang ở', width: '2.4fr' },
  { header: 'Sale', width: '1.1fr' },
  { header: 'BD', width: '1.1fr' },
  { header: 'Liên lạc', width: '1fr' },
  { header: 'Mở / Đóng', width: '1.8fr', sortKey: 'openedAt' },
]

function CustomerCell({ row, go }: { row: WorkstreamRow; go: Go }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 truncate" title={row.customer}>
        {row.customer}
      </span>
      {row.accountCode !== null && <ObjectChip kind="AC" code={row.accountCode} go={go} />}
    </span>
  )
}

function ContactCell({ row }: { row: WorkstreamRow }) {
  const last = row.footprint.lastContactedAt
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="tnum font-num">{footprintTotal(row.footprint)}</span>
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

function OpenCloseCell({ row }: { row: WorkstreamRow }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="tnum font-num">{dmy(row.openedAt)}</span>
      {row.closeReason !== null && <CloseBadge reason={row.closeReason} />}
      {row.closedAt !== null && <span className="tnum font-num">{dmy(row.closedAt)}</span>}
    </span>
  )
}

function rowCells(row: WorkstreamRow, go: Go) {
  return [
    <Chip key="code">{row.code}</Chip>,
    <CustomerCell key="customer" row={row} go={go} />,
    <StandCell
      key="stand"
      stand={row.stand}
      overdueBy={row.overdueBy}
      closed={row.closedAt !== null}
      go={go}
    />,
    <PersonCell
      key="sale"
      value={row.saleHolder?.name}
      missing="Chưa có Sale giữ hành trình này"
    />,
    <PersonCell key="bd" value={row.bdHolder?.name} missing="Chưa có BD giữ hành trình này" />,
    <ContactCell key="contact" row={row} />,
    <OpenCloseCell key="openClose" row={row} />,
  ]
}

export default function WorkstreamsPage() {
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
  const pageCount = Math.max(1, Math.ceil(total / query.size))
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
        <ScreenHeader
          kicker="Sales · Hành trình khách hàng"
          title="Hành trình khách hàng"
          description="Mỗi dòng là MỘT lượt đi của một khách: lead, các cơ hội và hợp đồng sinh ra từ lượt đó."
          meta={
            <>
              <Badge tone="draft">
                <span className="tnum font-num">{total}</span> hành trình
                {dirty ? ' khớp bộ lọc' : ''}
              </Badge>
              {/* `hidden` is the server's count of the scope cut; the screen
                  cannot count rows it never received. */}
              {hidden > 0 && (
                <span className="text-muted-foreground text-[11.5px]">
                  <span className="tnum font-num">{hidden}</span> hành trình ngoài phạm vi của bạn
                  không hiện ở đây
                </span>
              )}
            </>
          }
        />

        <ScreenToolbar label="Lọc sổ hành trình">
          <SegmentedControl
            label="Trạng thái"
            value={query.status}
            options={STATUS_OPTIONS}
            onChange={(v) => {
              const parsed = WorkstreamStatus.safeParse(v)
              if (parsed.success) patch({ status: parsed.data })
            }}
          />
          {/* Reads the raw param, not the parsed query: the contract trims `q`,
              so echoing the parsed value would eat the space between two words
              while the user is still typing. */}
          <SearchField
            className="h-12"
            placeholder="Mã hành trình, tên lead, tên công ty"
            value={params.get('q') ?? ''}
            onChange={(v) => patch({ q: v.trim() === '' ? undefined : v })}
          />
          {query.accountCode !== undefined && (
            <Button
              variant="ghost"
              size="lg"
              className="font-mono"
              aria-label={`Bỏ lọc theo công ty ${query.accountCode}`}
              onClick={() => patch({ accountCode: undefined })}
            >
              {query.accountCode}
              <Icon icon={X} size={16} />
            </Button>
          )}
        </ScreenToolbar>

        <GlassCard variant="b" className="p-0">
          <div className="overflow-x-auto p-4 lg:p-5">
            {isPending ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : error ? (
              <EmptyState
                icon={TriangleAlert}
                message={`Không lấy được sổ hành trình. ${
                  isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
                }`}
                action={{ label: 'Thử lại', onClick: () => void refetch() }}
                className="py-12"
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Inbox}
                message={
                  dirty
                    ? 'Không có hành trình nào khớp bộ lọc đang chọn.'
                    : hidden > 0
                      ? `${hidden} hành trình nằm ngoài phạm vi của bạn nên không hiện ở đây.`
                      : 'Sổ này chỉ có hành trình của các lead đã có sẵn — lead vừa tạo hiện chưa tự mở hành trình nào.'
                }
                action={
                  dirty
                    ? { label: 'Xoá bộ lọc', onClick: clearAll }
                    : { label: 'Mở sổ lead', onClick: () => navigate('/sales/leads') }
                }
                className="py-12"
              />
            ) : (
              <DataTable
                className="min-w-[1200px]"
                sort={tableSort}
                onSort={onSort}
                columns={COLUMNS}
                rows={rows.map((row) => ({
                  id: row.code,
                  onOpen: () => navigate(`/sales/workstreams/${encodeURIComponent(row.code)}`),
                  cells: rowCells(row, navigate),
                }))}
              />
            )}
          </div>
        </GlassCard>

        {total > query.size && (
          <div className="flex justify-end">
            <Pager
              page={pageIndexFromQueryPage(query.page)}
              pageCount={pageCount}
              onPage={(p) => patch({ page: queryPageFromPageIndex(p) })}
            />
          </div>
        )}
      </ScreenLayout>
    </AppShell>
  )
}
