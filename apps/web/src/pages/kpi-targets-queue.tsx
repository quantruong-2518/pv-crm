import { useNavigate } from 'react-router-dom'
import { Button, GlassCard, cn } from '@pv/ui'
import {
  KPI_METRIC_LABEL,
  type KpiAllocation,
  type KpiCounter,
  type OverdueReasonRow,
  type RoleId,
} from '@pv/contracts'
import { primaryOf, type KpiCatalog } from '@/data/kpi-catalog'
import { ROLE_LABEL } from '@/data/users'
import { dm } from '@/lib/date'
import { num } from './home-model'
import { NOTE } from './home-tiles'
import { defOfCounter, headlineOf, teamSuffix } from './kpi-allocate-model'
import { MonthCloseBar } from './kpi-month-close'
import { printShort } from './kpi-model'
import { stepId, teamStepId, type QueueItem, type Waiting } from './kpi-targets-model'

/** What waits on the reader of the targets screen, as `waitingOf` built it: the
 *  queue items, the overdue reasons the reader may decide, and an ended month
 *  left to close, in one list.
 *
 *  An item states what happened and opens where it is answered; it answers
 *  nothing itself. A role's step is on this screen, so the button picks the
 *  role and scrolls to it; a counter opens in a drawer; a reason opens its
 *  installment. Closing is the one action taken in the row, behind its dialog.
 *
 *  A total is printed only where the package carries one: a metric that does
 *  not add up across people has `allocated: null`, and no sum is made here. */

/** Who sent which role's package on which day, and its primary total where it has one. */
function packageSentence(catalog: KpiCatalog, pkg: KpiAllocation): string {
  const role = pkg.team ? `${ROLE_LABEL[pkg.role]} của nhóm ${pkg.team.name}` : ROLE_LABEL[pkg.role]
  const head = pkg.submittedBy
    ? `${pkg.submittedBy.name} gửi gói chỉ tiêu ${role}`
    : `Gói chỉ tiêu ${role} đã gửi`
  const day = pkg.submittedAt ? ` ngày ${dm(pkg.submittedAt)}` : ''
  const def = primaryOf(catalog, pkg.role)
  const total = def && pkg.totals.find((t) => t.metricKey === def.key)?.allocated
  const sum =
    def && typeof total === 'number'
      ? `, tổng ${KPI_METRIC_LABEL[def.key].toLowerCase()} ${printShort(def.unit, total)}`
      : ''
  return `${head}${day}${sum}.`
}

/** What happened, the line under it, the button's word, and what it opens. */
type Row = {
  id: string
  at: string
  what: string
  under: string | null
  open: string
  go: { step: RoleId; ids: string[] } | { counter: KpiCounter } | { href: string }
}

function rowOf(catalog: KpiCatalog, item: QueueItem): Row {
  const base = { id: item.id, at: item.at }
  switch (item.kind) {
    case 'targets':
      return {
        ...base,
        what: `${item.who} đề nghị chỉ tiêu ${ROLE_LABEL[item.role]} ngày ${dm(item.at)}.`,
        under: `${num(item.metrics)} chỉ số chờ duyệt`,
        open: 'Duyệt chỉ tiêu',
        go: { step: item.role, ids: [stepId(item.role, 'total')] },
      }
    case 'package': {
      const { role, team } = item.pkg
      const ids = team ? [teamStepId(role, team.id)] : [stepId(role, 'lock'), stepId(role, 'ack')]
      return {
        ...base,
        what: packageSentence(catalog, item.pkg),
        under: null,
        open: 'Duyệt gói chỉ tiêu',
        go: { step: role, ids },
      }
    }
    case 'returned':
      return {
        ...base,
        what: `${item.pkg.decidedBy?.name ?? 'Quản lý'} trả lại gói chỉ tiêu ${ROLE_LABEL[item.pkg.role]} ngày ${dm(item.at)}.`,
        under: null,
        open: 'Sửa phân bổ',
        go: { step: item.pkg.role, ids: [stepId(item.pkg.role, 'split')] },
      }
    case 'counter': {
      const c = item.counter
      const def = defOfCounter(c)
      return {
        ...base,
        what: `${def ? headlineOf(c, def) : c.name}.`,
        under: `${ROLE_LABEL[c.role]}${teamSuffix(c.team)} · gửi ngày ${dm(c.createdAt)}`,
        open: 'Xem đề xuất',
        go: { counter: c },
      }
    }
  }
}

const reasonRow = (r: OverdueReasonRow): Row => ({
  id: `reason/${r.id}`,
  at: r.writtenAt,
  what: `${r.writtenBy.name} ghi lý do quá hạn cho hợp đồng ${r.contractCode}, đợt ${r.installmentNo}.`,
  under: `Hạn đợt ${dm(r.due)} · ghi ngày ${dm(r.writtenAt)}`,
  open: 'Mở đợt thanh toán',
  go: {
    href: `/sales/contracts/${encodeURIComponent(r.contractCode)}/installments/${r.installmentNo}`,
  },
})

/** Also the company door's line when its count is zero. */
export const NOTHING_WAITING = 'Không có mục nào chờ bạn xử lý.'

const LINE = 'flex min-h-14 flex-col gap-2 px-5 py-2 text-[12.5px] leading-5'

export function WaitingList({
  catalog,
  waiting: { items, reasons, closing },
  reasonsFailed,
  onOpenStep,
  onOpenCounter,
}: {
  catalog: KpiCatalog
  waiting: Waiting
  reasonsFailed: boolean
  /** Picks the role and scrolls to the first of these sections it draws. */
  onOpenStep: (role: RoleId, ids: string[]) => void
  onOpenCounter: (counter: KpiCounter) => void
}) {
  const navigate = useNavigate()
  const rows = [...items.map((i) => rowOf(catalog, i)), ...reasons.map(reasonRow)].sort((a, b) =>
    a.at.localeCompare(b.at),
  )
  const open = ({ go }: Row) => {
    if ('step' in go) onOpenStep(go.step, go.ids)
    else if ('counter' in go) onOpenCounter(go.counter)
    else navigate(go.href)
  }
  const failed = reasonsFailed && (
    <p className={cn(NOTE, 'text-destructive-foreground px-5 py-2')}>
      Không tải được lý do quá hạn chờ duyệt.
    </p>
  )

  if (rows.length === 0 && !closing) {
    return (
      <GlassCard variant="b" className="p-5">
        {failed || <p className={NOTE}>{NOTHING_WAITING}</p>}
      </GlassCard>
    )
  }

  /* A list, not a table: below `sm` the button drops under its sentence instead
     of sitting past a sideways scroll. */
  return (
    <GlassCard variant="b" className="py-2">
      <ul aria-label="Chờ bạn xử lý" className="divide-surface-ink/6 flex flex-col divide-y">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn(LINE, 'sm:flex-row sm:items-center sm:justify-between sm:gap-4')}
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="tnum font-num">{row.what}</span>
              {row.under && <span className={cn(NOTE, 'tnum font-num')}>{row.under}</span>}
            </span>
            <Button
              variant="secondary"
              className="pointer-coarse:h-12 shrink-0 self-start sm:self-center"
              onClick={() => open(row)}
            >
              {row.open}
            </Button>
          </li>
        ))}
        {closing && (
          <li className={cn(LINE, 'justify-center')}>
            <MonthCloseBar period={closing} monthClose={null} />
          </li>
        )}
      </ul>
      {failed}
    </GlassCard>
  )
}
