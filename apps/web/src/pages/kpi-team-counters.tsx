import { useId, useState } from 'react'
import { Badge, Button, GlassCard, Input, cn } from '@pv/ui'
import {
  type KpiAllocationStatus,
  type KpiCounter,
  type KpiCounterResolveBody,
  type KpiMetricDef,
} from '@pv/contracts'
import { toast, toastDone } from '@/app/toast'
import { message, useI18n } from '@/app/i18n'
import { useResolveTeamCounter } from '@/data/kpi-team-view'
import { ROLE_LABEL } from '@/data/users'
import { dmhm } from '@/lib/date'
import { NOTE, TILE } from './home-tiles'
import { COUNTER_LABEL, MOVED, defOfCounter, effectLines, headlineOf } from './kpi-allocate-model'
import { FailLine } from './kpi-allocate-parts'
import { UNIT_WORD, parseTyped, printValue } from './kpi-model'

/** The team's counter-proposals (ADR 0101 D6): a member asks for another
 *  value, the lead answers. The lead cannot answer their own; the head does,
 *  on the targets screen. Open ones come first, oldest first.
 *
 *  Own copy of the counter drawer's answers (`kpi-counter-detail`): that one
 *  posts to the head's door and locks for anyone without `kpi.set-target`.
 *  Every figure is the server's. */

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
  const { t } = useI18n()
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
        <p className={NOTE}>
          {t(
            message(
              'Gói đã duyệt: đổi mức sẽ mở bản nháp mới, bạn gửi duyệt lại.',
              'This package is approved. Changing the value opens a new draft for review.',
              '승인된 패키지입니다. 값을 변경하면 새 초안이 열리며 다시 검토를 요청해야 합니다.',
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

/** Why there are no answers under a counter, or `null` when there is nothing to say. */
function noteOf(
  c: KpiCounter,
  def: KpiMetricDef,
  closed: boolean,
  me: string | undefined,
  lang: 'vi' | 'en' | 'ko',
) {
  if (c.status !== 'open') {
    if (!c.resolvedAt) return null
    const after =
      c.counterValue === null
        ? ''
        : lang === 'vi'
          ? ` · mức mới ${printValue(def.unit, c.counterValue)}`
          : lang === 'en'
            ? ` · new value ${printValue(def.unit, c.counterValue)}`
            : ` · 새 값 ${printValue(def.unit, c.counterValue)}`
    return `${lang === 'vi' ? 'Xử lý lúc' : lang === 'en' ? 'Resolved' : '처리'} ${dmhm(c.resolvedAt)}${after}`
  }
  if (closed)
    return lang === 'vi'
      ? 'Tháng đã kết thúc, không xử lý được nữa.'
      : lang === 'en'
        ? 'This month is closed. This proposal can no longer be resolved.'
        : '월이 마감되어 이 제안을 더 이상 처리할 수 없습니다.'
  return c.actorId === me
    ? lang === 'vi'
      ? 'Quản lý xử lý đề xuất của bạn.'
      : lang === 'en'
        ? 'A manager is reviewing your proposal.'
        : '관리자가 제안을 검토하고 있습니다.'
    : null
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
  const { t, lang } = useI18n()
  const def = defOfCounter(counter)
  if (!def) return null
  const originalLabel = COUNTER_LABEL[counter.status]
  const label = {
    ...originalLabel,
    text: t(
      message(
        originalLabel.text,
        counter.status === 'open'
          ? 'Pending'
          : counter.status === 'accepted'
            ? 'Accepted'
            : counter.status === 'kept'
              ? 'Kept current'
              : 'Countered',
        counter.status === 'open'
          ? '대기 중'
          : counter.status === 'accepted'
            ? '수락됨'
            : counter.status === 'kept'
              ? '현재 값 유지'
              : '다른 값 제안',
      ),
    ),
  }
  const note = noteOf(counter, def, closed, me, lang)
  const open = counter.status === 'open'

  return (
    <GlassCard className={cn(TILE, 'gap-4')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="tnum font-num text-[15px] font-semibold leading-6">
            {headlineOf(counter, def)}
          </h3>
          <p className={cn(NOTE, 'tnum font-num')}>
            {t(
              message(
                `${ROLE_LABEL[counter.role]} · gửi lúc ${dmhm(counter.createdAt)}`,
                `${ROLE_LABEL[counter.role]} · sent ${dmhm(counter.createdAt)}`,
                `${ROLE_LABEL[counter.role]} · ${dmhm(counter.createdAt)} 제출`,
              ),
            )}
          </p>
        </div>
        <Badge tone={label.tone}>{label.text}</Badge>
      </div>
      <p className="text-[13px] leading-5">
        {t(message('Lý do:', 'Reason:', '사유:'))} {counter.reason}
      </p>
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
  const { t } = useI18n()
  if (counters.length === 0)
    return (
      <p className={NOTE}>
        {t(
          message(
            'Tháng này nhóm chưa có đề xuất nào.',
            'The team has no proposals this month.',
            '이번 달 팀 제안이 없습니다.',
          ),
        )}
      </p>
    )
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
