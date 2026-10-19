import { useId, useState } from 'react'
import { Badge, Button, GlassCard, Input, cn } from '@pv/ui'
import {
  KPI_METRIC_LABEL,
  type KpiAllocationStatus,
  type KpiCounter,
  type KpiCounterResolveBody,
  type KpiMetricDef,
} from '@pv/contracts'
import { toast, toastDone } from '@/app/toast'
import { useResolveTeamCounter } from '@/data/kpi-team-view'
import { ROLE_LABEL } from '@/data/users'
import { dmhm } from '@/lib/date'
import { NOTE, TILE } from './home-tiles'
import { COUNTER_LABEL, MOVED, defOfCounter } from './kpi-allocate-model'
import { FailLine } from './kpi-allocate-parts'
import { UNIT_WORD, parseTyped, printValue } from './kpi-model'

/** The team's counter-proposals (ADR 0101 D6): a member asks for another
 *  value, the lead answers. The lead cannot answer their own; the head does,
 *  on the proposals screen. Open ones come first, oldest first.
 *
 *  Own copy of the proposals pane: that one posts to the head's door and
 *  locks for anyone without `kpi.set-target`. Every figure is the server's. */

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

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
  if (allocatedAfter === null) return ['Chỉ số này không cộng dồn, tổng của nhóm không đổi.']
  const after = `Tổng sau khi đồng ý: ${print(allocatedAfter)}`
  if (roleTarget === null) return [`${after}.`]
  if (allocatedAfter > roleTarget) {
    return [`${after} · thừa ${print(allocatedAfter - roleTarget)} so với phần của nhóm.`]
  }
  if (!shortfall) return [`${after} · vẫn khớp phần của nhóm.`]
  const gap = `${after} · thiếu ${print(shortfall)} so với phần của nhóm.`
  if (compensators.length === 0) return [gap, 'Chưa có ai đúng tiến độ để bù phần thiếu.']
  const who = compensators.map((p) => `${p.name} thêm ${print(p.delta)}`).join(' · ')
  return [gap, `Gợi ý bù từ người đang đúng tiến độ: ${who}.`]
}

function Answers({
  period,
  teamId,
  counter,
  def,
  reopens,
}: {
  period: string
  teamId: string
  counter: KpiCounter
  def: KpiMetricDef
  /** The package is agreed: changing the level opens a new draft. */
  reopens: boolean
}) {
  const resolve = useResolveTeamCounter(period, teamId)
  const [other, setOther] = useState('')
  const otherId = useId()
  const otherValue = parseTyped(def.unit, other)
  const unit = UNIT_WORD[def.unit]
  const busy = resolve.isPending
  const run = (body: KpiCounterResolveBody, done: string) =>
    resolve.mutate(
      { counterId: counter.id, body },
      {
        onSuccess: () => {
          setOther('')
          if (!reopens || body.resolution === 'keep') return toastDone(done)
          toast(done, { tone: 'success', detail: 'Bản nháp mới đã mở, chia lại rồi gửi duyệt.' })
        },
      },
    )

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

/** Why there are no answers under a counter, or `null` when there is nothing to say. */
function noteOf(c: KpiCounter, def: KpiMetricDef, closed: boolean, me: string | undefined) {
  if (c.status !== 'open') {
    if (!c.resolvedAt) return null
    const after =
      c.counterValue === null ? '' : ` · mức mới ${printValue(def.unit, c.counterValue)}`
    return `Xử lý lúc ${dmhm(c.resolvedAt)}${after}`
  }
  if (closed) return 'Tháng đã kết thúc, không xử lý được nữa.'
  return c.actorId === me ? 'Quản lý xử lý đề xuất của bạn ở màn Xử lý đề xuất.' : null
}

function CounterCard({
  period,
  teamId,
  counter,
  pkgStatus,
  may,
  closed,
  me,
}: {
  period: string
  teamId: string
  counter: KpiCounter
  pkgStatus: KpiAllocationStatus | undefined
  /** The reader leads this team. */
  may: boolean
  closed: boolean
  me: string | undefined
}) {
  const def = defOfCounter(counter)
  if (!def) return null
  const label = COUNTER_LABEL[counter.status]
  const note = noteOf(counter, def, closed, me)
  const open = counter.status === 'open'

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
      <p className="text-[13px] leading-5">Lý do: {counter.reason}</p>
      {open && (
        <div className="flex flex-col gap-1">
          {effectLines(counter, def).map((line) => (
            <p key={line} className="tnum font-num text-[12.5px] leading-5">
              {line}
            </p>
          ))}
        </div>
      )}
      {note && <p className={cn(NOTE, 'tnum font-num')}>{note}</p>}
      {open && !closed && may && counter.actorId !== me && (
        <Answers
          period={period}
          teamId={teamId}
          counter={counter}
          def={def}
          reopens={pkgStatus === 'agreed'}
        />
      )}
    </GlassCard>
  )
}

export function TeamCounters({
  period,
  teamId,
  counters,
  statusOf,
  may,
  closed,
  me,
}: {
  period: string
  teamId: string
  counters: readonly KpiCounter[]
  /** The status of the team's package for a role. */
  statusOf: (role: KpiCounter['role']) => KpiAllocationStatus | undefined
  may: boolean
  closed: boolean
  me: string | undefined
}) {
  if (counters.length === 0) return <p className={NOTE}>Tháng này nhóm chưa có đề xuất nào.</p>
  const open = counters
    .filter((c) => c.status === 'open')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const settled = counters
    .filter((c) => c.status !== 'open')
    .sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''))
  return (
    <div className="flex flex-col gap-4">
      {[...open, ...settled].map((c) => (
        <CounterCard
          key={c.id}
          period={period}
          teamId={teamId}
          counter={c}
          pkgStatus={statusOf(c.role)}
          may={may}
          closed={closed}
          me={me}
        />
      ))}
    </div>
  )
}
