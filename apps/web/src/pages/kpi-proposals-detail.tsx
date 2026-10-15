import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, GlassCard, Input, cn } from '@pv/ui'
import {
  KPI_METRIC_LABEL,
  type KpiAllocation,
  type KpiAllocationStatus,
  type KpiCounter,
  type KpiCounterResolveBody,
  type KpiMetricDef,
} from '@pv/contracts'
import { toast, toastDone } from '@/app/toast'
import { useResolveKpiCounter } from '@/data/kpi-allocation'
import { ROLE_LABEL } from '@/data/users'
import { dmhm } from '@/lib/date'
import { NOTE, TILE } from './home-tiles'
import { ALLOCATE_PATH, COUNTER_LABEL, MOVED, defOfCounter, roleQuery } from './kpi-allocate-model'
import { FailLine } from './kpi-allocate-parts'
import { UNIT_WORD, parseTyped, printValue } from './kpi-model'

/** The right pane of the proposals screen: one counter or one returned package.
 *
 *  A counter opens on what happened, then the reason in the holder's words,
 *  last month's actual (the assigned and proposed values are already in the
 *  headline and on the buttons), what accepting would do to the role's split,
 *  and the three answers. Every figure is the server's. Only an open counter
 *  carries its "from": once settled, `assigned` reads the line as it now stands. */

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)
const FIGURE = 'tnum font-num font-semibold'

function headlineOf(c: KpiCounter, def: KpiMetricDef): string {
  const metric = lower(KPI_METRIC_LABEL[c.metricKey])
  const to = printValue(def.unit, c.proposed, true)
  if (c.status !== 'open') return `${c.name} đề xuất ${metric} ${to}`
  const from = printValue(def.unit, c.assigned, true)
  if (c.proposed === c.assigned) return `${c.name} đề xuất giữ ${metric} ở ${to}`
  return c.proposed < c.assigned
    ? `${c.name} xin giảm ${metric} từ ${from} xuống ${to}`
    : `${c.name} xin tăng ${metric} từ ${from} lên ${to}`
}

function effectLines(c: KpiCounter, def: KpiMetricDef): string[] {
  const { allocatedAfter, roleTarget, shortfall, compensators } = c.effect
  const print = (v: number) => printValue(def.unit, v)
  if (allocatedAfter === null) return ['Chỉ số này không cộng dồn, tổng của vai trò không đổi.']
  const after = `Tổng sau khi đồng ý: ${print(allocatedAfter)}`
  if (roleTarget === null) return [`${after}. Vai trò chưa có chỉ tiêu được duyệt.`]
  if (allocatedAfter > roleTarget) {
    return [`${after} · thừa ${print(allocatedAfter - roleTarget)} so với chỉ tiêu vai trò.`]
  }
  if (!shortfall) return [`${after} · vẫn khớp chỉ tiêu vai trò.`]
  const gap = `${after} · thiếu ${print(shortfall)} so với chỉ tiêu vai trò.`
  if (compensators.length === 0) return [gap, 'Chưa có ai đúng tiến độ để bù phần thiếu.']
  const who = compensators.map((p) => `${p.name} thêm ${print(p.delta)}`).join(' · ')
  return [gap, `Gợi ý bù từ người đang đúng tiến độ: ${who}.`]
}

function Answers({
  period,
  counter,
  def,
  pkgStatus,
}: {
  period: string
  counter: KpiCounter
  def: KpiMetricDef
  pkgStatus: KpiAllocationStatus | undefined
}) {
  const navigate = useNavigate()
  const resolve = useResolveKpiCounter(period)
  const [other, setOther] = useState('')
  const otherId = useId()
  const otherValue = parseTyped(def.unit, other)
  const unit = UNIT_WORD[def.unit]
  const reopens = pkgStatus === 'agreed'
  /* On an agreed package a change opens a new draft: the toast says so and leads there. */
  const run = (body: KpiCounterResolveBody, done: string) =>
    resolve.mutate(
      { counterId: counter.id, body },
      {
        onSuccess: () => {
          setOther('')
          if (!reopens || body.resolution === 'keep') return toastDone(done)
          toast(done, {
            tone: 'success',
            detail: 'Bản nháp mới đã mở, gửi duyệt lại để áp dụng.',
            action: {
              label: 'Mở phân bổ',
              onClick: () => navigate(`${ALLOCATE_PATH}${roleQuery(period, counter.role)}`),
            },
          })
        },
      },
    )
  const busy = resolve.isPending

  return (
    <div className="flex flex-col gap-3">
      {reopens && (
        <p className={NOTE}>Gói đã duyệt: đổi mức sẽ mở bản nháp mới, bạn gửi duyệt lại.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          className="pointer-coarse:h-12"
          disabled={busy}
          onClick={() => run({ resolution: 'accept' }, 'Đã đồng ý mức đề xuất')}
        >
          Đồng ý {printValue(def.unit, counter.proposed, true)}
        </Button>
        <Button
          variant="secondary"
          className="pointer-coarse:h-12"
          disabled={busy}
          onClick={() => run({ resolution: 'keep' }, 'Đã giữ mức cũ')}
        >
          Giữ {printValue(def.unit, counter.assigned, true)}
        </Button>
      </div>
      <label htmlFor={otherId} className="text-[12.5px] font-semibold">
        Mức khác
      </label>
      <div className="flex flex-wrap items-center gap-3">
        {/* The unit beside the box, not `suffix`: the suffix shell is fixed at 40px, under law 13's 48. */}
        <span className="flex items-center gap-2">
          <Input
            id={otherId}
            inputMode="decimal"
            className="pointer-coarse:h-12 tnum font-num w-48 text-right"
            value={other}
            invalid={otherValue === null}
            onChange={(e) => setOther(e.target.value)}
          />
          {unit && <span className={cn(NOTE, 'shrink-0')}>{unit}</span>}
        </span>
        <Button
          variant="secondary"
          className="pointer-coarse:h-12"
          disabled={busy || typeof otherValue !== 'number'}
          onClick={() =>
            typeof otherValue === 'number' &&
            run({ resolution: 'counter', value: otherValue }, 'Đã gửi mức khác cho người nhận')
          }
        >
          Đề nghị mức khác
        </Button>
      </div>
      <FailLine error={resolve.error} conflict={MOVED} />
    </div>
  )
}

/** Why the answers are not offered, in the order the server would refuse. */
function lockedReason(
  c: KpiCounter,
  print: (v: number) => string,
  closed: boolean,
  canSet: boolean,
  me: string | undefined,
) {
  if (c.status !== 'open') {
    const after = c.counterValue === null ? '' : ` · mức mới ${print(c.counterValue)}`
    return c.resolvedAt ? `Xử lý lúc ${dmhm(c.resolvedAt)}${after}` : null
  }
  if (closed) return 'Tháng đã kết thúc, không xử lý được nữa.'
  if (c.actorId === me) return 'Đề xuất của bạn cần quản lý khác xử lý.'
  if (!canSet) return 'Bạn không có quyền xử lý đề xuất.'
  return null
}

export function CounterDetail({
  period,
  counter,
  lastMonth,
  pkgStatus,
  closed,
  canSet,
  me,
}: {
  period: string
  counter: KpiCounter
  /** The holder's figure last month, from their line; `null` when not read. */
  lastMonth: number | null
  pkgStatus: KpiAllocationStatus | undefined
  closed: boolean
  canSet: boolean
  me: string | undefined
}) {
  const def = defOfCounter(counter)
  if (!def) return null
  const label = COUNTER_LABEL[counter.status]
  const open = counter.status === 'open'
  const print = (v: number) => printValue(def.unit, v)
  const locked = lockedReason(counter, print, closed, canSet, me)

  return (
    <GlassCard className={cn(TILE, 'gap-4')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="tnum font-num text-[15px] font-semibold leading-6">
            {headlineOf(counter, def)}
          </h3>
          <p className={cn(NOTE, 'tnum font-num')}>
            {ROLE_LABEL[counter.role]} · gửi lúc {dmhm(counter.createdAt)}
          </p>
        </div>
        <Badge tone={label.tone}>{label.text}</Badge>
      </div>
      <blockquote className="bg-surface-ink/5 rounded-md px-4 py-3 text-[13px] leading-5">
        {counter.reason}
      </blockquote>
      {lastMonth !== null && (
        <p className="flex flex-col gap-1">
          <span className={NOTE}>Tháng trước đạt</span>
          <span className={cn(FIGURE, 'text-[18px]')}>{print(lastMonth)}</span>
        </p>
      )}
      {open && (
        <div className="flex flex-col gap-1">
          {effectLines(counter, def).map((line) => (
            <p key={line} className="tnum font-num text-[12.5px] leading-5">
              {line}
            </p>
          ))}
        </div>
      )}
      {locked ? (
        <p className={cn(NOTE, 'tnum font-num')}>{locked}</p>
      ) : (
        <Answers period={period} counter={counter} def={def} pkgStatus={pkgStatus} />
      )}
    </GlassCard>
  )
}

export function ReturnedDetail({
  period,
  pkg,
  canFix,
}: {
  period: string
  pkg: KpiAllocation
  /** `kpi.set-target` on an open month. */
  canFix: boolean
}) {
  const navigate = useNavigate()
  return (
    <GlassCard className={cn(TILE, 'gap-4')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-[15px] font-semibold leading-6">
            {pkg.decidedBy?.name ?? 'Quản lý'} trả lại gói chỉ tiêu {ROLE_LABEL[pkg.role]}
          </h3>
          {pkg.decidedAt && <p className={cn(NOTE, 'tnum font-num')}>Lúc {dmhm(pkg.decidedAt)}</p>}
        </div>
        <Badge tone="danger">Bị trả lại</Badge>
      </div>
      <blockquote className="bg-surface-ink/5 rounded-md px-4 py-3 text-[13px] leading-5">
        {pkg.returnReason}
      </blockquote>
      {canFix && (
        <Button
          className="pointer-coarse:h-12 self-start"
          onClick={() => navigate(`${ALLOCATE_PATH}${roleQuery(period, pkg.role)}`)}
        >
          Mở phân bổ để sửa
        </Button>
      )}
    </GlassCard>
  )
}
