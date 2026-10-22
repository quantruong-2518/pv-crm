import { useState } from 'react'
import { Button, GlassCard, Textarea, cn } from '@pv/ui'
import {
  KPI_METRIC_LABEL,
  KpiAllocationDecideBody,
  type KpiAllocation,
  type KpiCounter,
  type RoleId,
} from '@pv/contracts'
import { toastDone } from '@/app/toast'
import { StackTable, type StackColumn } from '@/components/stack-table'
import { useDecideKpiAllocation } from '@/data/kpi-allocation'
import { dmhm } from '@/lib/date'
import { NOTE, TILE } from './home-tiles'
import { missedDueOf, missedText } from './kpi-allocate-model'
import { AckCounts, FailLine } from './kpi-allocate-parts'
import type { Recipient } from './kpi-allocate-table'

/** What happens after a package is sent: each holder's answer, the second
 *  manager's decision, and a returned package's reason.
 *
 *  A holder's answer is counted per state across their lines in the role, so
 *  two confirmed lines and one accepted by default never read as one state
 *  (ADR 0114). A lapsed line is answered: the head's level applies. */

const COLUMNS: StackColumn[] = [
  { header: 'Người nhận', width: 'minmax(0,1.2fr)' },
  { header: 'Trạng thái', width: 'minmax(0,1fr)' },
  { header: 'Chi tiết', width: 'minmax(0,2fr)', stack: 'action' },
]

/** `KpiAllocationDecideBody`'s ceiling on a return reason. */
const REASON_MAX = KpiAllocationDecideBody.options[1].shape.reason.maxLength ?? undefined

/** Beside the per-answer badges: what was countered, else which deadline was
 *  missed, else when the last line was confirmed. */
function detailOf(lines: KpiAllocation['lines']): string {
  const countered = lines.filter((l) => l.ackState === 'countered')
  if (countered.length > 0) return countered.map((l) => KPI_METRIC_LABEL[l.metricKey]).join(', ')
  const missed = [...new Set(lines.flatMap((l) => missedDueOf(l) ?? []))]
  if (missed.length > 0) return missedText(missed)
  if (!lines.every((l) => l.ackState === 'acknowledged')) return ''
  const last = lines
    .flatMap((l) => (l.ackedAt ? [l.ackedAt] : []))
    .sort()
    .at(-1)
  return last ? `Lúc ${dmhm(last)}` : ''
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
  const rows = holders.flatMap((h) => {
    const lines = pkg.lines.filter((l) => l.actorId === h.actorId)
    return lines.length > 0 ? [{ holder: h, lines, detail: detailOf(lines) }] : []
  })
  const asked = new Set(counters.map((c) => c.actorId))

  return (
    <GlassCard variant="b" className="py-2 max-md:py-4">
      <StackTable
        from="md"
        flush
        rowHeight="min-h-12 py-2"
        tableClassName="min-w-xl"
        columns={COLUMNS}
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
                  Xem đề xuất
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
  const decide = useDecideKpiAllocation(period, role)
  const [reason, setReason] = useState('')
  /* A team package is decided through the same door, told apart by its team. */
  const tier = pkg.team ? { teamId: pkg.team.id } : {}

  if (pkg.submittedBy?.actorId === me) {
    return (
      <GlassCard className={TILE}>
        <p className={NOTE}>Gói này cần quản lý khác duyệt.</p>
      </GlassCard>
    )
  }

  const trimmed = reason.trim()
  return (
    <GlassCard className={TILE}>
      <label className="flex flex-col gap-2">
        <span className="text-[12.5px] font-semibold">Lý do trả lại</span>
        <Textarea
          rows={2}
          autoGrow
          maxLength={REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Bắt buộc khi trả lại"
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
                  toastDone('Đã trả lại gói chỉ tiêu')
                },
              },
            )
          }
        >
          Trả lại để sửa
        </Button>
        <Button
          className="pointer-coarse:h-12"
          disabled={decide.isPending}
          onClick={() =>
            decide.mutate(
              { decision: 'agree', ...tier },
              { onSuccess: () => toastDone('Đã duyệt và khoá chỉ tiêu') },
            )
          }
        >
          Duyệt và khoá chỉ tiêu
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
  return (
    <GlassCard className={TILE}>
      <p className="text-[12.5px] font-semibold">Lý do trả lại</p>
      <p className="text-[13px] leading-5">{pkg.returnReason}</p>
      {onEdit && (
        <Button variant="secondary" className="pointer-coarse:h-12 self-start" onClick={onEdit}>
          Sửa phân bổ
        </Button>
      )}
    </GlassCard>
  )
}
