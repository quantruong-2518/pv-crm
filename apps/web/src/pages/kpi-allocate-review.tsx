import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, DataTable, GlassCard, Textarea, cn, type TableColumn } from '@pv/ui'
import {
  KPI_METRIC_LABEL,
  KpiAllocationDecideBody,
  type KpiAckState,
  type KpiAllocation,
  type RoleId,
} from '@pv/contracts'
import { toastDone } from '@/app/toast'
import { useDecideKpiAllocation } from '@/data/kpi-allocation'
import { dm, dmhm } from '@/lib/date'
import { NOTE, TILE } from './home-tiles'
import { ACK_LABEL, PROPOSALS_PATH, monthQuery } from './kpi-allocate-model'
import { FailLine } from './kpi-allocate-parts'
import type { Recipient } from './kpi-allocate-table'

/** What happens after a package is sent: each holder's answer, the second
 *  manager's decision, and a returned package's reason.
 *
 *  A holder's answer is read across all their lines in the role: one counter
 *  outweighs any confirmation, and "received" needs every line confirmed or
 *  lapsed (the head's level applies once the deadline passes). */

const COLUMNS: TableColumn[] = [
  { header: 'Người nhận', width: 'minmax(0,1.2fr)' },
  { header: 'Trạng thái', width: 'minmax(0,1fr)' },
  { header: 'Chi tiết', width: 'minmax(0,2fr)' },
]

/** `KpiAllocationDecideBody`'s ceiling on a return reason. */
const REASON_MAX = KpiAllocationDecideBody.options[1].shape.reason.maxLength ?? undefined

type Answer = { status: KpiAckState; detail: string }

function answerOf(lines: KpiAllocation['lines'], dueOn: KpiAllocation['ackDueOn']): Answer {
  const countered = lines.filter((l) => l.ackState === 'countered')
  if (countered.length > 0) {
    const names = countered.map((l) => KPI_METRIC_LABEL[l.metricKey]).join(', ')
    return { status: 'countered', detail: names }
  }
  const stamps = lines.flatMap((l) => (l.ackedAt ? [l.ackedAt] : [])).sort()
  const settled = (l: KpiAllocation['lines'][number]) =>
    l.ackState === 'acknowledged' || l.ackState === 'lapsed'
  if (lines.length > 0 && lines.every(settled)) {
    if (lines.some((l) => l.ackState === 'lapsed')) {
      return { status: 'lapsed', detail: dueOn ? `Hạn trả lời: ${dm(dueOn)}` : '' }
    }
    const last = stamps[stamps.length - 1]
    return { status: 'acknowledged', detail: last ? `Lúc ${dmhm(last)}` : '' }
  }
  return { status: 'pending', detail: '' }
}

export function AnswersBlock({
  period,
  pkg,
  holders,
}: {
  period: string
  pkg: KpiAllocation
  holders: readonly Recipient[]
}) {
  const navigate = useNavigate()
  const rows = holders.flatMap((h) => {
    const lines = pkg.lines.filter((l) => l.actorId === h.actorId)
    return lines.length > 0 ? [{ holder: h, answer: answerOf(lines, pkg.ackDueOn) }] : []
  })
  const open = rows.filter((r) => r.answer.status === 'countered').length

  return (
    <GlassCard variant="b" className="flex flex-col gap-3 py-4">
      {open > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5">
          <p className="text-[12.5px] font-semibold">{open} người đề xuất mức khác.</p>
          <Button
            variant="secondary"
            className="pointer-coarse:h-12"
            onClick={() => navigate(`${PROPOSALS_PATH}${monthQuery(period)}`)}
          >
            Mở danh sách đề xuất
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <DataTable
          flush
          rowHeight="min-h-12 py-2"
          className="min-w-xl"
          columns={COLUMNS}
          rows={rows.map(({ holder, answer }) => ({
            id: holder.actorId,
            cells: [
              <span key="who" className="truncate font-semibold">
                {holder.name}
              </span>,
              <Badge key="state" tone={ACK_LABEL[answer.status].tone}>
                {ACK_LABEL[answer.status].text}
              </Badge>,
              <span key="detail" className={cn(NOTE, 'tnum font-num')}>
                {answer.detail}
              </span>,
            ],
          }))}
        />
      </div>
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
