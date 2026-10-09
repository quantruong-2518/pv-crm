import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Button,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  Inbox,
  Skeleton,
  TriangleAlert,
  X,
  type TableColumn,
} from '@pv/ui'
import type { WorkstreamBookResponse, WorkstreamRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { dmy } from '@/lib/date'
import { ContactCell, CustomerCell, StandCell, StatusCell } from '@/components/workstream-cells'
import { bookHrefOf, num, type ListFilter } from './home-model'

/** "Handle first": the top of the workstream book's priority ladder, live.
 *
 *  The same five columns and cells as the book, so a run reads the same here
 *  and there; no sort and no paging, because the book is one link away and
 *  opens on the filter this list is showing. On `.glass-b` (law 8). */

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

const filterLabel = (filter: ListFilter) => (filter.by === 'overdue' ? 'Quá hạn' : filter.label)

export function PriorityList({
  data,
  error,
  onRetry,
  filter,
  onClear,
}: {
  /** Undefined while the first read is in flight. */
  data: WorkstreamBookResponse | undefined
  error: Error | null
  onRetry: () => void
  filter: ListFilter | null
  onClear: () => void
}) {
  const navigate = useNavigate()
  const rows = data?.rows ?? []

  return (
    <GlassCard variant="b" aria-label="Cần xử lý trước">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <h3 className="text-[13px] font-semibold leading-5">Cần xử lý trước</h3>
        <span className="text-muted-foreground text-[12px]">hiện tại</span>
        {data && (
          <span className="text-muted-foreground tnum font-num text-[12px]">
            {num(rows.length)} / {num(data.total)} hành trình
            {data.hidden > 0 && (
              <>
                {' · '}
                <span className="text-warning">
                  {num(data.hidden)} không hiển thị do phạm vi dữ liệu
                </span>
              </>
            )}
          </span>
        )}
        {filter && (
          <Button
            variant="ghost"
            size="sm"
            className="pointer-coarse:h-12"
            aria-label={`Bỏ lọc ${filterLabel(filter)}`}
            onClick={onClear}
          >
            {filterLabel(filter)}
            <Icon icon={X} size={16} />
          </Button>
        )}
        <Link
          to={bookHrefOf(filter)}
          className="text-accent-foreground pointer-coarse:min-h-12 ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold hover:underline"
        >
          Xem tất cả
          <Icon icon={ArrowRight} size={16} />
        </Link>
      </div>

      {/* Its own scroll box: under 640px the five columns do not fit, and the
          page itself must not scroll sideways. */}
      <div className="overflow-x-auto">
        {error ? (
          <EmptyState
            icon={TriangleAlert}
            message={`Không tải được danh sách hành trình. ${
              isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
            }`}
            action={{ label: 'Thử lại', onClick: onRetry }}
            className="py-12"
          />
        ) : data === undefined ? (
          <div className="flex flex-col gap-3 p-5">
            <Skeleton height={ROW_PX} />
            <Skeleton height={ROW_PX} delay={200} />
            <Skeleton height={ROW_PX} delay={400} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            message={
              filter
                ? 'Không có hành trình nào phù hợp với bộ lọc hiện tại.'
                : data.hidden > 0
                  ? `${data.hidden} hành trình nằm ngoài phạm vi của bạn nên không hiện ở đây.`
                  : 'Chưa có hành trình nào đang chạy. Hành trình sẽ xuất hiện khi lead bắt đầu được theo dõi.'
            }
            action={
              filter
                ? { label: 'Bỏ lọc', onClick: onClear }
                : { label: 'Xem sổ lead', onClick: () => navigate('/sales/leads') }
            }
            className="py-12"
          />
        ) : (
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
        )}
      </div>
    </GlassCard>
  )
}
