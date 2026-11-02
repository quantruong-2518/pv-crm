import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Drawer, Input, cn } from '@pv/ui'
import type {
  KpiAllocation,
  KpiAllocationStatus,
  KpiCounter,
  KpiCounterResolveBody,
  KpiMetricDef,
  RoleId,
} from '@pv/contracts'
import { message, translate, useI18n, type Message } from '@/app/i18n'
import { toast, toastDone } from '@/app/toast'
import { useResolveKpiCounter } from '@/data/kpi-allocation'
import { kpiRoleText } from '@/data/kpi-i18n'
import { dmhm } from '@/lib/date'
import { NOTE } from './home-tiles'
import {
  COUNTER_LABEL,
  MOVED,
  defOfCounter,
  effectLines,
  headlineOf,
  teamPath,
  teamSuffix,
} from './kpi-allocate-model'
import { FailLine } from './kpi-allocate-parts'
import { UNIT_WORD, parseTyped, printValue } from './kpi-model'

/** One holder's counters on one package, opened in a drawer from the targets screen.
 *
 *  A counter opens on what happened, then the reason in the holder's words,
 *  last month's actual (the assigned and proposed values are already in the
 *  headline and on the buttons), what accepting would do to the split, and the
 *  three answers. Every figure is the server's. Only an open counter carries
 *  its "from": once settled, `assigned` reads the line as it now stands. */

const FIGURE = 'tnum font-num font-semibold'

/** A change on an agreed package opens a new draft: the toast says so, and a team's leads to its page. */
function toastReopened(
  done: string,
  team: KpiCounter['team'],
  period: string,
  navigate: (to: string) => void,
  t: (copy: Message) => string,
) {
  if (!team) {
    const detail = message(
      'Bản nháp mới đã mở, gửi duyệt lại để áp dụng.',
      'A new draft is open. Submit it again to apply the change.',
      '새 초안이 열렸습니다. 적용하려면 다시 승인 요청을 보내세요.',
    )
    return toastDone(done, t(detail))
  }
  toast(done, {
    tone: 'success',
    detail: t(
      message(
        'Bản nháp mới đã mở. Trưởng nhóm chia lại rồi gửi duyệt.',
        'A new draft is open. The team lead splits again, then submits for approval.',
        '새 초안이 열렸습니다. 팀장이 다시 배분한 후 승인 요청을 보냅니다.',
      ),
    ),
    action: {
      label: t(message('Mở trang nhóm', 'Open team page', '팀 페이지 열기')),
      onClick: () => navigate(teamPath(team.id, period)),
    },
  })
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
  const { t } = useI18n()
  const navigate = useNavigate()
  const resolve = useResolveKpiCounter(period)
  const [other, setOther] = useState('')
  const otherId = useId()
  const otherValue = parseTyped(def.unit, other)
  const unit = UNIT_WORD[def.unit]
  const reopens = pkgStatus === 'agreed'
  const team = counter.team
  /* On an agreed package a change opens a new draft: the toast says so, and a team's leads to its page. */
  const run = (body: KpiCounterResolveBody, done: string) =>
    resolve.mutate(
      { counterId: counter.id, body },
      {
        onSuccess: () => {
          setOther('')
          if (!reopens || body.resolution === 'keep') return toastDone(done)
          toastReopened(done, team, period, navigate, t)
        },
      },
    )
  const busy = resolve.isPending

  return (
    <div className="flex flex-col gap-3">
      {reopens && (
        <p className={NOTE}>
          {t(
            team
              ? message(
                  'Gói đã duyệt: đổi mức sẽ mở bản nháp mới. Trưởng nhóm chia lại rồi gửi duyệt.',
                  'This package is approved. Changing the value opens a new draft that the team lead splits again and submits.',
                  '승인된 패키지입니다. 값을 변경하면 새 초안이 열리며 팀장이 다시 배분하고 승인 요청을 보냅니다.',
                )
              : message(
                  'Gói đã duyệt: đổi mức sẽ mở bản nháp mới, bạn gửi duyệt lại.',
                  'This package is approved. Changing the value opens a new draft that you submit again.',
                  '승인된 패키지입니다. 값을 변경하면 새 초안이 열리며 다시 승인 요청을 보내야 합니다.',
                ),
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          className="pointer-coarse:h-12"
          disabled={busy}
          onClick={() =>
            run(
              { resolution: 'accept' },
              t(
                message(
                  'Đã đồng ý mức đề xuất',
                  'Accepted the proposed value',
                  '제안된 값을 수락했습니다',
                ),
              ),
            )
          }
        >
          {t(
            message(
              `Đồng ý ${printValue(def.unit, counter.proposed, true)}`,
              `Accept ${printValue(def.unit, counter.proposed, true)}`,
              `${printValue(def.unit, counter.proposed, true)} 수락`,
            ),
          )}
        </Button>
        <Button
          variant="secondary"
          className="pointer-coarse:h-12"
          disabled={busy}
          onClick={() =>
            run(
              { resolution: 'keep' },
              t(message('Đã giữ mức cũ', 'Kept the current value', '현재 값을 유지했습니다')),
            )
          }
        >
          {t(
            message(
              `Giữ ${printValue(def.unit, counter.assigned, true)}`,
              `Keep ${printValue(def.unit, counter.assigned, true)}`,
              `${printValue(def.unit, counter.assigned, true)} 유지`,
            ),
          )}
        </Button>
      </div>
      <label htmlFor={otherId} className="text-[12.5px] font-semibold">
        {t(message('Mức khác', 'Different value', '다른 값'))}
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
            run(
              { resolution: 'counter', value: otherValue },
              t(
                message(
                  'Đã gửi mức khác cho người nhận',
                  'Sent a different value to the recipient',
                  '수신자에게 다른 값을 전달했습니다',
                ),
              ),
            )
          }
        >
          {t(message('Đề nghị mức khác', 'Propose a different value', '다른 값 제안'))}
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
    if (!c.resolvedAt) return null
    const at = dmhm(c.resolvedAt)
    const to = c.counterValue === null ? '' : print(c.counterValue)
    const done = message(`Xử lý lúc ${at}`, `Resolved ${at}`, `${at} 처리`)
    const after =
      c.counterValue === null
        ? message('', '', '')
        : message(` · mức mới ${to}`, ` · new value ${to}`, ` · 새 값 ${to}`)
    return translate(message(done.vi + after.vi, done.en + after.en, done.ko + after.ko))
  }
  if (closed) {
    return translate(
      message(
        'Tháng đã kết thúc, không xử lý được nữa.',
        'This month is closed. This proposal can no longer be resolved.',
        '월이 마감되어 이 제안을 더 이상 처리할 수 없습니다.',
      ),
    )
  }
  if (c.actorId === me) {
    return translate(
      message(
        'Đề xuất của bạn cần quản lý khác xử lý.',
        'Your proposal needs another manager to resolve it.',
        '내 제안은 다른 관리자가 처리해야 합니다.',
      ),
    )
  }
  if (!canSet) {
    return translate(
      message(
        'Bạn không có quyền xử lý đề xuất.',
        'You do not have permission to resolve proposals.',
        '제안을 처리할 권한이 없습니다.',
      ),
    )
  }
  return null
}

function CounterDetail({
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
  const { t } = useI18n()
  const def = defOfCounter(counter)
  if (!def) return null
  const label = COUNTER_LABEL[counter.status]
  const print = (v: number) => printValue(def.unit, v)
  const locked = lockedReason(counter, print, closed, canSet, me)

  return (
    <section className="flex min-w-0 flex-col gap-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="tnum font-num text-[15px] font-semibold leading-6">
            {headlineOf(counter, def, false)}
          </h3>
          <p className={cn(NOTE, 'tnum font-num')}>
            {t(
              message(
                `Gửi lúc ${dmhm(counter.createdAt)}`,
                `Sent ${dmhm(counter.createdAt)}`,
                `${dmhm(counter.createdAt)} 제출`,
              ),
            )}
          </p>
        </div>
        <Badge tone={label.tone}>{label.text}</Badge>
      </div>
      <blockquote className="bg-surface-ink/5 rounded-md px-4 py-3 text-[13px] leading-5">
        {counter.reason}
      </blockquote>
      {lastMonth !== null && (
        <p className="flex flex-col gap-1">
          <span className={NOTE}>
            {t(message('Tháng trước đạt', 'Last month’s actual', '지난달 달성'))}
          </span>
          <span className={cn(FIGURE, 'text-[18px]')}>{print(lastMonth)}</span>
        </p>
      )}
      {counter.status === 'open' && (
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
    </section>
  )
}

/** Whose counters the drawer shows: one holder on one package (a role, and a team or the room). */
export type CounterOwner = { actorId: string; role: RoleId; teamId: string | null }

const onPackage = (c: { role: RoleId; team: { id: string } | null }, who: CounterOwner) =>
  c.role === who.role && (c.team?.id ?? null) === who.teamId

/** Open counters first, oldest first; then the settled ones, latest first. */
function ownedBy(counters: readonly KpiCounter[], who: CounterOwner): KpiCounter[] {
  const own = counters.filter((c) => c.actorId === who.actorId && onPackage(c, who))
  const open = own.filter((c) => c.status === 'open')
  const settled = own.filter((c) => c.status !== 'open')
  open.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  settled.sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''))
  return [...open, ...settled]
}

export function CounterDrawer({
  who,
  onClose,
  period,
  counters,
  packages,
  closed,
  canSet,
  me,
}: {
  /** `null`: the drawer is shut. */
  who: CounterOwner | null
  onClose: () => void
  period: string
  /** The month's counters, every holder and package. */
  counters: readonly KpiCounter[]
  packages: readonly KpiAllocation[]
  closed: boolean
  canSet: boolean
  me: string | undefined
}) {
  const { t } = useI18n()
  const list = who ? ownedBy(counters, who) : []
  const pkg = who ? packages.find((a) => onPackage(a, who)) : undefined
  const lastMonthOf = (c: KpiCounter) =>
    pkg?.lines.find((l) => l.actorId === c.actorId && l.metricKey === c.metricKey)?.lastMonth ??
    null
  const first = list[0]

  return (
    <Drawer
      open={first !== undefined}
      onClose={onClose}
      title={
        first
          ? t(
              message(
                `Đề xuất của ${first.name}`,
                `Proposals from ${first.name}`,
                `${first.name}의 제안`,
              ),
            )
          : ''
      }
      subtitle={first ? `${kpiRoleText(first.role)}${teamSuffix(first.team)}` : undefined}
    >
      {/* Plain sections, not cards: a white card on the white drawer of the light theme vanishes. */}
      <div className="divide-surface-ink/6 flex flex-col divide-y">
        {list.map((c) => (
          <CounterDetail
            key={c.id}
            period={period}
            counter={c}
            lastMonth={lastMonthOf(c)}
            pkgStatus={pkg?.status}
            closed={closed}
            canSet={canSet}
            me={me}
          />
        ))}
      </div>
    </Drawer>
  )
}
