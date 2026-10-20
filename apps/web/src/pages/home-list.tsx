import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  Inbox,
  ListChecks,
  Skeleton,
  TriangleAlert,
  cn,
  type TableColumn,
} from '@pv/ui'
import type { WorkstreamBookResponse, WorkstreamRow, WorkstreamScorecard } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { dmy } from '@/lib/date'
import { ContactCell, CustomerCell, StandCell, StatusCell } from '@/components/workstream-cells'
import { bookHrefOf, num, type ListFilter } from './home-model'

/** The priority list: the top of the workstream book's priority ladder, live.
 *
 *  The head follows the canvas design: icon tile, count line, an all / overdue
 *  tab pair and a pill link into the book. Rows are the book's own five
 *  columns and cells, so a run reads the same here and there; no sort and no
 *  paging, because the book opens on the filter this list is showing.
 *  On `.glass-b` (law 8). */

const ROW_PX = 56

const COLUMNS: TableColumn[] = [
  { header: 'Khách hàng', width: 'minmax(220px,2.4fr)' },
  { header: 'Giai đoạn hiện tại', width: 'minmax(260px,2.4fr)' },
  { header: 'Tình trạng', width: 'minmax(160px,1.2fr)' },
  { header: 'Lịch sử liên hệ', width: 'minmax(200px,1.4fr)' },
  { header: 'Ngày bắt đầu', width: '128px' },
]

function cellsOf(row: WorkstreamRow, go: (path: string) => void) {
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

const TAB_LIFT =
  'shadow-[0_1px_2px_color-mix(in_srgb,var(--brand-navy)_10%,transparent),0_4px_12px_color-mix(in_srgb,var(--brand-navy)_8%,transparent)]'

/** A pill tab with its count; the count is left out while the scorecard loads. */
function Tab({
  label,
  count,
  on,
  onPick,
}: {
  label: string
  count: number | undefined
  on: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      className={cn(
        'pointer-coarse:h-12 inline-flex h-8 items-center gap-2 rounded-full px-3 text-[12px] font-semibold',
        'duration-(--motion-duration) ease-(--motion-ease) transition-[background-color,color,box-shadow]',
        'focus-visible:outline-ring focus-visible:outline-2 motion-reduce:transition-none',
        on
          ? cn('bg-card text-foreground', TAB_LIFT)
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            'tnum font-num min-w-5 rounded-full px-1 text-center text-[11px] leading-[18px]',
            on ? 'bg-accent text-accent-foreground' : 'bg-surface-ink/8 text-muted-foreground',
          )}
        >
          {num(count)}
        </span>
      )}
    </button>
  )
}

/** The count line under the title: how many rows show, out of how many in this view. */
function CountLine({ data, filter }: { data: WorkstreamBookResponse; filter: ListFilter | null }) {
  const scope = filter ? ' hành trình đã trễ hạn' : ' hành trình'
  return (
    <span className="text-muted-foreground tnum font-num text-[12px] leading-4">
      <strong className="text-foreground font-semibold">{num(data.rows.length)}</strong> trong{' '}
      {num(data.total)}
      {scope}
      {data.hidden > 0 && (
        <>
          {' · '}
          <span className="text-warning">{num(data.hidden)} nằm ngoài phạm vi của bạn</span>
        </>
      )}
    </span>
  )
}

function ListHead({
  data,
  score,
  filter,
  onFilter,
}: {
  /** Undefined while the first read is in flight, and while a kept read from the
   *  other filter stands in: its counts would describe rows nobody is looking at. */
  data: WorkstreamBookResponse | undefined
  score: WorkstreamScorecard | undefined
  filter: ListFilter | null
  onFilter: (next: ListFilter | null) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-4">
      <div className="flex items-center gap-3">
        <span className="from-warning/10 to-warning/30 text-warning bg-linear-to-br flex size-9 items-center justify-center rounded-xl">
          <Icon icon={ListChecks} size={18} />
        </span>
        <div className="flex flex-col">
          <h3 className="text-[16px] font-semibold leading-6">Việc cần xử lý trước</h3>
          {data && <CountLine data={data} filter={filter} />}
        </div>
      </div>
      <div
        role="group"
        aria-label="Lọc danh sách"
        className="bg-surface-ink/6 flex gap-1 rounded-full p-1"
      >
        <Tab
          label="Tất cả"
          count={filter === null ? data?.total : undefined}
          on={filter === null}
          onPick={() => onFilter(null)}
        />
        <Tab
          label="Đã trễ hạn"
          count={score?.overdue}
          on={filter?.by === 'overdue'}
          onPick={() => onFilter({ by: 'overdue' })}
        />
      </div>
      <Link
        to={bookHrefOf(filter)}
        className={cn(
          'bg-accent text-accent-foreground pointer-coarse:h-12 group ml-auto inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold',
          'focus-visible:outline-ring focus-visible:outline-2',
        )}
      >
        Xem tất cả
        <span className="duration-(--motion-duration) transition-[translate] group-hover:translate-x-1 motion-reduce:transition-none">
          <Icon icon={ArrowRight} size={16} />
        </span>
      </Link>
    </div>
  )
}

export function PriorityList({
  data,
  score,
  error,
  refreshing,
  onRetry,
  filter,
  onFilter,
}: {
  /** Undefined while the first read is in flight. */
  data: WorkstreamBookResponse | undefined
  /** Undefined while loading or after a failed read: the tab counts are left out. */
  score: WorkstreamScorecard | undefined
  error: Error | null
  /** The rows on screen are the previous filter's, kept until the new read lands. */
  refreshing: boolean
  onRetry: () => void
  filter: ListFilter | null
  onFilter: (next: ListFilter | null) => void
}) {
  const navigate = useNavigate()
  const rows = data?.rows ?? []
  /* Data wins over an error: a failed background refetch keeps the last good rows. */
  const empty = data !== undefined && rows.length === 0 && !refreshing

  return (
    <GlassCard
      variant="b"
      aria-label="Việc cần xử lý trước"
      className="starting:translate-y-3 starting:opacity-0 ease-(--motion-ease) overflow-hidden rounded-[24px] transition-[opacity,translate] duration-500 motion-reduce:transition-none"
    >
      <ListHead
        data={refreshing ? undefined : data}
        score={score}
        filter={filter}
        onFilter={onFilter}
      />

      {/* Its own scroll box: under 640px the five columns do not fit, and the
          page itself must not scroll sideways. */}
      <div className="overflow-x-auto" aria-busy={refreshing}>
        {empty ? (
          <EmptyState
            icon={Inbox}
            message={
              filter
                ? 'Không có hành trình nào khớp bộ lọc.'
                : data.hidden > 0
                  ? `${data.hidden} hành trình nằm ngoài phạm vi của bạn.`
                  : 'Chưa có hành trình nào.'
            }
            action={
              filter
                ? { label: 'Bỏ lọc', onClick: () => onFilter(null) }
                : { label: 'Xem sổ lead', onClick: () => navigate('/sales/leads') }
            }
            className="py-12"
          />
        ) : rows.length > 0 ? (
          <DataTable
            flush
            rowHeight="h-14"
            className="min-w-[1000px]"
            columns={COLUMNS}
            rows={rows.map((row) => ({
              id: row.code,
              onOpen: () => navigate(`/sales/workstreams/${encodeURIComponent(row.code)}`),
              cells: cellsOf(row, navigate),
            }))}
          />
        ) : error ? (
          <EmptyState
            tone="danger"
            icon={TriangleAlert}
            message={`Không tải được danh sách hành trình. ${
              isApiError(error) ? userMessage(error) : 'Thử lại.'
            }`}
            action={{ label: 'Thử lại', onClick: onRetry }}
            className="py-12"
          />
        ) : (
          <div className="flex flex-col gap-3 p-5">
            <Skeleton height={ROW_PX} />
            <Skeleton height={ROW_PX} delay={200} />
            <Skeleton height={ROW_PX} delay={400} />
          </div>
        )}
      </div>
    </GlassCard>
  )
}
