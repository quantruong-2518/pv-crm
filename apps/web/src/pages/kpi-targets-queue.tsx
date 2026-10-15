import { useNavigate } from 'react-router-dom'
import { Button, GlassCard, cn } from '@pv/ui'
import {
  KPI_METRIC_LABEL,
  type KpiAllocation,
  type KpiRoleTargets,
  type RoleId,
} from '@pv/contracts'
import { primaryOf, type KpiCatalog } from '@/data/kpi-catalog'
import { ROLE_LABEL } from '@/data/users'
import { dm } from '@/lib/date'
import { num } from './home-model'
import { NOTE } from './home-tiles'
import { ALLOCATE_PATH, roleQuery } from './kpi-allocate-model'
import { printShort } from './kpi-model'
import { queueOf, type QueueItem } from './kpi-targets-model'

/** The approval queue of the targets screen, listed from `queueOf`.
 *
 *  An item states what happened and opens where it is approved; it approves
 *  nothing itself. A role target is agreed from its table, where the pending
 *  values are on screen (the server locks only what the agreer saw), and a
 *  package is decided on the allocation screen, which owns that write.
 *
 *  A total is printed only where the package carries one: a metric that does
 *  not add up across people has `allocated: null`, and no sum is made here. */

/** Who sent which role's package on which day, and its primary total where it has one. */
function packageSentence(catalog: KpiCatalog, pkg: KpiAllocation): string {
  const role = ROLE_LABEL[pkg.role]
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

const OPEN = 'pointer-coarse:h-12 shrink-0 self-start sm:self-center'

export function ApprovalQueue({
  catalog,
  period,
  roles,
  packages,
  me,
  canAct,
  canOpenPackage,
  onOpenRole,
}: {
  catalog: KpiCatalog
  period: string
  roles: readonly KpiRoleTargets[]
  packages: readonly KpiAllocation[]
  me: string | undefined
  /** Holds `kpi.set-target` on an open month: the queue is "waiting on you". */
  canAct: boolean
  /** Holds `kpi.view-all`, which the allocation screen asks for. */
  canOpenPackage: boolean
  /** Shows the role's table in step 1. */
  onOpenRole: (role: RoleId) => void
}) {
  const navigate = useNavigate()
  const items = queueOf(catalog, roles, packages, canAct ? me : undefined)

  if (items.length === 0) {
    return (
      <GlassCard variant="b" className="p-5">
        <p className={NOTE}>
          {canAct ? 'Không có mục nào chờ bạn duyệt.' : 'Không có mục nào chờ duyệt.'}
        </p>
      </GlassCard>
    )
  }

  const cellsOf = (item: QueueItem) => {
    if (item.kind === 'targets') {
      return [
        <span key="what" className="flex min-w-0 flex-col gap-1">
          <span>
            {item.who} đề nghị chỉ tiêu {ROLE_LABEL[item.role]} ngày {dm(item.at)}.
          </span>
          <span className={cn(NOTE, 'tnum font-num')}>{num(item.metrics)} chỉ số chờ duyệt</span>
        </span>,
        <Button
          key="open"
          variant="secondary"
          className={OPEN}
          onClick={() => onOpenRole(item.role)}
        >
          Mở bảng chỉ tiêu
        </Button>,
      ]
    }
    return [
      <span key="what" className="min-w-0">
        {packageSentence(catalog, item.pkg)}
      </span>,
      canOpenPackage ? (
        <Button
          key="open"
          variant="secondary"
          className={OPEN}
          onClick={() => navigate(`${ALLOCATE_PATH}${roleQuery(period, item.pkg.role)}`)}
        >
          Mở gói chỉ tiêu
        </Button>
      ) : null,
    ]
  }

  /* A list, not a table: below `sm` the button drops under its sentence instead
     of sitting past a sideways scroll. */
  return (
    <GlassCard variant="b" className="py-2">
      <ul aria-label="Việc chờ duyệt" className="divide-surface-ink/6 flex flex-col divide-y">
        {items.map((item) => {
          const [what, open] = cellsOf(item)
          return (
            <li
              key={item.id}
              className="flex min-h-14 flex-col gap-2 px-5 py-2 text-[12.5px] leading-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              {what}
              {open}
            </li>
          )
        })}
      </ul>
    </GlassCard>
  )
}
