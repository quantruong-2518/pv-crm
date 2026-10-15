import { DataTable, GlassCard, cn, type TableColumn } from '@pv/ui'
import {
  KPI_METRIC_LABEL,
  KPI_VERDICT_LABEL,
  type KpiCompanyScorecard,
  type KpiPerson,
} from '@pv/contracts'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { ROLE_LABEL } from '@/data/users'
import { num } from './home-model'
import { NOTE } from './home-tiles'
import { DASH, BAR_FILL, printShort, roleGroups, roleSummary, type RoleSummary } from './kpi-model'
import { VerdictBadge } from './kpi-parts'

/** The role table: one row per role held by someone, read on the role's
 *  primary metric. Every row counts how many holders stand at each verdict
 *  of their own reading; a room-scope row adds the room's target and verdict
 *  from the room's card, never from one holder's (see `RoleSummary`).
 *
 *  The stacked bar is hidden from assistive tech: the counts under it print
 *  every segment in words, each behind the swatch of its colour, so the row
 *  is its own legend and no verdict is told by colour alone. */

const COLUMNS: TableColumn[] = [
  { header: 'Vai trò', width: 'minmax(0,1.2fr)' },
  { header: 'Chỉ số chính', width: 'minmax(0,1.3fr)' },
  { header: 'Chỉ tiêu cả phòng', width: 'minmax(0,1fr)', align: 'right' },
  { header: 'Trạng thái', width: 'minmax(0,2fr)' },
  { header: 'Chưa nhận chỉ tiêu', width: 'minmax(0,.9fr)', align: 'right' },
]

const TWO_LINES = 'flex min-w-0 flex-col gap-1'
const FIGURE = 'tnum font-num'

function splitCell(summary: RoleSummary) {
  if (summary.verdicts.length === 0) return DASH
  return (
    <span className={TWO_LINES}>
      {/* A 4px gap keeps two grey segments (unset, no data) from reading as one. */}
      <span aria-hidden className="flex h-2 gap-1">
        {summary.verdicts.map(({ verdict, count }) => (
          <span
            key={verdict}
            className={cn('h-full basis-0 rounded-sm', BAR_FILL[verdict])}
            style={{ flexGrow: count }}
          />
        ))}
      </span>
      <span className={cn(NOTE, FIGURE, 'flex flex-wrap gap-x-3 gap-y-1')}>
        {summary.verdicts.map(({ verdict, count }) => (
          <span key={verdict} className="inline-flex items-center gap-1">
            <span aria-hidden className={cn('size-2 shrink-0 rounded-sm', BAR_FILL[verdict])} />
            {KPI_VERDICT_LABEL[verdict]} {num(count)}
          </span>
        ))}
      </span>
    </span>
  )
}

function cellsOf(summary: RoleSummary) {
  return [
    <span key="role" className={TWO_LINES}>
      <span className="font-semibold">{ROLE_LABEL[summary.role]}</span>
      <span className={cn(NOTE, FIGURE)}>{num(summary.holders)} người</span>
    </span>,
    summary.def ? KPI_METRIC_LABEL[summary.def.key] : DASH,
    summary.def && summary.room ? (
      <span key="target" className={cn(TWO_LINES, 'items-end')}>
        <span className={cn(FIGURE, 'font-semibold')}>
          {printShort(summary.def.unit, summary.room.target)}
        </span>
        <VerdictBadge verdict={summary.room.verdict} />
      </span>
    ) : (
      DASH
    ),
    splitCell(summary),
    <span key="unreceived" className={cn(FIGURE, summary.unreceived > 0 && 'font-semibold')}>
      {num(summary.unreceived)}
    </span>,
  ]
}

export function RolesBlock({
  catalog,
  people,
  room,
}: {
  catalog: KpiCatalog
  people: readonly KpiPerson[]
  /** The room's card; absent while it loads or failed, and then no room target is printed. */
  room: KpiCompanyScorecard | undefined
}) {
  const summaries = roleGroups(people).map((group) => roleSummary(catalog, group, room))
  return (
    <GlassCard variant="b" className="py-4">
      {summaries.length === 0 ? (
        <p className={cn(NOTE, 'px-5')}>Chưa có ai trong phòng Kinh doanh giữ vai trò có KPI.</p>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            flush
            rowHeight="min-h-14 py-2"
            className="min-w-3xl"
            columns={COLUMNS}
            rows={summaries.map((s) => ({ id: s.role, cells: cellsOf(s) }))}
          />
        </div>
      )}
    </GlassCard>
  )
}
