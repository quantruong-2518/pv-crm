import { GlassCard, cn } from '@pv/ui'
import { type KpiCompanyScorecard, type KpiPerson } from '@pv/contracts'
import { message, useI18n, type Message } from '@/app/i18n'
import { StackTable, type StackColumn } from '@/components/stack-table'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { kpiMetricText, kpiRoleText, kpiVerdictText } from '@/data/kpi-i18n'
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

const columnsOf = (t: (copy: Message) => string): StackColumn[] => [
  { header: t(message('Vai trò', 'Role', '역할')), width: 'minmax(0,1.2fr)' },
  { header: t(message('Chỉ số chính', 'Primary metric', '주요 지표')), width: 'minmax(0,1.3fr)' },
  {
    header: t(message('Chỉ tiêu cả phòng', 'Department target', '부서 전체 목표')),
    width: 'minmax(0,1fr)',
    align: 'right',
  },
  { header: t(message('Trạng thái', 'Status', '상태')), width: 'minmax(0,2fr)', stack: 'wide' },
  {
    header: t(message('Chưa nhận chỉ tiêu', 'Target not received', '목표 미수령')),
    width: 'minmax(0,.9fr)',
    align: 'right',
  },
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
            {kpiVerdictText(verdict)} {num(count)}
          </span>
        ))}
      </span>
    </span>
  )
}

function cellsOf(summary: RoleSummary, t: (copy: Message) => string) {
  return [
    <span key="role" className={TWO_LINES}>
      <span className="font-semibold">{kpiRoleText(summary.role)}</span>
      <span className={cn(NOTE, FIGURE)}>
        {t(
          message(
            `${num(summary.holders)} người`,
            `${num(summary.holders)} ${summary.holders === 1 ? 'person' : 'people'}`,
            `${num(summary.holders)}명`,
          ),
        )}
      </span>
    </span>,
    summary.def ? kpiMetricText(summary.def.key) : DASH,
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
  const { t } = useI18n()
  const summaries = roleGroups(people).map((group) => roleSummary(catalog, group, room))
  return (
    <GlassCard variant="b" className="py-4">
      {summaries.length === 0 ? (
        <p className={cn(NOTE, 'px-5')}>
          {t(
            message(
              'Chưa có ai trong phòng Kinh doanh giữ vai trò có KPI.',
              'No one in the Sales department holds a role with KPIs yet.',
              '영업 부서에 KPI가 있는 역할을 맡은 사람이 아직 없습니다.',
            ),
          )}
        </p>
      ) : (
        <StackTable
          from="lg"
          flush
          rowHeight="min-h-14 py-2"
          tableClassName="min-w-3xl"
          columns={columnsOf(t)}
          rows={summaries.map((s) => ({ id: s.role, cells: cellsOf(s, t) }))}
        />
      )}
    </GlassCard>
  )
}
