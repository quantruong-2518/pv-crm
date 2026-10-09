import type { ReactNode } from 'react'
import {
  Badge,
  CircleCheck,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  Users,
  cn,
  type TableColumn,
} from '@pv/ui'
import { KPI_METRIC_LABEL, type KpiPerson } from '@pv/contracts'
import { ROLE_LABEL } from '@/data/users'
import { num } from './home-model'
import { NOTE } from './home-tiles'
import {
  DASH,
  exceptionRows,
  personRows,
  printCell,
  shortfallOf,
  unjudgedRoles,
  type PersonRow,
} from './kpi-model'
import { VerdictBadge } from './kpi-parts'

/** The two blocks only a `kpi.view-all` holder sees, both fed by
 *  `GET /sales/kpi/:period/people`: the exceptions a manager reads first, and
 *  every person's scorecards as one compact table.
 *
 *  One line is one person × role × metric. The exceptions table prints the
 *  verdict UNDER the metric instead of in a last column: on a narrow screen
 *  the table scrolls sideways and the verdict is the one cell that must not
 *  be scrolled off. */

const LEAD_COLUMNS: TableColumn[] = [
  { header: 'Nhân sự', width: 'minmax(0,1.2fr)' },
  { header: 'Vai trò', width: 'minmax(0,1.3fr)' },
  { header: 'Chỉ số', width: 'minmax(0,1.8fr)' },
  { header: 'Thực tế', width: 'minmax(0,1fr)', align: 'right' },
  { header: 'Chỉ tiêu', width: 'minmax(0,1fr)', align: 'right' },
]
const STATE_COLUMN: TableColumn = { header: 'Trạng thái', width: 'minmax(0,1fr)' }

const TWO_LINES = 'flex min-w-0 flex-col items-start gap-1'
const FIGURE = 'tnum font-num'

/** `full` is the everyone table: the verdict has its own column, the
 *  acknowledgement prints under the role, and a continuation line keeps its
 *  person and role for a screen reader only. */
function cellsOf(row: PersonRow, full: boolean): ReactNode[] {
  const { item, acknowledgement: ack } = row
  const person = (
    <span className={row.opensPerson ? 'font-semibold' : 'sr-only'}>{row.person.name}</span>
  )
  const role = row.opensRole ? (
    <span className={TWO_LINES}>
      <span>{ROLE_LABEL[row.role]}</span>
      {full && <span className={cn(NOTE, FIGURE)}>{ack.text}</span>}
    </span>
  ) : (
    <span className="sr-only">{ROLE_LABEL[row.role]}</span>
  )

  if (item === null) {
    return [
      person,
      role,
      <span key="metric" className={TWO_LINES}>
        <span>Xác nhận đã nhận chỉ tiêu</span>
        <Badge tone="warning">{ack.state === 'stale' ? 'Cần nhận lại' : 'Chưa nhận'}</Badge>
      </span>,
      DASH,
      DASH,
    ]
  }

  const { def, reading } = item
  const shortfall = shortfallOf(item)
  const verdict = <VerdictBadge key="verdict" verdict={reading.verdict} />
  const cells = [
    person,
    role,
    <span key="metric" className={TWO_LINES}>
      <span>{KPI_METRIC_LABEL[def.key]}</span>
      {!full && verdict}
      {shortfall && <span className={cn(NOTE, FIGURE)}>{shortfall}</span>}
    </span>,
    <span key="value" className={FIGURE}>
      {printCell(def.unit, reading.value)}
    </span>,
    <span key="target" className={FIGURE}>
      {printCell(def.unit, reading.target)}
    </span>,
  ]
  return full ? [...cells, verdict] : cells
}

function PeopleRows({ rows, full }: { rows: PersonRow[]; full: boolean }) {
  return (
    <div className="overflow-x-auto">
      <DataTable
        flush
        rowHeight="min-h-12 py-2"
        className="min-w-3xl"
        columns={full ? [...LEAD_COLUMNS, STATE_COLUMN] : LEAD_COLUMNS}
        rows={rows.map((row) => ({ id: row.id, cells: cellsOf(row, full) }))}
      />
    </div>
  )
}

/** Readings behind or missed, and targets nobody has received yet. With no
 *  approved target nothing can be judged, so that is said instead of an
 *  all-clear. */
export function AttentionBlock({ people }: { people: readonly KpiPerson[] }) {
  const rows = exceptionRows(people)
  const unjudged = unjudgedRoles(people)
  return (
    <GlassCard variant="b" className="flex flex-col gap-3 py-4">
      {unjudged > 0 && (
        <p className="px-5 text-[12.5px] leading-5">
          <span className={FIGURE}>{num(unjudged)}</span> vai trò chưa có chỉ tiêu được duyệt trong
          tháng này, nên chưa đánh giá được chỉ số của các vai trò đó.
        </p>
      )}
      {rows.length > 0 && <PeopleRows rows={rows} full={false} />}
      {rows.length === 0 && unjudged === 0 && (
        <p className="flex items-center gap-2 px-5 text-[12.5px] leading-5">
          <Icon icon={CircleCheck} size={16} className="text-success shrink-0" />
          Không có chỉ số nào chậm nhịp hoặc không đạt, và mọi người đã nhận chỉ tiêu.
        </p>
      )}
    </GlassCard>
  )
}

/** Every person's scorecards. */
export function PeopleBlock({
  people,
  onRetry,
}: {
  people: readonly KpiPerson[]
  onRetry: () => void
}) {
  const rows = personRows(people)
  return (
    <GlassCard variant="b" className="py-4">
      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          message="Chưa có nhân sự nào trong phòng Kinh doanh giữ vai trò có KPI."
          action={{ label: 'Tải lại', onClick: onRetry }}
          className="py-8"
        />
      ) : (
        <PeopleRows rows={rows} full />
      )}
    </GlassCard>
  )
}
