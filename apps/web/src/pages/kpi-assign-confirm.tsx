import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Badge, Button, Check, GlassCard, Icon, cn } from '@pv/ui'
import {
  KPI_METRIC_LABEL,
  kpiMetricShare,
  type KpiAssignmentLine,
  type KpiAssignmentMineResponse,
  type KpiMetricDef,
  type RoleId,
} from '@pv/contracts'
import { toastDone } from '@/app/toast'
import {
  kpiAssignmentMineQuery,
  kpiAssignmentPageQuery,
  useConfirmKpiAssignment,
} from '@/data/kpi-assignment'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { ROLE_LABEL } from '@/data/users'
import { dm } from '@/lib/date'
import { NOTE, TILE } from './home-tiles'
import { FailLine } from './kpi-allocate-parts'
import {
  COPIED_WORD,
  PERSON_STATE_LABEL,
  TIERED_SENTENCE,
  assignHref,
  leftText,
  printTarget,
} from './kpi-assign-model'
import { NAME_LINK } from './kpi-company-forecast'
import { SideFailure } from './kpi-me-parts'
import { printValue } from './kpi-model'

/** The tiered month on the personal KPI screen (ADR 0120 §5, §8): the lines handed to
 *  the reader for one role, a changed line flagged, a copied line marked as
 *  shared, the one button that confirms them all by the 28th, and who to write
 *  to about them. Past the deadline or with nothing left the card states it; a
 *  409 on the press only rereads the lines, whose own state then says so.
 *
 *  Also here: the head's door to the assignment page, and the note old target
 *  screens show on a tiered month instead of doors that would refuse. */

const ROW = 'bg-surface-ink/5 flex min-h-14 items-center gap-3 rounded-lg px-3 py-2'

function noteOf(
  mine: KpiAssignmentMineResponse,
  line: KpiAssignmentLine,
  def: KpiMetricDef,
): { text: string; changed: boolean } | null {
  if (line.kind === 'total') return { text: 'Chỉ tiêu cả công ty', changed: false }
  const before = mine.changedFrom.find((c) => c.metricKey === line.metricKey)
  /* The bare figure: `printTarget` would add its ceiling word after the verb. */
  if (before && !line.confirmedAt)
    return { text: `Đổi từ ${printValue(def.unit, before.value, true)}`, changed: true }
  return kpiMetricShare(def) === 'copied' ? { text: COPIED_WORD, changed: false } : null
}

function Answer({ mine, closed }: { mine: KpiAssignmentMineResponse; closed: boolean }) {
  const confirm = useConfirmKpiAssignment(mine.period, mine.role)
  const open = mine.lines.some((l) => l.kind === 'person' && !l.confirmedAt)
  const left = leftText(mine.deadline)

  if (mine.confirmedAt)
    return (
      <Badge tone="success" className="tnum font-num self-start">
        Đã xác nhận {dm(mine.confirmedAt)}
      </Badge>
    )
  if (mine.acceptedByDefault)
    return (
      <Badge tone="warning" className="self-start">
        {PERSON_STATE_LABEL.defaulted.text}
      </Badge>
    )
  if (!open || closed || left === null) return null
  return (
    <div className="flex flex-col gap-2">
      <p className={cn(NOTE, 'tnum font-num')}>
        Hạn xác nhận {dm(mine.deadline)} · {left}. Quá hạn sẽ tính là nhận mặc định.
      </p>
      <Button
        className="pointer-coarse:h-12 w-full sm:w-auto sm:self-start"
        disabled={confirm.isPending}
        onClick={() =>
          confirm.mutate(undefined, { onSuccess: () => toastDone('Đã xác nhận chỉ tiêu') })
        }
      >
        <Icon icon={Check} size={16} />
        Xác nhận chỉ tiêu
      </Button>
      {confirm.error?.kind !== 'conflict' && <FailLine error={confirm.error} />}
    </div>
  )
}

export function ConfirmCard({
  catalog,
  period,
  role,
  closed,
}: {
  catalog: KpiCatalog
  period: string
  role: RoleId
  closed: boolean
}) {
  const mine = useQuery(kpiAssignmentMineQuery(period, role))
  if (mine.error) return <SideFailure what="chỉ tiêu được giao" retry={() => void mine.refetch()} />
  const data = mine.data
  if (!data || data.lines.length === 0) return null
  const defOf = (l: KpiAssignmentLine) => catalog[role].find((d) => d.key === l.metricKey)

  return (
    <GlassCard className={cn(TILE, 'gap-4 p-5')}>
      <div className="flex flex-col gap-1">
        <h2 className="text-[14px] font-semibold leading-5">
          Chỉ tiêu được giao · {ROLE_LABEL[role]}
        </h2>
        {data.sentBy && data.sentAt && (
          <span className={cn(NOTE, 'tnum font-num')}>
            {data.sentBy.name} {(data.version ?? 1) > 1 ? 'sửa' : 'giao'} {dm(data.sentAt)}
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {data.lines.flatMap((line) => {
          const def = defOf(line)
          if (!def) return []
          const note = noteOf(data, line, def)
          return [
            <li key={`${line.kind}|${line.metricKey}`} className={ROW}>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[12.5px]">{KPI_METRIC_LABEL[line.metricKey]}</span>
                {note &&
                  (note.changed ? (
                    <Badge tone="warning" className="tnum font-num self-start">
                      {note.text}
                    </Badge>
                  ) : (
                    <span className={NOTE}>{note.text}</span>
                  ))}
              </span>
              <span className="tnum font-num text-[14px] font-semibold">
                {printTarget(def, line.value)}
              </span>
            </li>,
          ]
        })}
      </ul>
      <Answer mine={data} closed={closed} />
      {data.contact && !closed && (
        <p className={NOTE}>
          Thấy chưa đúng? Gửi thư cho{' '}
          <a href={`mailto:${data.contact.email}`} className={NAME_LINK}>
            {data.contact.name}
          </a>
        </p>
      )}
    </GlassCard>
  )
}

/** For a head: the door to the assignment page. The read answers 404 to
 *  someone who heads nothing, and the door is then simply absent. */
export function AssignLink({ period, role }: { period: string; role: RoleId }) {
  const navigate = useNavigate()
  const page = useQuery(kpiAssignmentPageQuery(period, role, null))
  if (!page.data) return null
  return (
    <Button
      variant="secondary"
      className="pointer-coarse:h-12 self-start"
      onClick={() => navigate(assignHref(period))}
    >
      Giao chỉ tiêu · {page.data.unit.name}
      <Icon icon={ArrowRight} size={16} />
    </Button>
  )
}

/** On an old target screen for a tiered month: one sentence and the way there. */
export function TieredNote({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate()
  return (
    <GlassCard className={cn(TILE, 'sm:flex-row sm:items-center sm:justify-between')}>
      <p className="text-[12.5px] leading-5">{TIERED_SENTENCE}</p>
      <Button
        variant="secondary"
        className="pointer-coarse:h-12 shrink-0 self-start sm:self-center"
        onClick={() => navigate(to)}
      >
        {label}
        <Icon icon={ArrowRight} size={16} />
      </Button>
    </GlassCard>
  )
}
