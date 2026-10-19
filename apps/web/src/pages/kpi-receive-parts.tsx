import {
  Badge,
  DataTable,
  GlassCard,
  Icon,
  Minus,
  SectionTitle,
  TrendingDown,
  TrendingUp,
  cn,
  type TableColumn,
} from '@pv/ui'
import { KPI_METRIC_LABEL, type KpiAckState } from '@pv/contracts'
import { answerable, type MyLine, type MyPackage } from '@/data/kpi-personal'
import { ROLE_LABEL } from '@/data/users'
import { dm, dmhm } from '@/lib/date'
import { num } from './home-model'
import { NOTE } from './home-tiles'
import { ACK_LABEL, PACKAGE_LABEL } from './kpi-allocate-model'
import { TargetHistoryButton } from './kpi-history'
import { printCell, printValue } from './kpi-model'
import { AnswerBlock } from './kpi-receive-form'

/** One role's package as the holder reads it: every line in a table, then
 *  the answer block while a line still waits on the holder.
 *
 *  `lastMonth` is last month's ACTUAL, not last month's target, so the
 *  column is labelled as achieved and the change is against what was done. A line under
 *  an open counter is answered by the manager, so it leaves the answer block.
 *  A superseded package is the one in force while the next is drafted: it is
 *  read-only, and its lines' answers belong to no live question, so none is shown. */

const DIRECTION_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus }

/** The assigned value against last month's actual; null with no actual. */
function changeOf({ def, value, lastMonth }: MyLine) {
  if (lastMonth === null) return null
  const diff = value - lastMonth
  if (diff === 0) return { direction: 'flat' as const, text: 'Bằng tháng trước' }
  const gap = Math.abs(diff)
  /* A gap between two rates is in points; "%" would read as a relative change. */
  const size =
    def.unit === 'ratio'
      ? `${num(gap * 100)} điểm`
      : def.unit === 'count'
        ? num(gap)
        : printValue(def.unit, gap, true)
  return {
    direction: diff > 0 ? ('up' as const) : ('down' as const),
    text: `${diff > 0 ? 'Cao hơn' : 'Thấp hơn'} tháng trước ${size}`,
  }
}

function Change({ line }: { line: MyLine }) {
  const change = changeOf(line)
  if (!change) return null
  return (
    <span className="tnum font-num text-foreground inline-flex items-center gap-1 text-[12px] font-semibold leading-4">
      <Icon icon={DIRECTION_ICON[change.direction]} size={14} className="shrink-0" />
      {change.text}
    </span>
  )
}

const COLUMNS: TableColumn[] = [
  { header: 'Chỉ số', width: 'minmax(0,1.6fr)' },
  { header: 'Tháng trước đạt', width: 'minmax(0,1fr)', align: 'right' },
  { header: 'Giao tháng này', width: 'minmax(0,1.4fr)', align: 'right' },
]
const ACK_COLUMN: TableColumn = { header: 'Trạng thái', width: 'minmax(0,1.2fr)' }

const TWO_LINES = 'flex min-w-0 flex-col gap-1'

function cellsOf(line: MyLine, live: boolean) {
  const { def, value, lastMonth, ackState, ackedAt } = line
  const cells = [
    <span key="metric" className={TWO_LINES}>
      <span className="font-semibold">{KPI_METRIC_LABEL[def.key]}</span>
      {!def.higherIsBetter && <span className={NOTE}>Mức tối đa</span>}
    </span>,
    <span key="last" className="tnum font-num">
      {printCell(def.unit, lastMonth)}
    </span>,
    <span key="now" className={cn(TWO_LINES, 'items-end')}>
      <span className="tnum font-num font-semibold">{printValue(def.unit, value)}</span>
      <Change line={line} />
    </span>,
  ]
  if (!live) return cells
  return [
    ...cells,
    <span key="ack" className={cn(TWO_LINES, 'items-start')}>
      <Badge tone={ACK_LABEL[ackState].tone}>{ACK_LABEL[ackState].text}</Badge>
      {ackedAt && (
        <span className={cn(NOTE, 'tnum font-num')}>
          {ackState === 'countered' ? 'Đề xuất gửi lúc' : 'Lúc'} {dmhm(ackedAt)}
        </span>
      )}
    </span>,
  ]
}

/** The package's state, worded for the holder: their own move first. */
function packageAck(lines: readonly MyLine[]): KpiAckState {
  if (lines.some((l) => l.ackState === 'pending')) return 'pending'
  if (lines.some((l) => l.ackState === 'countered')) return 'countered'
  return lines.some((l) => l.ackState === 'lapsed') ? 'lapsed' : 'acknowledged'
}

export function ReceivePackage({
  period,
  closed,
  pack,
  me,
}: {
  period: string
  closed: boolean
  pack: MyPackage
  /** The reader: the history panel reads their own line. */
  me: string | undefined
}) {
  const live = answerable(pack)
  const [firstOpen, ...moreOpen] = live ? pack.lines.filter((l) => l.ackState === 'pending') : []
  const state = live ? ACK_LABEL[packageAck(pack.lines)] : PACKAGE_LABEL[pack.status]

  return (
    <section className="flex flex-col gap-4">
      <SectionTitle
        size="lg"
        hint={
          pack.status === 'submitted' ? 'Mức này chưa được duyệt, có thể còn thay đổi.' : undefined
        }
        actions={
          <>
            <Badge tone={state.tone}>{state.text}</Badge>
            {me && (
              <TargetHistoryButton
                period={period}
                role={pack.role}
                defs={pack.lines.map((l) => l.def)}
                subject={{ actorId: me }}
              />
            )}
          </>
        }
      >
        {ROLE_LABEL[pack.role]}
      </SectionTitle>

      {!closed && pack.ackDueOn && firstOpen && (
        <p className={cn(NOTE, 'tnum font-num')}>Hạn trả lời: {dm(pack.ackDueOn)}</p>
      )}

      <GlassCard variant="b" className="flex flex-col py-4">
        <div className="overflow-x-auto">
          <DataTable
            flush
            rowHeight="min-h-14 py-2"
            className="min-w-3xl"
            columns={live ? [...COLUMNS, ACK_COLUMN] : COLUMNS}
            rows={pack.lines.map((line) => ({ id: line.metricKey, cells: cellsOf(line, live) }))}
          />
        </div>
      </GlassCard>

      {!closed && firstOpen && (
        <AnswerBlock period={period} role={pack.role} lines={[firstOpen, ...moreOpen]} />
      )}
    </section>
  )
}
