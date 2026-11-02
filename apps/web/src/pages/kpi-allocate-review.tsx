import { useState } from 'react'
import { Button, GlassCard, Textarea, cn } from '@pv/ui'
import {
  KpiAllocationDecideBody,
  type KpiAllocation,
  type KpiCounter,
  type RoleId,
} from '@pv/contracts'
import { kpiMetricText } from '@/data/kpi-i18n'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { StackTable, type StackColumn } from '@/components/stack-table'
import { useDecideKpiAllocation } from '@/data/kpi-allocation'
import { dmhm } from '@/lib/date'
import { NOTE, TILE } from './home-tiles'
import { missedDueOf } from './kpi-allocate-model'
import { AckCounts, FailLine } from './kpi-allocate-parts'
import type { Recipient } from './kpi-allocate-table'

/** What happens after a package is sent: each holder's answer, the second
 *  manager's decision, and a returned package's reason.
 *
 *  A holder's answer is counted per state across their lines in the role, so
 *  two confirmed lines and one accepted by default never read as one state
 *  (ADR 0114). A lapsed line is answered: the head's level applies. */

/** `KpiAllocationDecideBody`'s ceiling on a return reason. */
const REASON_MAX = KpiAllocationDecideBody.options[1].shape.reason.maxLength ?? undefined

/** Beside the per-answer badges: what was countered, else which deadline was
 *  missed, else when the last line was confirmed. */
function detailOf(lines: KpiAllocation['lines'], t: ReturnType<typeof useI18n>['t']): string {
  const countered = lines.filter((l) => l.ackState === 'countered')
  if (countered.length > 0) return countered.map((l) => kpiMetricText(l.metricKey)).join(', ')
  const missed = [...new Set(lines.flatMap((l) => missedDueOf(l) ?? []))]
  if (missed.length > 0)
    return t(
      message(
        `Quá hạn trả lời: ${missed.join(', ')}`,
        `Response deadline passed: ${missed.join(', ')}`,
        `응답 기한 경과: ${missed.join(', ')}`,
      ),
    )
  if (!lines.every((l) => l.ackState === 'acknowledged')) return ''
  const last = lines
    .flatMap((l) => (l.ackedAt ? [l.ackedAt] : []))
    .sort()
    .at(-1)
  return last
    ? t(message(`Lúc ${dmhm(last)}`, `Responded ${dmhm(last)}`, `${dmhm(last)} 응답`))
    : ''
}

export function AnswersBlock({
  pkg,
  holders,
  counters,
  onOpenCounters,
}: {
  pkg: KpiAllocation
  holders: readonly Recipient[]
  /** The package's counters this month, any status. */
  counters: readonly KpiCounter[]
  /** Opens the holder's counters on this package. */
  onOpenCounters: (actorId: string) => void
}) {
  const { t } = useI18n()
  const columns: StackColumn[] = [
    { header: t(message('Người nhận', 'Recipient', '수신자')), width: 'minmax(0,1.2fr)' },
    { header: t(message('Trạng thái', 'Status', '상태')), width: 'minmax(0,1fr)' },
    {
      header: t(message('Chi tiết', 'Details', '세부 정보')),
      width: 'minmax(0,2fr)',
      stack: 'action',
    },
  ]
  const rows = holders.flatMap((h) => {
    const lines = pkg.lines.filter((l) => l.actorId === h.actorId)
    return lines.length > 0 ? [{ holder: h, lines, detail: detailOf(lines, t) }] : []
  })
  const asked = new Set(counters.map((c) => c.actorId))

  return (
    <GlassCard variant="b" className="py-2 max-md:py-4">
      <StackTable
        from="md"
        flush
        rowHeight="min-h-12 py-2"
        tableClassName="min-w-xl"
        columns={columns}
        rows={rows.map(({ holder, lines, detail }) => ({
          id: holder.actorId,
          cells: [
            <span key="who" className="truncate font-semibold">
              {holder.name}
            </span>,
            <AckCounts key="state" lines={lines} />,
            <span key="detail" className="flex min-w-0 flex-wrap items-center gap-3">
              <span className={cn(NOTE, 'tnum font-num')}>{detail}</span>
              {asked.has(holder.actorId) && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="pointer-coarse:h-12 ml-auto"
                  onClick={() => onOpenCounters(holder.actorId)}
                >
                  {t(message('Xem đề xuất', 'View proposal', '제안 보기'))}
                </Button>
              )}
            </span>,
          ],
        }))}
      />
    </GlassCard>
  )
}

/** Agree or return. Shown to a `kpi.set-target` holder only; the sender reads
 *  why they cannot, because the server refuses them anyway. Works on either
 *  tier: a team package carries its own team. */
export function DecideBlock({
  period,
  role,
  pkg,
  me,
}: {
  period: string
  role: RoleId
  pkg: KpiAllocation
  me: string | undefined
}) {
  const { t } = useI18n()
  const decide = useDecideKpiAllocation(period, role)
  const [reason, setReason] = useState('')
  /* A team package is decided through the same door, told apart by its team. */
  const tier = pkg.team ? { teamId: pkg.team.id } : {}

  if (pkg.submittedBy?.actorId === me) {
    return (
      <GlassCard className={TILE}>
        <p className={NOTE}>
          {t(
            message(
              'Gói này cần quản lý khác duyệt.',
              'This package must be approved by another manager.',
              '이 패키지는 다른 관리자가 승인해야 합니다.',
            ),
          )}
        </p>
      </GlassCard>
    )
  }

  const trimmed = reason.trim()
  return (
    <GlassCard className={TILE}>
      <label className="flex flex-col gap-2">
        <span className="text-[12.5px] font-semibold">
          {t(message('Lý do trả lại', 'Reason for return', '반려 사유'))}
        </span>
        <Textarea
          rows={2}
          autoGrow
          maxLength={REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t(
            message('Bắt buộc khi trả lại', 'Required when returning', '반려 시 필수'),
          )}
        />
      </label>
      <FailLine error={decide.error} />
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          variant="secondary"
          className="pointer-coarse:h-12"
          disabled={trimmed === '' || decide.isPending}
          onClick={() =>
            decide.mutate(
              { decision: 'return', reason: trimmed, ...tier },
              {
                onSuccess: () => {
                  setReason('')
                  toastDone(
                    t(
                      message(
                        'Đã trả lại gói chỉ tiêu',
                        'Target package returned',
                        '목표 패키지를 반려했습니다',
                      ),
                    ),
                  )
                },
              },
            )
          }
        >
          {t(message('Trả lại để sửa', 'Return for changes', '수정 요청'))}
        </Button>
        <Button
          className="pointer-coarse:h-12"
          disabled={decide.isPending}
          onClick={() =>
            decide.mutate(
              { decision: 'agree', ...tier },
              {
                onSuccess: () =>
                  toastDone(
                    t(
                      message(
                        'Đã duyệt và khoá chỉ tiêu',
                        'Targets approved and locked',
                        '목표를 승인하고 확정했습니다',
                      ),
                    ),
                  ),
              },
            )
          }
        >
          {t(message('Duyệt và khoá chỉ tiêu', 'Approve and lock targets', '목표 승인 및 확정'))}
        </Button>
      </div>
    </GlassCard>
  )
}

/** The reason a package came back, and the way into a new version of it. */
export function ReturnedNote({
  pkg,
  onEdit,
}: {
  pkg: KpiAllocation
  /** Absent: the reader may not split, or the month is closed. */
  onEdit?: () => void
}) {
  const { t } = useI18n()
  return (
    <GlassCard className={TILE}>
      <p className="text-[12.5px] font-semibold">
        {t(message('Lý do trả lại', 'Reason for return', '반려 사유'))}
      </p>
      <p className="text-[13px] leading-5">{pkg.returnReason}</p>
      {onEdit && (
        <Button variant="secondary" className="pointer-coarse:h-12 self-start" onClick={onEdit}>
          {t(message('Sửa phân bổ', 'Edit allocation', '배분 수정'))}
        </Button>
      )}
    </GlassCard>
  )
}
