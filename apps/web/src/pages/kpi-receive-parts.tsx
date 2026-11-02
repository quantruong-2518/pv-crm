import { Badge, GlassCard, Icon, Minus, SectionTitle, TrendingDown, TrendingUp, cn } from '@pv/ui'
import { StackTable, type StackColumn } from '@/components/stack-table'
import { answerable, type MyLine, type MyPackage } from '@/data/kpi-personal'
import { kpiAckText, kpiMetricText, kpiPackageText, kpiRoleText } from '@/data/kpi-i18n'
import { getLang, message, useI18n } from '@/app/i18n'
import { dm, dmhm } from '@/lib/date'
import { num } from './home-model'
import { NOTE } from './home-tiles'
import { ACK_LABEL, PACKAGE_LABEL, missedDueOf } from './kpi-allocate-model'
import { AckCounts } from './kpi-allocate-parts'
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
 *  read-only, and its lines' answers belong to no live question, so none is shown,
 *  except "accepted by default": that target still applies unconfirmed (ADR 0114). */

const DIRECTION_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus }

/** The assigned value against last month's actual; null with no actual. */
function changeOf({ def, value, lastMonth }: MyLine) {
  if (lastMonth === null) return null
  const diff = value - lastMonth
  if (diff === 0) return { direction: 'flat' as const, diff, size: '' }
  const gap = Math.abs(diff)
  /* A gap between two rates is in points; "%" would read as a relative change. */
  const size =
    def.unit === 'ratio'
      ? `${num(gap * 100)}`
      : def.unit === 'count'
        ? num(gap)
        : printValue(def.unit, gap, true)
  return { direction: diff > 0 ? ('up' as const) : ('down' as const), diff, size }
}

function Change({ line }: { line: MyLine }) {
  const { t } = useI18n()
  const change = changeOf(line)
  if (!change) return null
  return (
    <span className="tnum font-num text-foreground inline-flex items-center gap-1 text-[12px] font-semibold leading-4">
      <Icon icon={DIRECTION_ICON[change.direction]} size={14} className="shrink-0" />
      {change.diff === 0
        ? t(message('Bằng tháng trước', 'Same as last month', '지난달과 동일'))
        : t(
            message(
              `${change.diff > 0 ? 'Cao hơn' : 'Thấp hơn'} tháng trước ${change.size}${line.def.unit === 'ratio' ? ' điểm' : ''}`,
              `${change.diff > 0 ? 'Above' : 'Below'} last month by ${change.size}${line.def.unit === 'ratio' ? ' percentage points' : ''}`,
              `지난달보다 ${change.size}${line.def.unit === 'ratio' ? '%p' : ''}${change.diff > 0 ? ' 높음' : ' 낮음'}`,
            ),
          )}
    </span>
  )
}

const TWO_LINES = 'flex min-w-0 flex-col gap-1'

function cellsOf(line: MyLine, live: boolean, t: ReturnType<typeof useI18n>['t']) {
  const { def, value, lastMonth, ackState, ackedAt } = line
  const missed = missedDueOf(line)
  const cells = [
    <span key="metric" className={TWO_LINES}>
      <span className="font-semibold">{kpiMetricText(def.key)}</span>
      {!def.higherIsBetter && (
        <span className={NOTE}>{message('Mức tối đa', 'Maximum', '최대')[getLang()]}</span>
      )}
    </span>,
    <span key="last" className="tnum font-num">
      {printCell(def.unit, lastMonth)}
    </span>,
    <span key="now" className={cn(TWO_LINES, 'items-end')}>
      <span className="tnum font-num font-semibold">{printValue(def.unit, value)}</span>
      <Change line={line} />
      {!live && ackState === 'lapsed' && <span className={NOTE}>{kpiAckText('lapsed')}</span>}
    </span>,
  ]
  if (!live) return cells
  return [
    ...cells,
    <span key="ack" className={cn(TWO_LINES, 'items-start')}>
      <Badge tone={ACK_LABEL[ackState].tone}>{kpiAckText(ackState)}</Badge>
      {/* A carried lapsed line's stamp is when its deadline ran out, not an answer. */}
      {ackedAt && ackState !== 'lapsed' && (
        <span className={cn(NOTE, 'tnum font-num')}>
          {t(
            message(
              ackState === 'countered' ? 'Đề xuất gửi lúc' : 'Lúc',
              ackState === 'countered' ? 'Proposal sent' : 'Responded',
              ackState === 'countered' ? '제안 제출' : '응답',
            ),
          )}{' '}
          {dmhm(ackedAt)}
        </span>
      )}
      {missed && (
        <span className={cn(NOTE, 'tnum font-num')}>
          {t(
            message(
              `Đã quá hạn trả lời ${missed}`,
              `Response deadline ${missed} passed`,
              `응답 기한 ${missed} 경과`,
            ),
          )}
        </span>
      )}
    </span>,
  ]
}

export function ReceivePackage({
  period,
  closed,
  pack,
  me,
  team,
}: {
  period: string
  closed: boolean
  pack: MyPackage
  /** The reader: the history panel reads their own line. */
  me: string | undefined
  /** Name of the team whose package this is; absent on a room package. */
  team?: string
}) {
  const { t } = useI18n()
  const columns: StackColumn[] = [
    { header: t(message('Chỉ số', 'Metric', '지표')), width: 'minmax(0,1.6fr)' },
    {
      header: t(message('Tháng trước đạt', 'Last month actual', '지난달 실적')),
      width: 'minmax(0,1fr)',
      align: 'right',
    },
    {
      header: t(message('Giao tháng này', 'Assigned this month', '이번 달 배정')),
      width: 'minmax(0,1.4fr)',
      align: 'right',
    },
  ]
  const ackColumn: StackColumn = {
    header: t(message('Trạng thái', 'Status', '상태')),
    width: 'minmax(0,1.2fr)',
  }
  const live = answerable(pack)
  const [firstOpen, ...moreOpen] = live ? pack.lines.filter((l) => l.ackState === 'pending') : []
  const state = PACKAGE_LABEL[pack.status]

  return (
    <section className="flex flex-col gap-4">
      <SectionTitle
        size="md"
        hint={
          pack.status === 'submitted'
            ? t(
                message(
                  'Mức này chưa được duyệt, có thể còn thay đổi.',
                  'This target has not been approved yet and may change.',
                  '아직 승인되지 않은 목표이며 변경될 수 있습니다.',
                ),
              )
            : undefined
        }
        actions={
          <>
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
        {team ? `${kpiRoleText(pack.role)} · ${team}` : kpiRoleText(pack.role)}
      </SectionTitle>

      {!closed && pack.ackDueOn && firstOpen && (
        <p className={cn(NOTE, 'tnum font-num')}>
          {t(message('Hạn trả lời:', 'Response deadline:', '응답 기한:'))} {dm(pack.ackDueOn)}
        </p>
      )}

      <GlassCard variant="b" className="flex flex-col gap-3 py-4">
        <div className="px-5">
          {live ? (
            <AckCounts lines={pack.lines} />
          ) : (
            <Badge tone={state.tone}>{kpiPackageText(pack.status)}</Badge>
          )}
        </div>
        <StackTable
          from="lg"
          flush
          rowHeight="min-h-14 py-2"
          tableClassName="min-w-3xl"
          columns={live ? [...columns, ackColumn] : columns}
          rows={pack.lines.map((line) => ({ id: line.metricKey, cells: cellsOf(line, live, t) }))}
        />
      </GlassCard>

      {!closed && firstOpen && (
        <AnswerBlock period={period} role={pack.role} lines={[firstOpen, ...moreOpen]} />
      )}
    </section>
  )
}
